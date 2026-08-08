export type HeatmapCell = { color: string };

export function ReadingHeatmap({ cells }: { cells: HeatmapCell[] }) {
  return (
    <div
      className="grid gap-[3px] w-max"
      style={{ gridTemplateRows: "repeat(7, 11px)", gridAutoFlow: "column", gridAutoColumns: "11px" }}
    >
      {cells.map((cell, i) => (
        <div key={i} className="w-[11px] h-[11px] rounded-[2px]" style={{ background: cell.color }} />
      ))}
    </div>
  );
}
