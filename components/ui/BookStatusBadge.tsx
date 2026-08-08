"use client";

import { useState, type MouseEvent } from "react";
import { BOOK_STATUS_META, nextBookStatus, type BookStatus } from "@/lib/bookStatus";

async function persistStatus(bookId: string, status: BookStatus): Promise<boolean> {
  try {
    const response = await fetch(`/api/books/${bookId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function BookStatusBadge({
  bookId,
  status: initialStatus,
}: {
  bookId: string;
  status: BookStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const meta = BOOK_STATUS_META[status];

  async function handleClick(e: MouseEvent) {
    // BookRow wraps this in a Link — clicking the badge should cycle the
    // status, not navigate to the book.
    e.preventDefault();
    e.stopPropagation();

    const next = nextBookStatus(status);
    setStatus(next);
    const ok = await persistStatus(bookId, next);
    if (!ok) setStatus(status);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="font-mono text-[11px] px-2.5 py-[5px] rounded-full whitespace-nowrap cursor-pointer border"
      style={{ color: meta.color, borderColor: meta.border, background: meta.background }}
      title="Click to change reading status"
    >
      {meta.label}
    </button>
  );
}
