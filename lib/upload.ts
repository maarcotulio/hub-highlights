export type UploadResult =
  | { status: "success"; kind: "highlights"; imported: number; skipped: number; fileName: string }
  | { status: "success"; kind: "stats"; booksUpdated: number; fileName: string }
  | { status: "error"; reason: "corrupt" | "unsupported"; fileName: string };
