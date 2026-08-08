export type UploadResult =
  | { status: "success"; imported: number; skipped: number; fileName: string }
  | { status: "error"; reason: "corrupt" | "unsupported"; fileName: string };
