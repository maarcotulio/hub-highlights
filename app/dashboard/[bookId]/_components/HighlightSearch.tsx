"use client";

import { useState } from "react";
import { HighlightCard, type HighlightItem } from "@/components/ui/HighlightCard";

export function HighlightSearch({ highlights }: { highlights: HighlightItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = query
    ? highlights.filter((h) => {
        const q = query.toLowerCase();
        return h.text.toLowerCase().includes(q) || h.tags.some((t) => t.toLowerCase().includes(q));
      })
    : highlights;

  return (
    <div>
      <input
        placeholder="Search highlights in this book…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full box-border text-sm px-4 py-3 rounded-lg border border-border bg-surface text-text mb-7 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {filtered.map((highlight) => (
        <HighlightCard key={highlight.id} highlight={highlight} />
      ))}
    </div>
  );
}
