"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

type ExportState = "idle" | "exporting" | "done";

export function ExportAllButton({ fileCount }: { fileCount: number }) {
  const [state, setState] = useState<ExportState>("idle");

  function handleClick() {
    if (state !== "idle") return;
    setState("exporting");
    setTimeout(() => {
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    }, 900);
  }

  if (state === "done") {
    return <Toast message={`highlights-hub-export.zip — ${fileCount} files ready`} />;
  }

  return (
    <Button variant="secondary" onClick={handleClick} disabled={state === "exporting"}>
      {state === "exporting" ? "↻ Building archive…" : "↓ Export all (.zip)"}
    </Button>
  );
}
