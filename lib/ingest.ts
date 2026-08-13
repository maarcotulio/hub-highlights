import { prisma } from "@/lib/db";
import { Prisma } from "@/app/generated/prisma/client";
import { parseKoreaderMetadata } from "@/lib/parsers/koreader-lua";
import { parseKoreaderStatistics } from "@/lib/parsers/koreader-sqlite";
import type { RawHighlight } from "@/lib/parsers/normalize";
import type { UploadResult } from "@/lib/upload";

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000,
} as const;
const MAX_TRANSACTION_ATTEMPTS = 5;
const RETRYABLE_TRANSACTION_CODES = new Set(["P2002", "P2034"]);

function prismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

async function runSerializableTransaction<T>(
  operation: (db: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, TRANSACTION_OPTIONS);
    } catch (error) {
      const retryable = RETRYABLE_TRANSACTION_CODES.has(prismaErrorCode(error) ?? "");
      if (!retryable || attempt === MAX_TRANSACTION_ATTEMPTS) throw error;
    }
  }

  throw new Error("Transaction retry loop exhausted unexpectedly");
}

function groupByBook(highlights: RawHighlight[]) {
  const groups = new Map<
    string,
    { bookTitle: string; author: string | null; md5: string | null; highlights: RawHighlight[] }
  >();
  for (const h of highlights) {
    const key = `${h.bookTitle}\0${h.author ?? ""}`;
    const group = groups.get(key);
    if (group) {
      group.highlights.push(h);
      if (!group.md5 && h.md5) group.md5 = h.md5;
    } else {
      groups.set(key, { bookTitle: h.bookTitle, author: h.author, md5: h.md5, highlights: [h] });
    }
  }
  return [...groups.values()];
}

// Matches by KOReader's partial-content md5 first (survives title edits/typos
// across files), falling back to title+author — the same identity Prisma's
// `[userId, title, author, source]` unique constraint already uses. A
// find-then-create instead of an upsert because that compound key can't be
// used for the lookup when `author` is null (NULL never equals NULL in SQL).
async function findOrCreateBook(
  db: Prisma.TransactionClient,
  userId: string,
  title: string,
  author: string | null,
  md5: string | null
) {
  if (md5) {
    const byMd5 = await db.book.findFirst({ where: { userId, md5 } });
    if (byMd5) return byMd5;
  }

  const byTitle = await db.book.findFirst({
    where: { userId, title, author, source: "KOREADER" },
  });
  if (byTitle) {
    if (md5 && !byTitle.md5) {
      return db.book.update({ where: { id: byTitle.id }, data: { md5 } });
    }
    return byTitle;
  }

  return db.book.create({
    data: { userId, title, author, source: "KOREADER", md5 },
  });
}

async function ingestHighlights(
  userId: string,
  fileName: string,
  luaContent: string
): Promise<UploadResult> {
  let highlights: RawHighlight[];
  try {
    highlights = parseKoreaderMetadata(luaContent);
  } catch {
    return { status: "error", reason: "corrupt", fileName };
  }

  return runSerializableTransaction(async (db) => {
    let totalImported = 0;
    let totalSkipped = 0;

    for (const group of groupByBook(highlights)) {
      const book = await findOrCreateBook(
        db,
        userId,
        group.bookTitle,
        group.author,
        group.md5
      );

      const { count } = await db.highlight.createMany({
        data: group.highlights.map((h) => ({
          bookId: book.id,
          text: h.text,
          note: h.note,
          location: h.location,
          chapter: h.chapter,
          highlightedAt: h.highlightedAt,
          dedupeHash: h.dedupeHash,
        })),
        skipDuplicates: true,
      });

      totalImported += count;
      totalSkipped += group.highlights.length - count;
    }

    return {
      status: "success",
      kind: "highlights",
      imported: totalImported,
      skipped: totalSkipped,
      fileName,
    };
  });
}

async function ingestStatistics(
  userId: string,
  fileName: string,
  fileBuffer: Uint8Array
): Promise<UploadResult> {
  let parsed;
  try {
    parsed = await parseKoreaderStatistics(fileBuffer);
  } catch {
    return { status: "error", reason: "corrupt", fileName };
  }

  return runSerializableTransaction(async (db) => {
    let booksUpdated = 0;

    for (const stats of parsed.books) {
      // Without an md5 there's nothing reliable to match this stats row to a
      // book by, and no stable key to dedupe re-uploads against — skip it.
      if (!stats.md5) continue;

      const book = await findOrCreateBook(
        db,
        userId,
        stats.title,
        stats.authors,
        stats.md5
      );

      const bookStats = await db.bookStats.upsert({
        where: { bookId: book.id },
        update: {
          md5: stats.md5,
          totalPages: stats.pages,
          totalReadTimeSec: stats.totalReadTimeSec,
          totalReadPages: stats.totalReadPages,
          lastOpenAt: stats.lastOpenAt,
        },
        create: {
          bookId: book.id,
          md5: stats.md5,
          totalPages: stats.pages,
          totalReadTimeSec: stats.totalReadTimeSec,
          totalReadPages: stats.totalReadPages,
          lastOpenAt: stats.lastOpenAt,
        },
      });

      // KOReader's exported statistics.sqlite3 is always the full, cumulative
      // state — replacing every session is simpler and safer than trying to
      // dedupe individual reading sessions, which have no stable id upstream.
      await db.pageStat.deleteMany({ where: { bookStatsId: bookStats.id } });
      const pageStats = parsed.pageStats.filter((p) => p.bookMd5 === stats.md5);
      if (pageStats.length > 0) {
        await db.pageStat.createMany({
          data: pageStats.map((p) => ({
            bookStatsId: bookStats.id,
            page: p.page,
            startTime: p.startTime,
            durationSec: p.durationSec,
            totalPages: p.totalPages,
          })),
        });
      }

      booksUpdated += 1;
    }

    return { status: "success", kind: "stats", booksUpdated, fileName };
  });
}

export async function ingestUpload(
  userId: string,
  fileName: string,
  fileBuffer: ArrayBuffer
): Promise<UploadResult> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".sqlite3")) {
    return ingestStatistics(userId, fileName, new Uint8Array(fileBuffer));
  }

  if (lower.endsWith(".lua")) {
    return ingestHighlights(userId, fileName, new TextDecoder("utf-8").decode(fileBuffer));
  }

  return { status: "error", reason: "unsupported", fileName };
}
