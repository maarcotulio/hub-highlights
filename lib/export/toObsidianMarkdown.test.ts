import { describe, expect, it } from "vitest";
import { toObsidianMarkdown, toSafeFilename, type ExportBook } from "./toObsidianMarkdown";

function book(overrides: Partial<ExportBook> = {}): ExportBook {
  return {
    title: "The Overstory",
    author: "Richard Powers",
    source: "KOREADER",
    highlights: [],
    ...overrides,
  };
}

describe("toObsidianMarkdown", () => {
  it("includes title, author, and lowercased source in the frontmatter", () => {
    const md = toObsidianMarkdown(book());
    expect(md).toContain('title: "The Overstory"');
    expect(md).toContain('author: "Richard Powers"');
    expect(md).toContain("source: koreader");
    expect(md).toContain("tags:\n  - highlights");
  });

  it("omits the author line when the book has no author", () => {
    const md = toObsidianMarkdown(book({ author: null }));
    expect(md).not.toContain("author:");
  });

  it("escapes double quotes in the title", () => {
    const md = toObsidianMarkdown(book({ title: 'A "Great" Book' }));
    expect(md).toContain('title: "A \\"Great\\" Book"');
  });

  it("renders a highlight with chapter, location, and date in the callout header", () => {
    const md = toObsidianMarkdown(
      book({
        highlights: [
          {
            text: "There are no individuals in a forest.",
            note: null,
            location: "412",
            chapter: "Roots",
            highlightedAt: new Date(2026, 2, 3),
          },
        ],
      })
    );
    expect(md).toContain("> [!quote] Roots · 412 · Mar 3, 2026");
    expect(md).toContain("> There are no individuals in a forest.");
  });

  it("renders a bare callout header when chapter, location, and date are all missing", () => {
    const md = toObsidianMarkdown(
      book({
        highlights: [
          { text: "A highlight with no metadata.", note: null, location: null, chapter: null, highlightedAt: null },
        ],
      })
    );
    expect(md).toContain("> [!quote]\n> A highlight with no metadata.");
  });

  it("appends a Note line only when a note is present", () => {
    const withNote = toObsidianMarkdown(
      book({
        highlights: [
          { text: "Quote.", note: "My thought.", location: null, chapter: null, highlightedAt: null },
        ],
      })
    );
    expect(withNote).toContain("> **Note:** My thought.");

    const withoutNote = toObsidianMarkdown(
      book({
        highlights: [{ text: "Quote.", note: null, location: null, chapter: null, highlightedAt: null }],
      })
    );
    expect(withoutNote).not.toContain("**Note:**");
  });

  it("separates multiple highlights with a horizontal rule", () => {
    const md = toObsidianMarkdown(
      book({
        highlights: [
          { text: "First.", note: null, location: null, chapter: null, highlightedAt: null },
          { text: "Second.", note: null, location: null, chapter: null, highlightedAt: null },
        ],
      })
    );
    expect(md).toContain("> First.\n\n---\n\n> [!quote]\n> Second.");
  });
});

describe("toSafeFilename", () => {
  it("strips characters that are unsafe in filenames", () => {
    expect(toSafeFilename('Foo/Bar: A "Tale"?')).toBe("FooBar A Tale");
  });

  it("falls back to Untitled when the sanitized title is empty", () => {
    expect(toSafeFilename("///???")).toBe("Untitled");
  });
});
