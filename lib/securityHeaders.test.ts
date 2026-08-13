import { afterEach, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, staticSecurityHeaders } from "./securityHeaders";

// Both values are read from process.env at call time rather than module load,
// so each case can set the scheme it is about without re-importing the module.
function withSupabaseUrl(value: string | undefined) {
  if (value === undefined) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("https deployments keep the strict headers", () => {
  it("sends upgrade-insecure-requests", () => {
    withSupabaseUrl("https://abc.supabase.co");
    expect(contentSecurityPolicy("n0nce")).toContain("upgrade-insecure-requests");
  });

  it("sends HSTS", () => {
    withSupabaseUrl("https://abc.supabase.co");
    expect(staticSecurityHeaders()).toHaveProperty(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  });

  it("names the Supabase origin in img-src so covers load", () => {
    withSupabaseUrl("https://abc.supabase.co");
    expect(contentSecurityPolicy("n0nce")).toContain("img-src 'self' blob: data: https://abc.supabase.co");
  });
});

describe("development-only script relaxation", () => {
  it("allows eval only for the Next.js development compiler", () => {
    withSupabaseUrl("https://abc.supabase.co");
    vi.stubEnv("NODE_ENV", "development");
    expect(contentSecurityPolicy("n0nce")).toContain("'unsafe-eval'");

    vi.stubEnv("NODE_ENV", "production");
    expect(contentSecurityPolicy("n0nce")).not.toContain("'unsafe-eval'");
  });
});

// A self-hosted LAN stack has no certificate, so these two headers would break
// it: upgrade-insecure-requests rewrites every cover request to a port nothing
// serves, and HSTS pins the host to https the first time it ever sees TLS.
describe("plain-http LAN deployments drop the headers that assume TLS", () => {
  const LAN = "http://192.168.1.50:8000";

  it("omits upgrade-insecure-requests", () => {
    withSupabaseUrl(LAN);
    expect(contentSecurityPolicy("n0nce")).not.toContain("upgrade-insecure-requests");
  });

  it("omits HSTS", () => {
    withSupabaseUrl(LAN);
    expect(staticSecurityHeaders()).not.toHaveProperty("Strict-Transport-Security");
  });

  it("keeps every other hardening header", () => {
    withSupabaseUrl(LAN);
    const headers = staticSecurityHeaders();
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    });
    const csp = contentSecurityPolicy("n0nce");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
  });

  it("keeps a complete CSP while omitting only the HTTPS upgrade", () => {
    withSupabaseUrl(LAN);

    expect(contentSecurityPolicy("n0nce").split("; ")).toEqual([
      "default-src 'self'",
      "script-src 'self' 'nonce-n0nce' 'strict-dynamic'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' blob: data: ${LAN}`,
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]);
  });
});

// Failing open would be the wrong default: a value we can't parse should not
// silently downgrade a hosted deployment to LAN-grade headers.
describe("unparseable or missing config stays strict", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not a URL", "not-a-url"],
    ["scheme missing", "hub.example.com"],
    ["unsupported FTP scheme", "ftp://hub.example.com"],
    ["unsupported WebSocket scheme", "ws://hub.example.com"],
  ])("%s keeps upgrade-insecure-requests and HSTS", (_label, value) => {
    withSupabaseUrl(value);
    expect(contentSecurityPolicy("n0nce")).toContain("upgrade-insecure-requests");
    expect(staticSecurityHeaders()).toHaveProperty("Strict-Transport-Security");
  });

  it("keeps every baseline CSP directive without inventing an image origin", () => {
    withSupabaseUrl("not-a-url");

    expect(contentSecurityPolicy("n0nce").split("; ")).toEqual([
      "default-src 'self'",
      "script-src 'self' 'nonce-n0nce' 'strict-dynamic'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ]);
  });
});
