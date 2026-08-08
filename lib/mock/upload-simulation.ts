import type { UploadResult } from "./types";

const SUPPORTED_EXTENSIONS = [".txt", ".lua", ".sqlite3"];

export function simulateUpload(file: File): Promise<UploadResult> {
  const fileName = file.name;
  const isSupported = SUPPORTED_EXTENSIONS.some((ext) =>
    fileName.toLowerCase().endsWith(ext)
  );

  return new Promise((resolve) => {
    setTimeout(() => {
      if (!isSupported) {
        resolve({ status: "error", reason: "unsupported", fileName });
        return;
      }
      if (fileName.toLowerCase().includes("corrupt")) {
        resolve({ status: "error", reason: "corrupt", fileName });
        return;
      }
      resolve({ status: "success", imported: 12, skipped: 3, fileName });
    }, 900);
  });
}
