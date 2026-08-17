"use client";

import { useRef, useState, useEffect, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, CircleAlert, LoaderCircle, Upload } from "lucide-react";
import type { UploadResult } from "@/lib/upload";
import { Button } from "./Button";
import { Toast } from "./Toast";

const SUCCESS_TOAST_MS = 2500;

async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    return (await response.json()) as UploadResult;
  } catch {
    return { status: "error", reason: "corrupt", fileName: file.name };
  }
}

type DropzoneState =
  | { phase: "idle" }
  | { phase: "drag-over" }
  | { phase: "uploading"; fileName: string; progress: number }
  | { phase: "success"; result: UploadResult & { status: "success" } }
  | { phase: "error"; result: UploadResult & { status: "error" } };

export function Dropzone({
  onImported,
}: {
  onImported?: (result: UploadResult) => void;
}) {
  const [state, setState] = useState<DropzoneState>({ phase: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.phase !== "uploading") return;
    const interval = setInterval(() => {
      setState((s) =>
        s.phase === "uploading"
          ? { ...s, progress: Math.min(s.progress + 15, 90) }
          : s
      );
    }, 150);
    return () => clearInterval(interval);
  }, [state.phase]);

  async function handleFile(file: File) {
    if (state.phase === "uploading") return;
    setState({ phase: "uploading", fileName: file.name, progress: 10 });
    const result = await uploadFile(file);

    if (result.status === "success") {
      setState({ phase: "success", result });
      router.refresh();
      setTimeout(() => setState({ phase: "idle" }), SUCCESS_TOAST_MS);
    } else {
      setState({ phase: "error", result });
    }
    onImported?.(result);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  if (state.phase === "drag-over" || state.phase === "idle") {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setState({ phase: "drag-over" });
        }}
        onDragLeave={() => setState({ phase: "idle" })}
        onDrop={handleDrop}
        className={`rounded-xl px-6 py-5.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors ${
          state.phase === "drag-over"
            ? "border-[1.5px] border-accent bg-surface-2"
            : "border-[1.5px] border-dashed border-border bg-surface-2"
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="hidden sm:flex w-9.5 h-9.5 rounded-lg bg-surface border border-border items-center justify-center text-base">
            {state.phase === "drag-over" ? (
              <ArrowDownToLine aria-hidden="true" className="w-4 h-4" />
            ) : (
              <Upload aria-hidden="true" className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium">
              {state.phase === "drag-over"
                ? "Drop to import"
                : "Drop a file to import highlights"}
            </div>
            <div className="text-xs text-text-2 font-mono">
              .lua (recommended) · .sqlite3
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".lua,.sqlite3"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    );
  }

  if (state.phase === "uploading") {
    return (
      <div className="rounded-xl px-6 py-5.5 border-[1.5px] border-dashed border-border bg-surface-2 flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center">
            <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />
          </div>
          <div>
            <div className="text-sm font-medium">
              Parsing {state.fileName}…
            </div>
            <div className="text-xs text-text-2 font-mono">
              Matching highlights to your library
            </div>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (state.phase === "success") {
    const { result } = state;
    const message =
      result.kind === "highlights"
        ? `${result.fileName} — ${result.imported} imported, ${result.skipped} skipped`
        : `${result.fileName} — reading stats updated for ${result.booksUpdated} book${result.booksUpdated === 1 ? "" : "s"}`;
    return <Toast message={message} />;
  }

  return (
    <div className="rounded-xl p-6 border-[1.5px] border-dashed border-danger bg-surface-2 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-danger/20 text-danger">
          <CircleAlert aria-hidden="true" className="w-4 h-4" />
        </div>
        <div className="text-[15px] font-semibold text-danger">
          Couldn&apos;t read this file
        </div>
      </div>
      <div className="text-sm text-text-2 leading-relaxed">
        {state.result.fileName}{" "}
        {state.result.reason === "corrupt"
          ? "doesn't match the expected format."
          : "isn't a supported file type."}{" "}
        Check the file and try again, or see supported formats.
      </div>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => setState({ phase: "idle" })}
      >
        Try a different file
      </Button>
    </div>
  );
}
