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
function supabaseUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function supabaseOrigin(): string {
  return supabaseUrl()?.origin ?? "";
}

// A self-hosted stack on a home LAN is reachable over plain http://, because
// there is no certificate authority that will issue for 192.168.x.x and the
// alternative is telling those users to run without the KOReader plugin.
//
// Two of the headers below actively break that deployment, so both are keyed
// off the deployment's own scheme rather than sent unconditionally. Read from
// NEXT_PUBLIC_SUPABASE_URL because Caddy serves the app and Supabase under one
// origin in the self-hosted stack, making it the scheme the browser actually
// sees. Anything that isn't explicitly http: is treated as secure, so a
// missing or malformed value keeps the strict headers.
function isPlainHttpDeployment(): boolean {
  return supabaseUrl()?.protocol === "http:";
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
    // Rewrites subresource requests from http:// to https://. On an https
    // deployment that closes a real downgrade hole; on a plain-http LAN
    // deployment it upgrades every cover image to a port nothing is listening
    // on, and the failure surfaces as a broken thumbnail rather than an error.
    ...(isPlainHttpDeployment() ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function staticSecurityHeaders(): Record<string, string> {
  return {
    // Redundant with frame-ancestors above, kept for browsers that honour only
    // the older header.
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    // Highlight and book titles end up in URLs; don't hand them to third-party
    // origins in the Referer header.
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    // Browsers ignore HSTS received over http, so emitting it on a LAN
    // deployment would be merely useless — except that it also pins the host
    // to https for two years the moment that host is ever served over TLS
    // once, which would strand a LAN deployment that has no certificate.
    ...(isPlainHttpDeployment()
      ? {}
      : { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }),
  };
}
