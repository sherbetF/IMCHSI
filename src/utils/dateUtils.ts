/**
 * Returns local date-time string formatted as "YYYY-MM-DD HH:mm".
 */
export function getLocalDateTimeString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Formats a date string for display as "YYYY-MM-DD HH:mm".
 * If the input date string is in UTC ISO format (e.g. "2026-09-07T02:59:00.000Z"),
 * it converts it to the user's local timezone.
 */
export function formatDisplayDateTime(dateStr?: string): string {
  if (!dateStr) return getLocalDateTimeString();

  if (dateStr.includes("T")) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return getLocalDateTimeString(parsed);
    }
  }

  return dateStr;
}
