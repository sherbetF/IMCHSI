/**
 * HTML Security & Escaping Utilities
 *
 * Prevents HTML Injection / DOM-based XSS when interpolating untrusted patient,
 * clinical, or application data into raw HTML templates or document.write calls.
 */

/**
 * Escapes unsafe HTML characters in a string so it can be safely embedded in HTML text nodes or attribute contexts.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escapes multiline clinical text and preserves newlines safely.
 */
export function escapeHtmlPreserveNewlines(value: unknown): string {
  const escaped = escapeHtml(value);
  return escaped.replace(/\r?\n/g, "<br />");
}

/**
 * Sanitizes a URL for use in href or src attributes to prevent `javascript:` or `data:text/html` scheme injection.
 */
export function sanitizeUrl(url: unknown): string {
  if (!url || typeof url !== "string") return "#";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:")
  ) {
    return escapeHtml(trimmed);
  }
  return "#";
}
