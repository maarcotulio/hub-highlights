import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

const ORIGIN = "https://hub.example.com";

// What actually matters is where the value lands after new URL() resolves it,
// which is what app/auth/confirm/route.ts does with the result. Asserting on
// the resolved origin catches a bad filter that merely "looks" path-like.
function resolvedOrigin(next: string) {
  return new URL(safeNextPath(next), ORIGIN).origin;
}

describe("safeNextPath", () => {
  it("keeps ordinary internal paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/dashboard/abc?tab=notes")).toBe("/dashboard/abc?tab=notes");
  });

  it("falls back when absent or not a path", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("dashboard")).toBe("/dashboard");
  });

  it("rejects values that resolve to another origin", () => {
    // Each of these resolved to https://evil.com before the fix.
    for (const attack of [
      "//evil.com",
      "//evil.com/steal",
      "/\\evil.com",
      "https://evil.com/steal",
      "http://evil.com",
      "javascript:alert(1)",
    ]) {
      expect(resolvedOrigin(attack)).toBe(ORIGIN);
    }
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });
});
