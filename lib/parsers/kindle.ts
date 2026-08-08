import { computeDedupeHash, type RawHighlight } from "./normalize";

const ENTRY_SEPARATOR = /\r?\n={10}\r?\n?/;

function parseHeader(header: string): { bookTitle: string; author: string | null } {
  const match = header.match(/^(.*)\s+\(([^()]+)\)\s*$/);
  if (!match) {
    return { bookTitle: header.trim(), author: null };
  }
  return { bookTitle: match[1].trim(), author: match[2].trim() };
}

function parseKindleDate(raw: string): Date | null {
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const withoutWeekday = raw.replace(/^[A-Za-z]+,\s*/, "");
  const retry = new Date(withoutWeekday);
  return Number.isNaN(retry.getTime()) ? null : retry;
}

function parseLocationRange(location: string | null): [number, number] | null {
  if (!location) return null;
  const [startStr, endStr] = location.split("-");
  const start = Number(startStr);
  const end = endStr !== undefined ? Number(endStr) : start;
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return [start, end];
}

// Kindle notes are anchored to a single point, which usually falls inside
// (not exactly equal to) the highlight range they annotate.
function locationsOverlap(a: string | null, b: string | null): boolean {
  const rangeA = parseLocationRange(a);
  const rangeB = parseLocationRange(b);
  if (!rangeA || !rangeB) return a === b;
  return rangeA[0] <= rangeB[1] && rangeB[0] <= rangeA[1];
}

interface ParsedMeta {
  type: "highlight" | "note" | "bookmark" | null;
  location: string | null;
  highlightedAt: Date | null;
}

function parseMeta(meta: string): ParsedMeta {
  const typeMatch = meta.match(/Your (Highlight|Note|Bookmark)/i);
  const type = typeMatch ? (typeMatch[1].toLowerCase() as ParsedMeta["type"]) : null;

  const locationMatch = meta.match(/[Ll]ocation\s+(\d+(?:-\d+)?)/);
  const pageMatch = meta.match(/page\s+(\d+(?:-\d+)?)/i);
  const location = locationMatch?.[1] ?? pageMatch?.[1] ?? null;

  const dateMatch = meta.match(/Added on (.+)$/i);
  const highlightedAt = dateMatch ? parseKindleDate(dateMatch[1].trim()) : null;

  return { type, location, highlightedAt };
}

export function parseKindleClippings(raw: string): RawHighlight[] {
  const text = raw.replace(/^\uFEFF/, "");
  const entries = text
    .split(ENTRY_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const highlights: RawHighlight[] = [];

  for (const entry of entries) {
    const lines = entry.split(/\r?\n/);
    const header = lines[0] ?? "";
    const meta = lines[1] ?? "";
    const content = lines.slice(3).join("\n").trim();

    const { bookTitle, author } = parseHeader(header);
    const { type, location, highlightedAt } = parseMeta(meta);

    if (!type || type === "bookmark") continue;

    if (type === "note") {
      const target = [...highlights]
        .reverse()
        .find(
          (h) =>
            h.bookTitle === bookTitle &&
            h.author === author &&
            locationsOverlap(h.location, location)
        );
      if (target && content) target.note = content;
      continue;
    }

    if (!content) continue;

    highlights.push({
      bookTitle,
      author,
      source: "KINDLE",
      text: content,
      note: null,
      location,
      chapter: null,
      highlightedAt,
      dedupeHash: computeDedupeHash(content, location),
    });
  }

  const deduped = new Map<string, RawHighlight>();
  for (const h of highlights) {
    deduped.set(`${h.bookTitle}\0${h.author ?? ""}\0${h.dedupeHash}`, h);
  }

  return [...deduped.values()];
}
