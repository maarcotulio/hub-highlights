import { createHash } from "crypto";

export type Source = "KOREADER";

export interface RawHighlight {
  bookTitle: string;
  author: string | null;
  source: Source;
  md5: string | null;
  text: string;
  note: string | null;
  location: string | null;
  chapter: string | null;
  highlightedAt: Date | null;
  dedupeHash: string;
}

export function computeDedupeHash(text: string, location: string | null): string {
  return createHash("sha1").update(`${text}\0${location ?? ""}`).digest("hex");
}
