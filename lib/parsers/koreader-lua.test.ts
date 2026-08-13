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
      expect(h.bookTitle).toBe("[Sample Book]");
      expect(h.author).toBe("Sample Author");
      expect(h.source).toBe("KOREADER");
    }
  });

  it("maps pageno/chapter/datetime correctly", () => {
    const highlights = parseKoreaderMetadata(metadataFixture);
    const first = highlights.find(
      (h) => h.text === "A highlighted sentence with Unicode: café, 日本語, 🚀."
    );
    expect(first).toBeDefined();
    expect(first?.location).toBe("317");
    expect(first?.chapter).toBe("Chapter One");
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

  it("rejects executable statements outside the returned data table", () => {
    const maliciousLua = `
      os.execute("touch /tmp/highlights-hub-parser-must-never-run")
      return {
        ["annotations"] = {
          [1] = { ["color"] = "yellow", ["text"] = "Safe-looking payload" },
        },
      }
    `;

    expect(() => parseKoreaderMetadata(maliciousLua)).toThrow(/single.*return/i);
  });

  it("rejects chunks that return additional values outside the allowed table", () => {
    const multipleValues = `return { annotations = {} }, { annotations = {} }`;

    expect(() => parseKoreaderMetadata(multipleValues)).toThrow(/single.*return/i);
  });

  it("maps Unicode, multiline text, optional fields, and location variants", () => {
    const lua = `return {
      ["doc_props"] = {
        ["title"] = "The Café Reader — 📚",
        ["authors"] = "Renée Example",
      },
      ["annotations"] = {
        [1] = {
          ["color"] = "yellow",
          ["text"] = "First line\\nSecond line",
          ["note"] = "Remember this ✓",
          ["pageno"] = 42,
          ["datetime"] = "not-a-date",
        },
        [2] = {
          ["color"] = "gray",
          ["text"] = "A path-based location",
          ["page"] = "/body/DocFragment[4]/p[2]",
        },
      },
    }`;

    const highlights = parseKoreaderMetadata(lua);

    expect(highlights).toHaveLength(2);
    expect(highlights[0]).toMatchObject({
      bookTitle: "The Café Reader — 📚",
      author: "Renée Example",
      text: "First line\nSecond line",
      note: "Remember this ✓",
      location: "42",
      chapter: null,
      highlightedAt: null,
    });
    expect(highlights[1]).toMatchObject({
      note: null,
      location: "/body/DocFragment[4]/p[2]",
      chapter: null,
      highlightedAt: null,
    });
  });

  it("ignores malformed entries instead of manufacturing highlights", () => {
    const lua = `return {
      ["annotations"] = {
        [1] = nil,
        [2] = "unexpected",
        [3] = { ["color"] = true, ["text"] = "Wrong color type" },
        [4] = { ["color"] = "yellow", ["text"] = "" },
        [5] = { ["color"] = "yellow", ["text"] = 123 },
        [6] = { ["text"] = "A bookmark, not a highlight" },
      },
    }`;

    expect(parseKoreaderMetadata(lua)).toEqual([]);
  });

  it("rejects executable expressions inside the returned table", () => {
    const lua = `return {
      ["annotations"] = {
        [1] = {
          ["color"] = "yellow",
          ["text"] = string.upper("must not execute"),
        },
      },
    }`;

    expect(() => parseKoreaderMetadata(lua)).toThrow(/Unsupported Lua construct/i);
  });

  it.each([
    ["empty input", ""],
    ["truncated table", 'return { ["annotations"] = {'],
    ["non-table return", 'return "not a table"'],
    ["unexpected annotations structure", 'return { ["annotations"] = 42 }'],
  ])("rejects %s", (_label, lua) => {
    expect(() => parseKoreaderMetadata(lua)).toThrow();
  });

  it("keeps deduplication independent from note, chapter, and date metadata", () => {
    const lua = `return {
      ["annotations"] = {
        [1] = {
          ["color"] = "yellow",
          ["text"] = "The same quotation",
          ["pageno"] = 12,
          ["note"] = "First note",
          ["chapter"] = "Chapter One",
          ["datetime"] = "2026-01-01 10:00:00",
        },
        [2] = {
          ["color"] = "yellow",
          ["text"] = "The same quotation",
          ["pageno"] = 12,
          ["note"] = "Changed note",
          ["chapter"] = "Changed chapter",
          ["datetime"] = "2026-02-02 11:00:00",
        },
      },
    }`;

    const [first, second] = parseKoreaderMetadata(lua);
    expect(first.dedupeHash).toBe(second.dedupeHash);
  });

  it("decodes escaped Lua strings without executing them", () => {
    const lua = String.raw`return {
      annotations = {
        {
          color = "yellow",
          text = "tab:\t carriage:\r slash:\\ quote:\" hex:\x41 decimal:\065",
        },
      },
    }`;

    expect(parseKoreaderMetadata(lua)[0].text).toBe(
      'tab:\t carriage:\r slash:\\ quote:" hex:A decimal:A'
    );
  });

  it("decodes Lua control-character escapes deterministically", () => {
    const lua = String.raw`return {
      annotations = {
        {
          color = "yellow",
          text = "bell:\a backspace:\b formfeed:\f vertical:\v",
        },
      },
    }`;

    expect(parseKoreaderMetadata(lua)[0].text).toBe(
      "bell:\x07 backspace:\b formfeed:\f vertical:\v"
    );
  });

  it("consumes at most three digits from a Lua decimal escape", () => {
    const lua = String.raw`return {
      annotations = {
        {
          color = "yellow",
          text = "one:\9 two:\10 three:\100 capped:\0659",
        },
      },
    }`;

    expect(parseKoreaderMetadata(lua)[0].text).toBe(
      "one:\t two:\n three:d capped:A9"
    );
  });

  it.each(["z", "!"])(
    "rejects the unsupported \\%s string escape instead of changing imported text",
    (escape) => {
      const lua = `return {
        annotations = {
          { color = "yellow", text = "unsupported:\\${escape}" },
        },
      }`;

      expect(() => parseKoreaderMetadata(lua)).toThrow(/unsupported lua string escape/i);
    }
  );

  it("rejects malformed hexadecimal and out-of-range decimal escapes", () => {
    const malformedHex = String.raw`return {
      annotations = {
        { color = "yellow", text = "malformed:\x4" },
      },
    }`;
    const maximumDecimal = String.raw`return {
      annotations = {
        { color = "yellow", text = "maximum:\255" },
      },
    }`;
    const outOfRangeDecimal = String.raw`return {
      annotations = {
        { color = "yellow", text = "too large:\256" },
      },
    }`;

    expect(() => parseKoreaderMetadata(malformedHex)).toThrow(/hexadecimal escape/i);
    expect(parseKoreaderMetadata(maximumDecimal)[0].text).toBe("maximum:ÿ");
    expect(() => parseKoreaderMetadata(outOfRangeDecimal)).toThrow(
      /decimal escape.*(?:large|255)/i
    );
  });

  it("supports quote escapes and escaped physical line breaks", () => {
    const lua = String.raw`return {
      annotations = {
        { color = 'yellow', text = 'it\'s on the first\
and second line' },
      },
    }`;

    expect(parseKoreaderMetadata(lua)[0].text).toBe("it's on the first\nand second line");
  });

  it("preserves the source order of implicit annotation array entries", () => {
    const lua = `return {
      annotations = {
        { color = "yellow", text = "First implicit entry" },
        { color = "yellow", text = "Second implicit entry" },
        { color = "yellow", text = "Third implicit entry" },
      },
    }`;

    expect(parseKoreaderMetadata(lua).map((highlight) => highlight.text)).toEqual([
      "First implicit entry",
      "Second implicit entry",
      "Third implicit entry",
    ]);
  });

  it("allows numeric unary minus but rejects every other unary expression", () => {
    const negativePage = `return {
      annotations = {
        { color = "yellow", text = "Negative page", pageno = -7 },
      },
    }`;
    expect(parseKoreaderMetadata(negativePage)[0].location).toBe("-7");

    const unsupportedUnary = `return {
      annotations = {
        { color = "yellow", text = "Unsafe expression", pageno = not false },
      },
    }`;
    expect(() => parseKoreaderMetadata(unsupportedUnary)).toThrow(/unary expression/i);

    const numericOperandWithWrongOperator = `return {
      annotations = {
        { color = "yellow", text = "Unsafe expression", pageno = not 5 },
      },
    }`;
    expect(() => parseKoreaderMetadata(numericOperandWithWrongOperator)).toThrow(
      /unary expression/i
    );
  });
});
