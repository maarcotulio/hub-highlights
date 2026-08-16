import { describe, expect, it } from "vitest";
import { computeDedupeHash } from "./normalize";

describe("computeDedupeHash", () => {
  it("is deterministic for the same text and location", () => {
    expect(computeDedupeHash("A quotation", "42")).toBe(
      computeDedupeHash("A quotation", "42")
    );
  });

  it("changes when the highlight text changes", () => {
    expect(computeDedupeHash("First quotation", "42")).not.toBe(
      computeDedupeHash("Second quotation", "42")
    );
  });

  it("changes when the location changes", () => {
    expect(computeDedupeHash("A quotation", "42")).not.toBe(
      computeDedupeHash("A quotation", "43")
    );
  });

  it("gives missing and empty optional locations the same stable representation", () => {
    expect(computeDedupeHash("A quotation", null)).toBe(
      computeDedupeHash("A quotation", "")
    );
  });

  it.each([
    ["", null],
    ["Unicode café — 📚", "page 12 ✓"],
    ["First line\nSecond line", "7"],
  ])("always returns a canonical SHA-1 digest for %#", (text, location) => {
    expect(computeDedupeHash(text, location)).toMatch(/^[a-f0-9]{40}$/);
  });
});
