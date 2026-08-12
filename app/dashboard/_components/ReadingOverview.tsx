import { ReadingHeatmap, type HeatmapCell } from "@/components/ui/ReadingHeatmap";
import { ProgressBar } from "@/components/ui/ProgressBar";

const LEGEND_SWATCHES = [
  "var(--surface-2)",
  "color-mix(in oklch, var(--accent) 30%, var(--surface))",
  "color-mix(in oklch, var(--accent) 60%, var(--surface))",
  "var(--accent)",
];

function StatCard({
  label,
  value,
  sublabel,
  className = "",
}: {
  label: string;
  value: string;
  sublabel: string;
  className?: string;
}) {
  return (
      <div className={`border border-border rounded-xl px-6 py-5 bg-surface-2 min-[600px]:flex-1 ${className}`}>
      <div className="text-[11px] font-mono text-text-2 tracking-wide mb-1.5">{label}</div>
      <div className="text-[28px] font-semibold font-mono">{value}</div>
      <div className="text-[12.5px] text-text-2 mt-1">{sublabel}</div>
    </div>
  );
}

export function ReadingOverview({
  totalTimeLabel,
  bookCount,
  streak,
  pagesRead,
  pagesTotal,
  heatmapCells,
  currentlyReading,
  finished,
  archivedBookCount,
}: {
  totalTimeLabel: string;
  bookCount: number;
  streak: number;
  pagesRead: number;
  pagesTotal: number;
  heatmapCells: HeatmapCell[];
  currentlyReading: { title: string; pagesLabel: string; pct: number; opened: string }[];
  finished: { title: string; finishedLabel: string }[];
  archivedBookCount: number;
}) {
  return (
    <div className="mb-10">
      <div className="text-lg font-semibold mb-5">Reading overview</div>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-5 mb-7 min-[600px]:flex min-[600px]:flex-wrap">
        <StatCard
          label="TOTAL TIME READ"
          value={totalTimeLabel}
          sublabel={`reading history across ${bookCount} book${bookCount === 1 ? "" : "s"}${archivedBookCount > 0 ? " (including archived)" : ""}`}
        />
        <StatCard
          label="CURRENT STREAK"
          value={`${streak} day${streak === 1 ? "" : "s"}`}
          sublabel={streak > 0 ? "last read today" : "no active streak"}
        />
        <StatCard
          label="PAGES READ (ALL TIME)"
          value={pagesRead.toLocaleString("en-US")}
          sublabel={`of ${pagesTotal.toLocaleString("en-US")} total`}
          className="min-[420px]:col-span-2 min-[600px]:col-span-1"
        />
      </div>

      <div className="mb-8 w-full">
        <div className="flex justify-between items-baseline mb-2.5 gap-4 flex-wrap">
          <div className="text-sm text-text-2">Reading activity</div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-2">
            LESS
            {LEGEND_SWATCHES.map((color, i) => (
              <span key={i} className="w-2.5 h-2.5 rounded-[2px] border border-border" style={{ background: color }} />
            ))}
            MORE
          </div>
        </div>
        <ReadingHeatmap cells={heatmapCells} />
      </div>

      {(currentlyReading.length > 0 || finished.length > 0) && (
        <div className="flex gap-8 flex-wrap">
          {currentlyReading.length > 0 && (
            <div className="flex-1 min-w-64">
              <div className="text-sm text-text-2 mb-3">Currently reading</div>
              {currentlyReading.map((b) => (
                <div key={b.title} className="py-3.5 border-b border-border">
                  <div className="flex justify-between items-baseline gap-3 mb-1.5">
                    <span className="text-[14.5px] font-medium truncate">{b.title}</span>
                    <span className="text-xs font-mono text-text-2 whitespace-nowrap">{b.pagesLabel}</span>
                  </div>
                  <div className="mb-1.5">
                    <ProgressBar percent={b.pct} />
                  </div>
                  <div className="text-xs text-text-2">Opened {b.opened}</div>
                </div>
              ))}
            </div>
          )}
          {finished.length > 0 && (
            <div className="flex-1 min-w-64">
              <div className="text-sm text-text-2 mb-3">Finished</div>
              {finished.map((b) => (
                <div
                  key={b.title}
                  className="py-3.5 border-b border-border flex justify-between items-center gap-3"
                >
                  <span className="text-[14.5px] font-medium truncate">{b.title}</span>
                  <span className="text-xs font-mono text-text-2 whitespace-nowrap">{b.finishedLabel}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
