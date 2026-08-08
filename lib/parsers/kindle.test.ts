import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseKindleClippings } from "./kindle";

const fixture = readFileSync(
  join(__dirname, "__fixtures__", "kindle-my-clippings.txt"),
  "utf-8"
);

describe("parseKindleClippings", () => {
  it("parses highlights and skips bookmarks", () => {
    const highlights = parseKindleClippings(fixture);
    // 2 unique highlights: one in "The Fictional Mountain", one (deduped) in
    // "Imaginary Light Novel Vol. 3". The bookmark entry produces nothing.
    expect(highlights).toHaveLength(2);
  });

  it("merges a Note entry into the highlight at the same location", () => {
    const highlights = parseKindleClippings(fixture);
    const mountain = highlights.find((h) => h.bookTitle === "The Fictional Mountain");
    expect(mountain).toBeDefined();
    expect(mountain?.note).toBe("remember this for later");
    expect(mountain?.author).toBe("A. Nonymous");
    expect(mountain?.location).toBe("145-149");
    expect(mountain?.text).toBe(
      "This is the first highlighted passage from the fictional book."
    );
    expect(mountain?.highlightedAt?.getFullYear()).toBe(2023);
    expect(mountain?.highlightedAt?.getMonth()).toBe(9); // October (0-indexed)
    expect(mountain?.highlightedAt?.getDate()).toBe(15);
  });

  it("dedupes a highlight re-saved after its note was edited, keeping the latest", () => {
    const highlights = parseKindleClippings(fixture);
    const novel = highlights.find((h) => h.bookTitle === "Imaginary Light Novel Vol. 3");
    expect(novel).toBeDefined();
    expect(novel?.note).toBe("final note version, kept the second edit");
    expect(novel?.location).toBe("60-64");
  });

  it("strips a leading BOM without breaking the first entry", () => {
    const highlights = parseKindleClippings(fixture);
    expect(highlights[0].bookTitle).not.toContain("﻿");
  });

  it("computes a stable dedupeHash from text + location", () => {
    const highlights = parseKindleClippings(fixture);
    for (const h of highlights) {
      expect(h.dedupeHash).toMatch(/^[a-f0-9]{40}$/);
    }
  });
});
