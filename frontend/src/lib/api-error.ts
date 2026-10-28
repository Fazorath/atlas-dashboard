/** The reason shown when an API call fails. Never empty: HTTP/2 gives no status
 *  text, and a proxy's own error page is not JSON. */
export function errorMessage(status: number, statusText: string, body: unknown): string {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string" && detail) return detail;
  // A Custom module's Problem: {code, message}.
  const message = (detail as { message?: unknown } | null | undefined)?.message;
  if (typeof message === "string" && message) return message;
  if (status === 413) return "That photo is too large.";
  if (statusText) return statusText;
  return `Request failed (HTTP ${status}).`;
}
