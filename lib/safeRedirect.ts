/**
 * Constrains a caller-supplied `?next=` value to a path inside this app.
 *
 * `new URL(next, origin)` resolves protocol-relative and backslash-prefixed
 * values against the *authority*, not the path: "//evil.com" and "/\evil.com"
 * both come back as https://evil.com, and an absolute URL replaces the origin
 * outright. So "starts with a slash" is not a sufficient check — the second
 * character also has to be neither a slash nor a backslash.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || !raw.startsWith("/")) return fallback;
  if (raw.length > 1 && (raw[1] === "/" || raw[1] === "\\")) return fallback;
  return raw;
}
