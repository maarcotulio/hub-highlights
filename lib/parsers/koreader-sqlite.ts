import { join } from "path";
import initSqlJs, { type QueryExecResult, type SqlValue } from "sql.js";

type Db = InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>;

export interface RawBookStats {
  title: string;
  authors: string | null;
  series: string | null;
  language: string | null;
  md5: string | null;
  pages: number;
  highlights: number;
  notes: number;
  totalReadTimeSec: number;
  totalReadPages: number;
  lastOpenAt: Date | null;
}

export interface RawPageStat {
  bookMd5: string;
  page: number;
  startTime: Date;
  durationSec: number;
  totalPages: number;
}

export interface ParsedKoreaderStatistics {
  books: RawBookStats[];
  pageStats: RawPageStat[];
}

/**
 * Parses a KOReader statistics.sqlite3 file into typed, normalized objects.
 *
 * Written against KOReader's own public, open-source schema
 * (plugins/statistics.koplugin/main.lua, GPLv3: tables `book` +
 * `page_stat_data`), not against any real user's database contents.
 *
 * Uses sql.js (WASM SQLite) instead of a native binding so this runs the
 * same way locally and on Vercel's Node runtime, with no compile step.
 */
export async function parseKoreaderStatistics(
  fileBuffer: Uint8Array
): Promise<ParsedKoreaderStatistics> {
  // sql.js's own default `locateFile` resolves relative to a `__dirname` that
  // Next.js's bundler rewrites to a virtual path (breaks with an ENOENT for
  // sql-wasm.wasm) — pointing it at the real on-disk node_modules path
  // sidesteps that entirely. Works the same under plain Node/Vitest too.
  const SQL = await initSqlJs({
    locateFile: (file) => join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database(fileBuffer);

  try {
    return {
      books: parseBooks(db),
      pageStats: parsePageStats(db),
    };
  } finally {
    db.close();
  }
}

function toRecords(result: QueryExecResult[]): Record<string, SqlValue>[] {
  if (result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

function parseBooks(db: Db): RawBookStats[] {
  const result = db.exec(`
    SELECT title, authors, series, language, md5, pages,
           highlights, notes, total_read_time, total_read_pages, last_open
    FROM book;
  `);

  return toRecords(result).map((record) => ({
    title: typeof record.title === "string" && record.title ? record.title : "Untitled",
    authors: typeof record.authors === "string" ? record.authors : null,
    series: typeof record.series === "string" ? record.series : null,
    language: typeof record.language === "string" ? record.language : null,
    md5: typeof record.md5 === "string" ? record.md5 : null,
    pages: Number(record.pages ?? 0),
    highlights: Number(record.highlights ?? 0),
    notes: Number(record.notes ?? 0),
    totalReadTimeSec: Number(record.total_read_time ?? 0),
    totalReadPages: Number(record.total_read_pages ?? 0),
    lastOpenAt: record.last_open ? new Date(Number(record.last_open) * 1000) : null,
  }));
}

function parsePageStats(db: Db): RawPageStat[] {
  // Join through `book` for a stable identifier (`md5`) instead of exposing
  // the internal autoincrement `id_book`, which is meaningless outside this
  // specific file.
  const result = db.exec(`
    SELECT book.md5 AS book_md5, psd.page, psd.start_time,
           psd.duration, psd.total_pages
    FROM page_stat_data psd
    JOIN book ON book.id = psd.id_book;
  `);

  return toRecords(result).map((record) => ({
    bookMd5: typeof record.book_md5 === "string" ? record.book_md5 : "",
    page: Number(record.page ?? 0),
    startTime: new Date(Number(record.start_time ?? 0) * 1000),
    durationSec: Number(record.duration ?? 0),
    totalPages: Number(record.total_pages ?? 0),
  }));
}
