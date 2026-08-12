"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExportAllButton } from "./ExportAllButton";

export function DashboardMobileMenu({ totalBookCount }: { totalBookCount: number }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="fixed top-5 left-5 z-50 min-[460px]:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-surface text-text cursor-pointer hover:bg-surface-2"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-4 h-4"
        >
          <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 flex flex-col gap-1 p-2 rounded-lg border border-border bg-surface shadow-md min-w-40">
          <Link
            href="/dashboard/archive"
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg text-text-2 hover:text-text hover:bg-surface-2 transition-opacity"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-4 h-4"
            >
              <path d="M3.5 6.5h13l-1 10h-11l-1-10Z" strokeLinejoin="round" />
              <path d="M2.5 3.5h15v3h-15zM7.5 10h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Archived
          </Link>
          <Link
            href="/dashboard/settings"
            className="text-sm font-medium px-3 py-2 rounded-lg text-text-2 hover:text-text hover:bg-surface-2 transition-opacity"
          >
            ⚙ Settings
          </Link>
          {totalBookCount > 0 && (
            <ExportAllButton fileCount={totalBookCount} className="w-full text-left" />
          )}
        </div>
      )}
    </div>
  );
}
