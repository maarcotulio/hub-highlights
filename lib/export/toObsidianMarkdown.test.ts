import { describe, expect, it } from "vitest";
import {
  toObsidianMarkdown,
  toSafeFilename,
  type ExportBook,
  type ExportHighlight,
} from "./toObsidianMarkdown";

function book(overrides: Partial<ExportBook> = {}): ExportBook {
  return {
    title: "The Overstory",
    author: "Richard Powers",
    source: "KOREADER",
    status: "READING",
    highlights: [],
    ...overrides,
  };
}

function highlight(overrides: Partial<ExportHighlight> = {}): ExportHighlight {
  return {
    text: "Quote.",
    note: null,
    location: null,
    chapter: null,
    tags: [],
    highlightedAt: null,
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

  it("maps the book status to its export slug in the frontmatter", () => {
    expect(toObsidianMarkdown(book({ status: "NOT_STARTED" }))).toContain("status: not-started");
    expect(toObsidianMarkdown(book({ status: "READING" }))).toContain("status: reading");
    expect(toObsidianMarkdown(book({ status: "FINISHED" }))).toContain("status: finished");
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
          highlight({
            text: "There are no individuals in a forest.",
            location: "412",
            chapter: "Roots",
            highlightedAt: new Date(2026, 2, 3),
          }),
        ],
      })
    );
    expect(md).toContain("> [!quote] Roots · 412 · Mar 3, 2026");
    expect(md).toContain("> There are no individuals in a forest.");
  });

  it("renders a bare callout header when chapter, location, date, and tags are all missing", () => {
    const md = toObsidianMarkdown(
      book({ highlights: [highlight({ text: "A highlight with no metadata." })] })
    );
    expect(md).toContain("> [!quote]\n> A highlight with no metadata.");
  });

  it("appends a Note line only when a note is present", () => {
    const withNote = toObsidianMarkdown(
      book({ highlights: [highlight({ note: "My thought." })] })
    );
    expect(withNote).toContain("> **Note:** My thought.");

    const withoutNote = toObsidianMarkdown(book({ highlights: [highlight()] }));
    expect(withoutNote).not.toContain("**Note:**");
  });

  it("separates multiple highlights with a horizontal rule", () => {
    const md = toObsidianMarkdown(
      book({ highlights: [highlight({ text: "First." }), highlight({ text: "Second." })] })
    );
    expect(md).toContain("> First.\n\n---\n\n> [!quote]\n> Second.");
  });

  it("renders tags as hashtags in the callout header, after location/date", () => {
    const md = toObsidianMarkdown(
      book({
        highlights: [
          highlight({
            location: "412",
            highlightedAt: new Date(2026, 2, 3),
            tags: ["core-thesis", "reread"],
          }),
        ],
      })
    );
    expect(md).toContain("> [!quote] 412 · Mar 3, 2026 · #core-thesis #reread");
  });

  it("slugifies tags with spaces into a valid hashtag", () => {
    const md = toObsidianMarkdown(book({ highlights: [highlight({ tags: ["needs more thought"] })] }));
    expect(md).toContain("#needs-more-thought");
  });

  it("omits the hashtag segment entirely when a highlight has no tags", () => {
    const md = toObsidianMarkdown(book({ highlights: [highlight({ chapter: "Roots", tags: [] })] }));
    expect(md).toContain("> [!quote] Roots\n");
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
