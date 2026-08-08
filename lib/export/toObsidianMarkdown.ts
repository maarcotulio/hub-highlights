import type { Source } from "@/lib/parsers/normalize";

export interface ExportHighlight {
  text: string;
  note: string | null;
  location: string | null;
  chapter: string | null;
  highlightedAt: Date | null;
}

export interface ExportBook {
  title: string;
  author: string | null;
  source: Source;
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
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function frontmatter(book: ExportBook): string {
  const lines = ["---", `title: ${yamlString(book.title)}`];
  if (book.author) lines.push(`author: ${yamlString(book.author)}`);
  lines.push(`source: ${book.source.toLowerCase()}`, "tags:", "  - highlights", "---");
  return lines.join("\n");
}

function quoteBlock(highlight: ExportHighlight): string {
  const headerParts = [
    highlight.chapter,
    highlight.location,
    formatDate(highlight.highlightedAt),
  ].filter((part): part is string => Boolean(part));
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
