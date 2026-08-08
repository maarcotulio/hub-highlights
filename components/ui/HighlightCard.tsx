export type HighlightItem = {
  id: string;
  text: string;
  note: string | null;
  location: string | null;
  chapter: string | null;
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

export function HighlightCard({ highlight }: { highlight: HighlightItem }) {
  const metadata = [
    highlight.chapter,
    highlight.location,
    formatDate(highlight.highlightedAt),
  ].filter((part): part is string => Boolean(part));

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
    </div>
  );
}
