/**
 * Constrains a caller-supplied `?next=` value to a path inside this app.
 *
 * `new URL(next, origin)` resolves protocol-relative and backslash-prefixed
 * values against the *authority*, not the path: "//evil.com" and "/\evil.com"
 * both come back as https://evil.com, and an absolute URL replaces the origin
 * outright. So "starts with a slash" is not a sufficient check — the second
 * character also has to be neither a slash nor a backslash.
 */
export function safeNextPath(
  raw: string | string[] | null | undefined,
  fallback = "/dashboard"
): string {
  // A repeated query param (?next=a&next=b) arrives as an array, which has no
  // .startsWith — without this guard the page throws instead of falling back.
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback;

  // The URL parser strips tab, LF and CR *before* resolving, so a tab sitting
  // right after the leading slash collapses into "//evil.com" and changes the
  // origin, sailing past the second-character check below. Reject the whole
  // control range: U+0000–U+001F and U+007F. Compared by code point on purpose
  // — a literal control byte inside a regex is invisible in an editor, a diff
  // and a review, which is exactly how this class of bug survives.
  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x1f || code === 0x7f) return fallback;
  }

  if (raw.length > 1 && (raw[1] === "/" || raw[1] === "\\")) return fallback;
  return raw;
}
