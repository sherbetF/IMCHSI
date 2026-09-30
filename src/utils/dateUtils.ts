/**
 * Utility functions for formatting and parsing dates consistently as DD/MM/YYYY.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Returns local date-time string formatted as "DD/MM/YYYY HH:mm".
 */
export function getLocalDateTimeString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Returns local date-only string formatted as "DD/MM/YYYY".
 */
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${day}/${month}/${year}`;
}

/**
 * Formats a raw date or timestamp string into a clean "DD/MM/YYYY" string.
 */
export function formatDisplayDateOnly(dateStr?: string): string {
  if (!dateStr || dateStr === "----------") return dateStr || "";
  const trimmed = dateStr.trim();

  // If input has time attached, extract date part
  const datePart = trimmed.split(" @ ")[0].split(" ")[0];

  // Already DD/MM/YYYY or D/M/YYYY
  const dmyMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${pad(Number(d))}/${pad(Number(m))}/${y}`;
  }

  // YYYY-MM-DD
  const ymdMatch = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${pad(Number(d))}/${pad(Number(m))}/${y}`;
  }

  // ISO or other parseable string
  const parsed = new Date(datePart);
  if (!isNaN(parsed.getTime())) {
    return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  }

  return datePart;
}

/**
 * Formats a date string for display as "DD/MM/YYYY HH:mm" (or "DD/MM/YYYY" if no time).
 * Converts UTC ISO format strings to the user's local timezone.
 */
export function formatDisplayDateTime(dateStr?: string): string {
  if (!dateStr) return getLocalDateTimeString();

  const trimmed = dateStr.trim();

  // Already DD/MM/YYYY HH:mm
  const dmyTimeMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))/);
  if (dmyTimeMatch) {
    const [, d, m, y, time] = dmyTimeMatch;
    return `${pad(Number(d))}/${pad(Number(m))}/${y} ${time}`;
  }

  // Already DD/MM/YYYY without time
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    return `${pad(Number(d))}/${pad(Number(m))}/${y}`;
  }

  // ISO UTC string (e.g. 2026-09-07T02:59:00.000Z)
  if (trimmed.includes("T")) {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return getLocalDateTimeString(parsed);
    }
  }

  // YYYY-MM-DD HH:mm or YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
  if (ymdMatch) {
    const [, y, m, d, time] = ymdMatch;
    const formattedDate = `${pad(Number(d))}/${pad(Number(m))}/${y}`;
    return time ? `${formattedDate} ${time}` : formattedDate;
  }

  // Fallback Date parser
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return getLocalDateTimeString(parsed);
  }

  return trimmed;
}

/**
 * Formats scheduledDate strings (e.g. "15/09/2026 @ 09:00 AM" or "2026-09-15 @ 09:00 AM")
 * ensuring the date portion is formatted strictly as "DD/MM/YYYY".
 */
export function formatDisplayScheduledDate(scheduledDate?: string): string {
  if (!scheduledDate || scheduledDate === "----------") return scheduledDate || "";

  if (scheduledDate.includes(" @ ")) {
    const [datePart, ...timeParts] = scheduledDate.split(" @ ");
    const timePart = timeParts.join(" @ ");
    return `${formatDisplayDateOnly(datePart)} @ ${timePart}`;
  }

  return formatDisplayDateOnly(scheduledDate);
}

/**
 * Parses any date-time string (DD/MM/YYYY HH:mm, YYYY-MM-DD, ISO, etc.) into epoch timestamp milliseconds
 * for accurate chronological sorting.
 */
export function parseDateToTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const trimmed = dateStr.trim();

  // DD/MM/YYYY HH:mm or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (dmyMatch) {
    const [, dd, mm, yyyy, hh = "0", min = "0"] = dmyMatch;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)).getTime();
  }

  // YYYY-MM-DD HH:mm or YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (ymdMatch) {
    const [, yyyy, mm, dd, hh = "0", min = "0"] = ymdMatch;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)).getTime();
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}
