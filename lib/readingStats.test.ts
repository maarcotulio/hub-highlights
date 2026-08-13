import { describe, expect, it } from "vitest";
import {
  aggregateDailyMinutes,
  buildHeatmapCells,
  computeStreak,
  formatReadTime,
  formatRelativeDate,
} from "./readingStats";

describe("aggregateDailyMinutes", () => {
  it("sums durations per UTC day", () => {
    const daily = aggregateDailyMinutes([
      { startTime: new Date("2026-03-03T10:00:00Z"), durationSec: 600 },
      { startTime: new Date("2026-03-03T20:00:00Z"), durationSec: 300 },
      { startTime: new Date("2026-03-04T08:00:00Z"), durationSec: 120 },
    ]);
    expect(daily.get("2026-03-03")).toBe(15);
    expect(daily.get("2026-03-04")).toBe(2);
  });
});

describe("computeStreak", () => {
  it("counts consecutive days with minutes back from today", () => {
    const today = new Date("2026-03-05T12:00:00Z");
    const daily = new Map([
      ["2026-03-05", 10],
      ["2026-03-04", 20],
      ["2026-03-03", 5],
      ["2026-03-01", 30], // gap on the 2nd breaks the streak
    ]);
    expect(computeStreak(daily, today)).toBe(3);
  });

  it("returns 0 when today has no reading", () => {
    const today = new Date("2026-03-05T12:00:00Z");
    const daily = new Map([["2026-03-04", 20]]);
    expect(computeStreak(daily, today)).toBe(0);
  });
});

describe("buildHeatmapCells", () => {
  it("returns one cell per day in the window", () => {
    const cells = buildHeatmapCells(new Map(), 30, new Date("2026-03-05T00:00:00Z"));
    expect(cells).toHaveLength(30);
  });

  it("returns UTC date and minutes metadata for every cell", () => {
    const today = new Date("2026-03-05T00:00:00Z");
    const daily = new Map([["2026-03-04", 20.5]]);
    const cells = buildHeatmapCells(daily, 3, today);

    expect(cells.map((cell) => cell.dateKey)).toEqual(["2026-03-03", "2026-03-04", "2026-03-05"]);
    expect(cells[0].dateLabel).toBe("Mar 3, 2026");
    expect(cells[0].minutes).toBeNull();
    expect(cells[1].minutes).toBe(20.5);
  });

  it("maps the busiest day to full accent intensity and empty days to surface-2", () => {
    const today = new Date("2026-03-05T00:00:00Z");
    const daily = new Map([
      ["2026-03-05", 60],
      ["2026-03-04", 20],
    ]);
    const cells = buildHeatmapCells(daily, 3, today);
    // Window is 2026-03-03, 03-04, 03-05 in order.
    expect(cells[0].color).toBe("var(--surface-2)");
    expect(cells[2].color).toBe("color-mix(in oklch, var(--accent) 100%, var(--surface))");
  });

  it("keeps the one-third and two-thirds intensity boundaries deterministic", () => {
    const today = new Date("2026-03-06T00:00:00Z");
    const daily = new Map([
      ["2026-03-01", 10],
      ["2026-03-02", 30],
      ["2026-03-03", 30.1],
      ["2026-03-04", 60],
      ["2026-03-05", 60.1],
      ["2026-03-06", 90],
    ]);

    const colors = buildHeatmapCells(daily, 6, today).map((cell) => cell.color);

    expect(colors).toEqual([
      "color-mix(in oklch, var(--accent) 30%, var(--surface))",
      "color-mix(in oklch, var(--accent) 30%, var(--surface))",
      "color-mix(in oklch, var(--accent) 60%, var(--surface))",
      "color-mix(in oklch, var(--accent) 60%, var(--surface))",
      "color-mix(in oklch, var(--accent) 100%, var(--surface))",
      "color-mix(in oklch, var(--accent) 100%, var(--surface))",
    ]);
  });

  it("keeps every cell at level 0 when there is no data at all", () => {
    const cells = buildHeatmapCells(new Map(), 5, new Date("2026-03-05T00:00:00Z"));
    expect(cells.every((c) => c.color === "var(--surface-2)")).toBe(true);
  });
});

describe("formatReadTime", () => {
  it("formats hours and minutes", () => {
    expect(formatReadTime(6 * 3600 + 5 * 60)).toBe("6h 05m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatReadTime(42 * 60)).toBe("42m");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-03-05T18:00:00Z");

  it("labels today and yesterday", () => {
    expect(formatRelativeDate(new Date("2026-03-05T02:00:00Z"), now)).toBe("today");
    expect(formatRelativeDate(new Date("2026-03-04T02:00:00Z"), now)).toBe("yesterday");
  });

  it("counts days ago within a month", () => {
    expect(formatRelativeDate(new Date("2026-03-02T02:00:00Z"), now)).toBe("3 days ago");
  });

  it("falls back to a short date beyond a month", () => {
    expect(formatRelativeDate(new Date(2026, 0, 1), now)).toBe("Jan 1, 2026");
  });

  it("falls back to a short date at exactly 30 days", () => {
    expect(formatRelativeDate(new Date(2026, 1, 3, 12), now)).toBe(
      "Feb 3, 2026"
    );
  });
});
