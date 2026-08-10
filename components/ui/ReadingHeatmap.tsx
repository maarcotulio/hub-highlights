export type HeatmapCell = {
  dateKey: string;
  dateLabel: string;
  minutes: number | null;
  color: string;
};

function cellLabel(cell: HeatmapCell): string {
  if (cell.minutes === null) return `${cell.dateLabel}: no reading duration recorded`;
  const minutes = Math.round(cell.minutes);
  return `${cell.dateLabel}: ${minutes} minute${minutes === 1 ? "" : "s"} read`;
}

function cellDurationLabel(cell: HeatmapCell): string {
  if (cell.minutes === null) return "No reading duration recorded";
  const minutes = Math.round(cell.minutes);
  return `${minutes} minute${minutes === 1 ? "" : "s"} read`;
}

function tooltipPosition(index: number, columns: number): string {
  if (index < 7) return "left-0 translate-x-0";
  if (index >= (columns - 1) * 7) return "left-auto right-0 translate-x-0";
  return "left-1/2 -translate-x-1/2";
}

export function ReadingHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const columns = Math.ceil(cells.length / 7);

  return (
    <div
      className="grid w-full gap-[3px]"
      style={{
        gridTemplateRows: "repeat(7, minmax(0, 1fr))",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoFlow: "column",
      }}
      aria-label="Reading activity by day"
    >
      {cells.map((cell, index) => (
        <span
          key={cell.dateKey}
          role="img"
          tabIndex={0}
          aria-label={cellLabel(cell)}
          className="group relative block w-full aspect-square min-w-0 rounded-[2px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className="block w-full h-full rounded-[2px]"
            style={{ background: cell.color }}
          />
          <span
            role="tooltip"
            className={`pointer-events-none invisible absolute bottom-full z-10 mb-2 flex min-w-max flex-col gap-0.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] font-mono text-text shadow-md opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${tooltipPosition(index, columns)}`}
          >
            <span className="font-medium">{cell.dateLabel}</span>
            <span className="text-text-2">{cellDurationLabel(cell)}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
