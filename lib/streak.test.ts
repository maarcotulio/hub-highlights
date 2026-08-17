import { describe, expect, it } from "vitest";
import { computeReadingStreak } from "./streak";

describe("computeReadingStreak", () => {
  const today = new Date("2026-03-05T12:00:00Z");

  it("keeps the existing daily-reading behavior when no days off are allowed", () => {
    const summary = computeReadingStreak(
      new Map([
        ["2026-03-05", 10],
        ["2026-03-04", 20],
        ["2026-03-03", 5],
        ["2026-03-01", 30],
      ]),
      { today }
    );

    expect(summary).toEqual({
      active: true,
      readingDays: 3,
      daysOffUsed: 0,
      daysOffRemaining: 0,
    });
  });

  it("counts only reading days while bridging an allowed gap", () => {
    const summary = computeReadingStreak(
      new Map([
        ["2026-03-05", 10],
        ["2026-03-02", 20],
      ]),
      { maxConsecutiveDaysOff: 2, today }
    );

    expect(summary).toEqual({
      active: true,
      readingDays: 2,
      daysOffUsed: 0,
      daysOffRemaining: 2,
    });
  });

  it("keeps a streak active through exactly the configured trailing days off", () => {
    const summary = computeReadingStreak(
      new Map([
        ["2026-03-03", 20],
        ["2026-03-02", 5],
      ]),
      { maxConsecutiveDaysOff: 2, today }
    );

    expect(summary).toEqual({
      active: true,
      readingDays: 2,
      daysOffUsed: 2,
      daysOffRemaining: 0,
    });
  });

  it("starts a new streak when a gap is longer than the configured allowance", () => {
    const summary = computeReadingStreak(
      new Map([
        ["2026-03-05", 10],
        ["2026-03-01", 20],
      ]),
      { maxConsecutiveDaysOff: 2, today }
    );

    expect(summary).toEqual({
      active: true,
      readingDays: 1,
      daysOffUsed: 0,
      daysOffRemaining: 2,
    });
  });

  it("ends a streak after one more trailing day off than the allowance", () => {
    const summary = computeReadingStreak(
      new Map([["2026-03-02", 20]]),
      { maxConsecutiveDaysOff: 2, today }
    );

    expect(summary).toEqual({
      active: false,
      readingDays: 0,
      daysOffUsed: 0,
      daysOffRemaining: 0,
    });
  });

  it("treats a day with zero minutes as a day off", () => {
    const summary = computeReadingStreak(
      new Map([
        ["2026-03-05", 0],
        ["2026-03-04", 20],
      ]),
      { maxConsecutiveDaysOff: 1, today }
    );

    expect(summary).toEqual({
      active: true,
      readingDays: 1,
      daysOffUsed: 1,
      daysOffRemaining: 0,
    });
  });
  it("ignores activity dated after today", () => {
    const summary = computeReadingStreak(
      new Map([
        ["2026-03-06", 30],
        ["2026-03-05", 20],
      ]),
      { maxConsecutiveDaysOff: 2, today }
    );

    expect(summary).toEqual({
      active: true,
      readingDays: 1,
      daysOffUsed: 0,
      daysOffRemaining: 2,
    });
  });
});
