"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";

type ExportState = "idle" | "exporting" | "done";

export function ExportBookButton({
  bookTitle,
  disabled,
}: {
  bookTitle: string;
  disabled?: boolean;
}) {
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
    return <Toast message={`${bookTitle}.md ready`} />;
  }

  return (
    <Button
      variant="primary"
      onClick={handleClick}
      disabled={disabled || state === "exporting"}
      className="whitespace-nowrap"
    >
      {state === "exporting" ? "↻ Exporting…" : "↓ Export this book"}
    </Button>
  );
}
