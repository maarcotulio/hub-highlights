"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { downloadFromUrl } from "@/lib/download";
import { toSafeFilename } from "@/lib/export/toObsidianMarkdown";

type ExportState = "idle" | "exporting" | "done";

export function ExportBookButton({
  bookId,
  bookTitle,
  disabled,
}: {
  bookId: string;
  bookTitle: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<ExportState>("idle");

  async function handleClick() {
    if (state !== "idle") return;
    setState("exporting");
    const ok = await downloadFromUrl(`/api/export/${bookId}`, `${toSafeFilename(bookTitle)}.md`);
    if (!ok) {
      setState("idle");
      return;
    }
    setState("done");
    setTimeout(() => setState("idle"), 2500);
  }

  if (state === "done") {
    return <Toast message={`${bookTitle}.md ready`} />;
  }

  return (
    <Button
      variant="primary"
      onClick={handleClick}
      disabled={disabled || state === "exporting"}
      className="inline-flex items-center gap-2 whitespace-nowrap"
    >
      {state === "exporting" ? (
        <>
          <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />
          Exporting…
        </>
      ) : (
        <>
          <Download aria-hidden="true" className="w-4 h-4" />
          Export this book
        </>
      )}
    </Button>
  );
}
