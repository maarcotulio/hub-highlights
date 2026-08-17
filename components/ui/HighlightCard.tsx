"use client";

import { useState } from "react";
import { X } from "lucide-react";

export type HighlightItem = {
  id: string;
  text: string;
  note: string | null;
  location: string | null;
  chapter: string | null;
  tags: string[];
  highlightedAt: Date | null;
};

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function persistTags(highlightId: string, tags: string[]): Promise<boolean> {
  try {
    const response = await fetch(`/api/highlights/${highlightId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function HighlightCard({ highlight }: { highlight: HighlightItem }) {
  const [tags, setTags] = useState(highlight.tags);
  const [draft, setDraft] = useState("");

  const metadata = [
    highlight.chapter,
    highlight.location,
    formatDate(highlight.highlightedAt),
  ].filter((part): part is string => Boolean(part));

  async function updateTags(next: string[]) {
    const previous = tags;
    setTags(next);
    const ok = await persistTags(highlight.id, next);
    if (!ok) setTags(previous);
  }

  function handleAddTag() {
    const value = draft.trim();
    setDraft("");
    if (!value || tags.includes(value)) return;
    updateTags([...tags, value]);
  }

  return (
    <div className="py-5 border-b border-border flex flex-col gap-2.5">
      <div className="border-l-[3px] border-accent pl-4 text-lg leading-relaxed italic">
        &ldquo;{highlight.text}&rdquo;
      </div>
      {highlight.note && (
        <div className="ml-4 text-sm bg-surface-2 rounded-lg px-3.5 py-2.5 flex gap-2">
          <span className="text-text-2">Note —</span>
          {highlight.note}
        </div>
      )}
      {metadata.length > 0 && (
        <div className="ml-4 font-mono text-xs text-text-2">
          {metadata.join(" · ")}
        </div>
      )}
      <div className="ml-4 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-full bg-surface-2 border border-border text-text-2"
          >
            {tag}
            <button
              type="button"
              onClick={() => updateTags(tags.filter((t) => t !== tag))}
              className="inline-flex items-center cursor-pointer hover:text-text"
              aria-label={`Remove tag ${tag}`}
            >
              <X aria-hidden="true" className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTag();
            }
          }}
          onBlur={handleAddTag}
          placeholder="+ tag"
          className="text-xs font-mono px-2 py-1 rounded-full bg-transparent border border-dashed border-border text-text-2 w-20 focus:outline-none focus:border-accent focus:w-28 transition-all"
        />
      </div>
    </div>
  );
}
