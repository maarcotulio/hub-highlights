export type ReadingStreakSummary = {
  active: boolean;
  readingDays: number;
  daysOffUsed: number;
  daysOffRemaining: number;
};

export type ReadingStreakOptions = {
  maxConsecutiveDaysOff?: number;
  today?: Date;
};

const MILLISECONDS_PER_DAY = 86_400_000;

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(laterDateKey: string, earlierDateKey: string): number {
  const later = new Date(`${laterDateKey}T00:00:00.000Z`);
  const earlier = new Date(`${earlierDateKey}T00:00:00.000Z`);
  return Math.round((later.getTime() - earlier.getTime()) / MILLISECONDS_PER_DAY);
}

function inactiveStreak(): ReadingStreakSummary {
  return {
    active: false,
    readingDays: 0,
    daysOffUsed: 0,
    daysOffRemaining: 0,
  };
}

export function computeReadingStreak(
  dailyMinutes: Map<string, number>,
  { maxConsecutiveDaysOff = 0, today = new Date() }: ReadingStreakOptions = {}
): ReadingStreakSummary {
  const todayKey = toUtcDateKey(today);
  const readingDateKeys = [...dailyMinutes]
    .filter(([dateKey, minutes]) => dateKey <= todayKey && minutes > 0)
    .map(([dateKey]) => dateKey)
    .sort((left, right) => right.localeCompare(left));
  const latestReadingDateKey = readingDateKeys[0];

  if (!latestReadingDateKey) return inactiveStreak();

  const daysOffUsed = daysBetween(todayKey, latestReadingDateKey);
  if (daysOffUsed > maxConsecutiveDaysOff) return inactiveStreak();

  let readingDays = 1;
  for (let index = 1; index < readingDateKeys.length; index += 1) {
    const gapDays = daysBetween(readingDateKeys[index - 1], readingDateKeys[index]) - 1;
    if (gapDays > maxConsecutiveDaysOff) break;
    readingDays += 1;
  }

  return {
    active: true,
    readingDays,
    daysOffUsed,
    daysOffRemaining: maxConsecutiveDaysOff - daysOffUsed,
  };
}
