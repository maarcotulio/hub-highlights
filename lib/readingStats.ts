import type { HeatmapCell } from "@/components/ui/ReadingHeatmap";

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatUtcDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function aggregateDailyMinutes(
  pageStats: { startTime: Date; durationSec: number }[]
): Map<string, number> {
  const daily = new Map<string, number>();
  for (const p of pageStats) {
    const key = toDateKey(p.startTime);
    daily.set(key, (daily.get(key) ?? 0) + p.durationSec / 60);
  }
  return daily;
}

function levelFor(minutes: number, max: number): 0 | 1 | 2 | 3 {
  if (minutes <= 0 || max <= 0) return 0;
  const ratio = minutes / max;
  if (ratio > 2 / 3) return 3;
  if (ratio > 1 / 3) return 2;
  return 1;
}

const HEATMAP_INTENSITY: Record<1 | 2 | 3, number> = { 1: 30, 2: 60, 3: 100 };

function heatmapColor(level: 0 | 1 | 2 | 3): string {
  if (level === 0) return "var(--surface-2)";
  return `color-mix(in oklch, var(--accent) ${HEATMAP_INTENSITY[level]}%, var(--surface))`;
}

// Relative intensity (most active day in the window = full accent), matching
// the design's stated scale rather than fixed absolute minute thresholds —
// a light reader's "busy day" should still read as fully lit.
export function buildHeatmapCells(
  dailyMinutes: Map<string, number>,
  days: number = 371,
  today: Date = new Date()
): HeatmapCell[] {
  const start = new Date(today);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const values: { date: Date; dateKey: string; minutes: number | null }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const dateKey = toDateKey(date);
    values.push({
      date,
      dateKey,
      minutes: dailyMinutes.has(dateKey) ? dailyMinutes.get(dateKey) ?? 0 : null,
    });
  }

  const max = Math.max(0, ...values.map(({ minutes }) => minutes ?? 0));
  return values.map(({ date, dateKey, minutes }) => ({
    dateKey,
    dateLabel: formatUtcDate(date),
    minutes,
    color: heatmapColor(levelFor(minutes ?? 0, max)),
  }));
}

export function formatReadTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const startOfUtcDay = (d: Date) => {
    const c = new Date(d);
    c.setUTCHours(0, 0, 0, 0);
    return c.getTime();
  };
  const diffDays = Math.round((startOfUtcDay(now) - startOfUtcDay(date)) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return formatDate(date);
}
