import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseKoreaderStatistics } from "./koreader-sqlite";

const fixture = new Uint8Array(
  readFileSync(join(__dirname, "__fixtures__", "koreader-statistics.sqlite3"))
);

describe("parseKoreaderStatistics", () => {
  it("parses all books with correct field mapping", async () => {
    const { books } = await parseKoreaderStatistics(fixture);
    expect(books).toHaveLength(3);

    const mountain = books.find((b) => b.title === "The Fictional Mountain");
    expect(mountain).toBeDefined();
    expect(mountain?.authors).toBe("A. Nonymous");
    expect(mountain?.series).toBe("Fictional Chronicles #1");
    expect(mountain?.language).toBe("en");
    expect(mountain?.md5).toBe("fake-md5-0001");
    expect(mountain?.pages).toBe(240);
    expect(mountain?.highlights).toBe(5);
    expect(mountain?.notes).toBe(2);
    expect(mountain?.totalReadTimeSec).toBe(5400);
    expect(mountain?.totalReadPages).toBe(180);
    expect(mountain?.lastOpenAt?.toISOString()).toBe("2026-08-07T05:57:01.000Z");
  });

  it("handles a null series", async () => {
    const { books } = await parseKoreaderStatistics(fixture);
    const sample = books.find((b) => b.title === "Sample Reading Test Book");
    expect(sample?.series).toBeNull();
  });

  it("parses page_stat_data rows joined to the book's md5", async () => {
    const { pageStats } = await parseKoreaderStatistics(fixture);
    expect(pageStats).toHaveLength(45);
    expect(pageStats.every((p) => p.bookMd5.length > 0)).toBe(true);
    expect(pageStats.every((p) => p.startTime instanceof Date)).toBe(true);

    const first = pageStats.find((p) => p.bookMd5 === "fake-md5-0001" && p.page === 1);
    expect(first).toBeDefined();
    expect(first?.durationSec).toBe(47);
    expect(first?.totalPages).toBe(240);
    expect(first?.startTime.toISOString()).toBe("2026-08-03T05:57:01.000Z");
  });
});
