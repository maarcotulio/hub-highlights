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
    expect(staticSecurityHeaders()).toHaveProperty("Strict-Transport-Security");
  });

  it("names the Supabase origin in img-src so covers load", () => {
    withSupabaseUrl("https://abc.supabase.co");
    expect(contentSecurityPolicy("n0nce")).toContain("img-src 'self' blob: data: https://abc.supabase.co");
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
    });
    const csp = contentSecurityPolicy("n0nce");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self'");
  });
});

// Failing open would be the wrong default: a value we can't parse should not
// silently downgrade a hosted deployment to LAN-grade headers.
describe("unparseable or missing config stays strict", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not a URL", "not-a-url"],
  ])("%s keeps upgrade-insecure-requests and HSTS", (_label, value) => {
    withSupabaseUrl(value);
    expect(contentSecurityPolicy("n0nce")).toContain("upgrade-insecure-requests");
    expect(staticSecurityHeaders()).toHaveProperty("Strict-Transport-Security");
  });
});
