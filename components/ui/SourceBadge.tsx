import type { Source } from "@/lib/mock/types";

export function SourceBadge({ source }: { source: Source }) {
  const colorVar = source === "KINDLE" ? "--color-kindle" : "--color-koreader";
  const color = `var(${colorVar})`;

  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[11px] pl-2 pr-2.5 py-1 rounded-full whitespace-nowrap"
      style={{
        background: `color-mix(in oklch, ${color} 16%, var(--color-surface))`,
        color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      {source}
    </span>
  );
}
