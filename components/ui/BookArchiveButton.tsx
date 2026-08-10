"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BookArchiveButton({
  bookId,
  bookTitle,
  archived,
}: {
  bookId: string;
  bookTitle: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleClick() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!response.ok) throw new Error("Could not update the book");
      setSaving(false);
      setSuccess(archived ? "Reactivated" : "Archived");
      window.setTimeout(() => router.refresh(), 700);
    } catch {
      setError(archived ? "Could not reactivate book" : "Could not archive book");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        aria-label={`${archived ? "Reactivate" : "Archive"} “${bookTitle}”`}
        title={archived ? "Reactivate book" : "Archive book"}
        className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-text-2 hover:text-text hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : archived ? "Reactivate" : "Archive"}
      </button>
      {(error || success) && (
        <span
          role="status"
          className={`text-[11px] whitespace-nowrap ${error ? "text-danger" : "text-text-2"}`}
        >
          {error ?? success}
        </span>
      )}
    </div>
  );
}
