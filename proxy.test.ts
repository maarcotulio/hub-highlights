import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({ updateSession: mocks.updateSession }));

import { proxy } from "./proxy";

describe("security header proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    mocks.updateSession.mockResolvedValue(NextResponse.next());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("applies the same nonce policy to the request and response", async () => {
    const request = new NextRequest("https://hub.example/dashboard");

    const response = await proxy(request);
    const requestPolicy = request.headers.get("content-security-policy");

    expect(request.headers.get("x-nonce")).toMatch(/^[a-f0-9]{32}$/);
    expect(requestPolicy).toContain("'strict-dynamic'");
    expect(response.headers.get("content-security-policy")).toBe(requestPolicy);
    expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
