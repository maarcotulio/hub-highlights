import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

const ORIGIN = "https://hub.example.com";

// What actually matters is where the value lands after new URL() resolves it,
// which is what the browser does with the post-sign-in redirect issued by
// app/login/actions.ts. Asserting on the resolved origin catches a bad filter
// that merely "looks" path-like.
function resolvedOrigin(next: string) {
  return new URL(safeNextPath(next), ORIGIN).origin;
}

// Built from code points rather than typed literally: a raw control byte in a
// source file is invisible in an editor and a diff, so a well-meaning reformat
// would silently gut these cases.
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

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
      // The URL parser drops these before resolving, so each one collapses to
      // "//evil.com" and changes origin while still looking path-like.
      `/${TAB}/evil.com`,
      `/${LF}/evil.com`,
      `/${CR}/evil.com`,
      `/${TAB}\\evil.com`,
    ]) {
      expect(resolvedOrigin(attack)).toBe(ORIGIN);
    }
  });

  it("falls back on a repeated query param, which arrives as an array", () => {
    expect(safeNextPath(["/a", "/b"])).toBe("/dashboard");
  });

  it("rejects every ASCII control character and DEL", () => {
    const controlPoints = [...Array.from({ length: 0x20 }, (_, code) => code), 0x7f];

    for (const code of controlPoints) {
      const attack = `/${String.fromCodePoint(code)}/evil.com`;
      expect(safeNextPath(attack), `U+${code.toString(16).padStart(4, "0")}`).toBe(
        "/dashboard"
      );
    }
  });

  it("fails safely for unexpected runtime input types", () => {
    for (const value of [42, true, {}, ["/safe"]]) {
      expect(safeNextPath(value as never)).toBe("/dashboard");
    }
  });

  it("honours a custom fallback", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });
});
