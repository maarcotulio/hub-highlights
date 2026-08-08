"use client";

import { useRef, useState, useEffect, type DragEvent } from "react";
import { simulateUpload } from "@/lib/mock/upload-simulation";
import type { UploadResult } from "@/lib/mock/types";
import { Button } from "./Button";

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
    const result = await simulateUpload(file);
    setState(
      result.status === "success"
        ? { phase: "success", result }
        : { phase: "error", result }
    );
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
        className={`rounded-xl px-6 py-5.5 flex items-center justify-between gap-4 transition-colors ${
          state.phase === "drag-over"
            ? "border-[1.5px] border-accent bg-surface-2"
            : "border-[1.5px] border-dashed border-border bg-surface-2"
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-9.5 h-9.5 rounded-lg bg-surface border border-border flex items-center justify-center text-base">
            {state.phase === "drag-over" ? "↓" : "↑"}
          </div>
          <div>
            <div className="text-sm font-medium">
              {state.phase === "drag-over"
                ? "Drop to import"
                : "Drop a file to import highlights"}
            </div>
            <div className="text-xs text-text-2 font-mono">
              .txt · .lua · .sqlite3
            </div>
          </div>
        </div>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.lua,.sqlite3"
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
          <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-sm font-mono">
            ↻
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
    return (
      <div className="rounded-xl p-6 border border-border bg-surface-2 flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm bg-koreader/20 text-koreader">
            ✓
          </div>
          <div className="text-[15px] font-semibold">Import complete</div>
        </div>
        <div className="text-sm">
          {state.result.imported} new highlights imported
        </div>
        <div className="text-sm text-text-2">
          {state.result.skipped} skipped — already existed in your library
        </div>
        <div className="text-xs font-mono text-text-2 pt-1.5 border-t border-border">
          {state.result.fileName}
        </div>
        <Button
          variant="ghost"
          className="self-start px-0"
          onClick={() => setState({ phase: "idle" })}
        >
          Import another file
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-6 border-[1.5px] border-dashed border-danger bg-surface-2 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm bg-danger/20 text-danger">
          !
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
