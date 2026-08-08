import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseKoreaderMetadata } from "./koreader-lua";

const metadataFixture = readFileSync(
  join(__dirname, "__fixtures__", "koreader-metadata.lua"),
  "utf-8"
);
const annotationsFixture = readFileSync(
  join(__dirname, "__fixtures__", "koreader-annotations.lua"),
  "utf-8"
);

describe("parseKoreaderMetadata", () => {
  it("only keeps annotation entries that have a color (real highlights)", () => {
    const highlights = parseKoreaderMetadata(metadataFixture);
    // The fixture has 6 annotations entries, only 2 carry a `color`.
    expect(highlights).toHaveLength(2);
  });

  it("reads title/author from doc_props", () => {
    const highlights = parseKoreaderMetadata(metadataFixture);
    for (const h of highlights) {
      expect(h.bookTitle).toBe("[nome do livro]");
      expect(h.author).toBe("tESTE sAMBANGA");
      expect(h.source).toBe("KOREADER");
    }
  });

  it("maps pageno/chapter/datetime correctly", () => {
    const highlights = parseKoreaderMetadata(metadataFixture);
    const first = highlights.find((h) => h.text === "loreasdjfhaskjdfhkasdfj");
    expect(first).toBeDefined();
    expect(first?.location).toBe("317");
    expect(first?.chapter).toBe("teste");
    expect(first?.highlightedAt?.getFullYear()).toBe(2026);
    expect(first?.highlightedAt?.getMonth()).toBe(0); // January
    expect(first?.highlightedAt?.getDate()).toBe(2);
  });

  it("falls back to Untitled/null when doc_props is absent (standalone annotations.lua)", () => {
    const highlights = parseKoreaderMetadata(annotationsFixture);
    expect(highlights).toHaveLength(2);
    for (const h of highlights) {
      expect(h.bookTitle).toBe("Untitled");
      expect(h.author).toBeNull();
    }
  });

  it("throws a clear error for a lua table with no annotations key", () => {
    const luaWithoutAnnotations = `return {\n  ["doc_props"] = {\n    ["title"] = "Some Book",\n  },\n}\n`;
    expect(() => parseKoreaderMetadata(luaWithoutAnnotations)).toThrow(/annotations/i);
  });

  it("computes a stable dedupeHash from text + location", () => {
    const highlights = parseKoreaderMetadata(metadataFixture);
    for (const h of highlights) {
      expect(h.dedupeHash).toMatch(/^[a-f0-9]{40}$/);
    }
  });

  it("extracts partial_md5_checksum as md5 when present and non-empty", () => {
    const lua = `return {
      ["partial_md5_checksum"] = "abc123def456",
      ["annotations"] = {
        [1] = { ["color"] = "yellow", ["text"] = "some highlight" },
      },
    }`;
    const highlights = parseKoreaderMetadata(lua);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].md5).toBe("abc123def456");
  });

  it("treats a missing or empty partial_md5_checksum as null", () => {
    // The real fixture has partial_md5_checksum = "" (present but empty).
    const withEmptyChecksum = parseKoreaderMetadata(metadataFixture);
    for (const h of withEmptyChecksum) {
      expect(h.md5).toBeNull();
    }
    // The standalone annotations.lua format doesn't have the field at all.
    const withoutChecksum = parseKoreaderMetadata(annotationsFixture);
    for (const h of withoutChecksum) {
      expect(h.md5).toBeNull();
    }
  });
});
