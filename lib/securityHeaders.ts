/**
 * Response headers applied to every request by proxy.ts.
 *
 * The CSP is nonce-based because App Router emits inline bootstrap/flight
 * scripts on every page: a hash-only policy would have to enumerate scripts
 * that change per render, and 'unsafe-inline' would defeat the point. Next
 * reads the nonce out of the `Content-Security-Policy` *request* header and
 * stamps it onto its own script tags, which is why proxy.ts sets the header on
 * both the request and the response.
 */

// Cover images are served from the project's Storage domain, so that origin has
// to be reachable in img-src. Derived from the configured URL rather than a
// wildcard, so the policy names exactly one origin.
//
// It is deliberately NOT in connect-src: auth moved to server actions and
// lib/supabase/client.ts is gone, so the only network call the browser makes is
// fetch("/api/upload"), same-origin. Nothing left in the page needs to reach
// Supabase, and an XSS shouldn't be handed the reach either.
function supabaseOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export function contentSecurityPolicy(nonce: string): string {
  const supabase = supabaseOrigin();

  // Next's dev server compiles and hot-reloads through eval; production
  // bundles never do, so the relaxation is scoped to dev only.
  const devScript = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonce-trusted Next runtime load its own chunks
    // without each one needing to be listed here.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScript}`,
    // Tailwind and next/font emit inline <style>; style injection is a far
    // weaker primitive than script injection, so this stays permissive.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export const STATIC_SECURITY_HEADERS: Record<string, string> = {
  // Redundant with frame-ancestors above, kept for browsers that honour only
  // the older header.
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  // Highlight and book titles end up in URLs; don't hand them to third-party
  // origins in the Referer header.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};
