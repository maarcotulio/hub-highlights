import { ProgressBar } from "./ProgressBar";

export type StatCell =
  | { label: string; value: string }
  | { label: string; value: string; progressPercent: number };

export function StatRow({ cells }: { cells: StatCell[] }) {
  return (
    <div className="flex items-stretch border border-border rounded-xl bg-surface-2 overflow-hidden">
      {cells.map((cell, i) => (
        <div key={cell.label} className="flex items-stretch flex-1 min-w-0">
          {i > 0 && <div className="w-px bg-border shrink-0" />}
          <div className="flex-1 min-w-0 px-6 py-4.5 flex flex-col justify-center gap-1.5">
            {"progressPercent" in cell ? (
              <>
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-[11px] font-mono text-text-2 tracking-wide">
                    {cell.label}
                  </span>
                  <span className="text-xs font-mono text-text-2 whitespace-nowrap">
                    {cell.value}
                  </span>
                </div>
                <ProgressBar percent={cell.progressPercent} />
              </>
            ) : (
              <>
                <span className="text-[11px] font-mono text-text-2 tracking-wide">
                  {cell.label}
                </span>
                <span className="text-[22px] font-semibold font-mono">{cell.value}</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
