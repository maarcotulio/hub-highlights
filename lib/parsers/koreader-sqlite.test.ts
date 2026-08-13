import { readFileSync } from "fs";
import { join } from "path";
import initSqlJs from "sql.js";
import { describe, expect, it, vi } from "vitest";
import { parseKoreaderStatistics } from "./koreader-sqlite";

const fixture = new Uint8Array(
  readFileSync(join(__dirname, "__fixtures__", "koreader-statistics.sqlite3"))
);

async function databaseBytes(statements: string[] = []): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(`
      CREATE TABLE book (
        id INTEGER PRIMARY KEY,
        title,
        authors,
        series,
        language,
        md5,
        pages,
        highlights,
        notes,
        total_read_time,
        total_read_pages,
        last_open
      );
      CREATE TABLE page_stat_data (
        id_book,
        page,
        start_time,
        duration,
        total_pages
      );
    `);
    for (const statement of statements) db.run(statement);
    return db.export();
  } finally {
    db.close();
  }
}

describe("parseKoreaderStatistics", () => {
  it("closes the real SQLite database after a successful parse", async () => {
    const SQL = await initSqlJs();
    const close = vi.spyOn(SQL.Database.prototype, "close");

    try {
      await parseKoreaderStatistics(fixture);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      close.mockRestore();
    }
  });

  it("closes the real SQLite database when a query fails", async () => {
    const SQL = await initSqlJs();
    const emptyDatabase = new SQL.Database();
    const bytes = emptyDatabase.export();
    emptyDatabase.close();
    const close = vi.spyOn(SQL.Database.prototype, "close");

    try {
      await expect(parseKoreaderStatistics(bytes)).rejects.toThrow(/no such table: book/i);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      close.mockRestore();
    }
  });

  it("returns empty collections for a valid database with no rows", async () => {
    const parsed = await parseKoreaderStatistics(await databaseBytes());

    expect(parsed).toEqual({ books: [], pageStats: [] });
  });

  it("normalizes nullable and wrong-typed fields without inventing identifiers", async () => {
    const bytes = await databaseBytes([
      `INSERT INTO book (
        id, title, authors, series, language, md5, pages, highlights, notes,
        total_read_time, total_read_pages, last_open
      ) VALUES (1, NULL, 42, NULL, 7, 99, NULL, '4', NULL, NULL, '8', 0)`,
      `INSERT INTO page_stat_data (
        id_book, page, start_time, duration, total_pages
      ) VALUES (1, NULL, NULL, NULL, NULL)`,
    ]);

    const parsed = await parseKoreaderStatistics(bytes);

    expect(parsed.books).toEqual([
      {
        title: "Untitled",
        authors: null,
        series: null,
        language: null,
        md5: null,
        pages: 0,
        highlights: 4,
        notes: 0,
        totalReadTimeSec: 0,
        totalReadPages: 8,
        lastOpenAt: null,
      },
    ]);
    expect(parsed.pageStats).toEqual([
      {
        bookMd5: "",
        page: 0,
        startTime: new Date(0),
        durationSec: 0,
        totalPages: 0,
      },
    ]);
  });

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
