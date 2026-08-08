export type Source = "KINDLE" | "KOREADER";

export interface MockHighlight {
  id: string;
  text: string;
  note: string | null;
  location: string | null;
  chapter: string | null;
  highlightedAt: string | null;
}

export interface MockBook {
  id: string;
  title: string;
  author: string | null;
  source: Source;
  highlights: MockHighlight[];
}

export type UploadResult =
  | { status: "success"; imported: number; skipped: number; fileName: string }
  | { status: "error"; reason: "corrupt" | "unsupported"; fileName: string };
