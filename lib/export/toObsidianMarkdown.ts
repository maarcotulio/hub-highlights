import type { Source } from "@/lib/parsers/normalize";
import { BOOK_STATUS_META, type BookStatus } from "@/lib/bookStatus";

export interface ExportHighlight {
  text: string;
  note: string | null;
  location: string | null;
  chapter: string | null;
  tags: string[];
  highlightedAt: Date | null;
}

export interface ExportBook {
  title: string;
  author: string | null;
  source: Source;
  status: BookStatus;
  highlights: ExportHighlight[];
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function yamlString(value: string): string {
  // JSON string literals are also valid YAML double-quoted scalars. Using the
  // platform encoder covers line breaks and other control characters as well
  // as quotes/backslashes, so book metadata cannot create new frontmatter
  // fields by containing a literal newline.
  return JSON.stringify(value);
}

function frontmatter(book: ExportBook): string {
  const lines = ["---", `title: ${yamlString(book.title)}`];
  if (book.author) lines.push(`author: ${yamlString(book.author)}`);
  lines.push(
    `source: ${book.source.toLowerCase()}`,
    "tags:",
    "  - highlights",
    `status: ${BOOK_STATUS_META[book.status].slug}`,
    "---"
  );
  return lines.join("\n");
}

// Obsidian hashtags can't contain spaces or most punctuation — collapse
// whitespace to a dash and drop anything else that isn't tag-safe.
function toHashtag(tag: string): string {
  const slug = tag.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}_/-]/gu, "");
  return slug ? `#${slug}` : "";
}

function quoteBlock(highlight: ExportHighlight): string {
  const headerParts = [
    highlight.chapter,
    highlight.location,
    formatDate(highlight.highlightedAt),
  ].filter((part): part is string => Boolean(part));

  const hashtags = highlight.tags.map(toHashtag).filter(Boolean).join(" ");
  if (hashtags) headerParts.push(hashtags);

  const header = headerParts.length > 0 ? ` ${headerParts.join(" · ")}` : "";

  const lines = [`> [!quote]${header}`];
  lines.push(...highlight.text.split("\n").map((line) => `> ${line}`));

  if (highlight.note) {
    const noteLines = highlight.note.split("\n");
    lines.push(">");
    lines.push(`> **Note:** ${noteLines[0]}`);
    lines.push(...noteLines.slice(1).map((line) => `> ${line}`));
  }

  return lines.join("\n");
}

export function toObsidianMarkdown(book: ExportBook): string {
  const body = book.highlights.map(quoteBlock).join("\n\n---\n\n");
  return `${frontmatter(book)}\n\n# ${book.title}\n\n${body}\n`;
}

export function toSafeFilename(title: string): string {
  const cleaned = title.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : "Untitled";
}
