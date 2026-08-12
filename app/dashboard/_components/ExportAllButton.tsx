"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { downloadFromUrl } from "@/lib/download";

type ExportState = "idle" | "exporting" | "done";

export function ExportAllButton({
  fileCount,
  className = "",
}: {
  fileCount: number;
  className?: string;
}) {
  const [state, setState] = useState<ExportState>("idle");

  async function handleClick() {
    if (state !== "idle") return;
    setState("exporting");
    const ok = await downloadFromUrl("/api/export/all", "highlights-hub-export.zip");
    if (!ok) {
      setState("idle");
      return;
    }
    setState("done");
    setTimeout(() => setState("idle"), 2500);
  }

  if (state === "done") {
    return <Toast message={`highlights-hub-export.zip — ${fileCount} books ready (including archived)`} />;
  }

  return (
    <Button
      variant="secondary"
      onClick={handleClick}
      disabled={state === "exporting"}
      title="Export all books, including archived books"
      className={className}
    >
      {state === "exporting" ? "↻ Building archive…" : "↓ Export all"}
    </Button>
  );
}
