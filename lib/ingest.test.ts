import { readFileSync } from "fs";
import { join } from "path";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findBook: vi.fn(),
  createBook: vi.fn(),
  updateBook: vi.fn(),
  createHighlights: vi.fn(),
  upsertBookStats: vi.fn(),
  deletePageStats: vi.fn(),
  createPageStats: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    book: {
      findFirst: mocks.findBook,
      create: mocks.createBook,
      update: mocks.updateBook,
    },
    highlight: { createMany: mocks.createHighlights },
    bookStats: { upsert: mocks.upsertBookStats },
    pageStat: { deleteMany: mocks.deletePageStats, createMany: mocks.createPageStats },
  },
}));

import { ingestUpload } from "./ingest";

const lua = `return {
  ["doc_props"] = { ["title"] = "A Test Book", ["authors"] = "Example Author" },
  ["annotations"] = {
    [1] = {
      ["color"] = "yellow",
      ["text"] = "A quotation worth keeping",
      ["pageno"] = 42,
    },
  },
}`;
const statisticsFixture = readFileSync(
  join(__dirname, "parsers", "__fixtures__", "koreader-statistics.sqlite3")
);

function bytes(content: string): ArrayBuffer {
  return new TextEncoder().encode(content).buffer as ArrayBuffer;
}

function metadataLua(title: string, text: string, md5: string | null): string {
  const checksum = md5 === null ? "" : `["partial_md5_checksum"] = ${JSON.stringify(md5)},`;
  return `return {
    ${checksum}
    ["doc_props"] = { ["title"] = ${JSON.stringify(title)}, ["authors"] = "Example Author" },
    ["annotations"] = {
      [1] = { ["color"] = "yellow", ["text"] = ${JSON.stringify(text)}, ["pageno"] = 42 },
    },
  }`;
}

async function statisticsBytes(md5: string | null): Promise<ArrayBuffer> {
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
    db.run(
      `INSERT INTO book (
        id, title, authors, md5, pages, highlights, notes,
        total_read_time, total_read_pages, last_open
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, "A Stats Book", "Example Author", md5, 120, 0, 0, 600, 10, 1_786_464_000]
    );
    return Uint8Array.from(db.export()).buffer as ArrayBuffer;
  } finally {
    db.close();
  }
}

describe("ingestUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const books: Array<{
      id: string;
      userId: string;
      title: string;
      author: string | null;
      source: string;
      md5: string | null;
    }> = [];
    const highlightKeys = new Set<string>();

    mocks.findBook.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      books.find((book) => {
        if (where.userId !== book.userId) return false;
        if (where.md5 !== undefined) return where.md5 === book.md5;
        return (
          where.title === book.title &&
          where.author === book.author &&
          where.source === book.source
        );
      }) ?? null
    );
    mocks.createBook.mockImplementation(async ({ data }) => {
      const book = { id: `book-${books.length + 1}`, ...data };
      books.push(book);
      return book;
    });
    mocks.updateBook.mockImplementation(async ({ where, data }) => {
      const book = books.find((candidate) => candidate.id === where.id)!;
      Object.assign(book, data);
      return book;
    });
    mocks.createHighlights.mockImplementation(async ({ data, skipDuplicates }) => {
      let count = 0;
      for (const highlight of data) {
        const key = `${highlight.bookId}:${highlight.dedupeHash}`;
        if (!highlightKeys.has(key)) {
          highlightKeys.add(key);
          count += 1;
        } else if (!skipDuplicates) {
          throw new Error("duplicate highlight constraint");
        }
      }
      return { count };
    });
    mocks.upsertBookStats.mockImplementation(async ({ where }) => ({
      id: `stats-${where.bookId}`,
    }));
    mocks.deletePageStats.mockResolvedValue({ count: 0 });
    mocks.createPageStats.mockImplementation(async ({ data }) => ({ count: data.length }));
    mocks.transaction.mockImplementation(async (operation) =>
      operation({
        book: {
          findFirst: mocks.findBook,
          create: mocks.createBook,
          update: mocks.updateBook,
        },
        highlight: { createMany: mocks.createHighlights },
        bookStats: { upsert: mocks.upsertBookStats },
        pageStat: { deleteMany: mocks.deletePageStats, createMany: mocks.createPageStats },
      })
    );
  });

  it("persists an accepted upload in a serializable transaction", async () => {
    await ingestUpload("user-1", "metadata.epub.lua", bytes(lua));

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 30_000,
    });
  });

  it("retries the complete transaction after a serialization conflict", async () => {
    const serializationConflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    const runTransaction = mocks.transaction.getMockImplementation()!;
    mocks.transaction
      .mockRejectedValueOnce(serializationConflict)
      .mockRejectedValueOnce(serializationConflict)
      .mockImplementation(runTransaction);

    await expect(
      ingestUpload("user-1", "metadata.epub.lua", bytes(lua))
    ).resolves.toMatchObject({ status: "success", imported: 1 });
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });

  it("retries the complete transaction after losing a concurrent book-create race", async () => {
    const uniqueConflict = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const runTransaction = mocks.transaction.getMockImplementation()!;
    mocks.transaction.mockRejectedValueOnce(uniqueConflict).mockImplementation(runTransaction);

    await expect(
      ingestUpload("user-1", "metadata.epub.lua", bytes(lua))
    ).resolves.toMatchObject({ status: "success", imported: 1 });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("stops after five retryable transaction conflicts", async () => {
    const serializationConflict = Object.assign(new Error("write conflict"), { code: "P2034" });
    mocks.transaction.mockRejectedValue(serializationConflict);

    await expect(
      ingestUpload("user-1", "metadata.epub.lua", bytes(lua))
    ).rejects.toBe(serializationConflict);
    expect(mocks.transaction).toHaveBeenCalledTimes(5);
  });

  it("does not retry a non-transactional persistence error", async () => {
    const persistenceFailure = new Error("database unavailable");
    mocks.transaction.mockRejectedValue(persistenceFailure);

    await expect(
      ingestUpload("user-1", "metadata.epub.lua", bytes(lua))
    ).rejects.toBe(persistenceFailure);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("does not create a duplicate when the same file is imported again", async () => {
    const first = await ingestUpload("user-1", "metadata.epub.lua", bytes(lua));
    const second = await ingestUpload("user-1", "metadata.epub.lua", bytes(lua));

    expect(first).toMatchObject({
      status: "success",
      kind: "highlights",
      imported: 1,
      skipped: 0,
    });
    expect(second).toMatchObject({
      status: "success",
      kind: "highlights",
      imported: 0,
      skipped: 1,
    });
  });

  it("imports multiple highlights for one book in a single persistence batch", async () => {
    const multipleHighlights = `return {
      ["doc_props"] = { ["title"] = "A Test Book", ["authors"] = "Example Author" },
      ["annotations"] = {
        [1] = { ["color"] = "yellow", ["text"] = "First quotation", ["pageno"] = 4 },
        [2] = { ["color"] = "yellow", ["text"] = "Second quotation", ["pageno"] = 9 },
      },
    }`;

    const result = await ingestUpload(
      "user-1",
      "metadata.epub.lua",
      bytes(multipleHighlights)
    );

    expect(result).toMatchObject({ status: "success", imported: 2, skipped: 0 });
    expect(mocks.createBook).toHaveBeenCalledOnce();
    expect(mocks.createHighlights).toHaveBeenCalledOnce();
    expect(mocks.createHighlights.mock.calls[0][0].data).toHaveLength(2);
  });

  it("reports malformed Lua as corrupt without writing data", async () => {
    const result = await ingestUpload("user-1", "metadata.epub.lua", bytes("return {"));

    expect(result).toEqual({
      status: "error",
      reason: "corrupt",
      fileName: "metadata.epub.lua",
    });
    expect(mocks.createBook).not.toHaveBeenCalled();
    expect(mocks.createHighlights).not.toHaveBeenCalled();
  });

  it("reports malformed SQLite as corrupt without opening a transaction", async () => {
    const corrupt = new Uint8Array([0x6e, 0x6f, 0x74, 0x2d, 0x73, 0x71, 0x6c, 0x69, 0x74, 0x65]);

    const result = await ingestUpload(
      "user-1",
      "statistics.sqlite3",
      corrupt.buffer as ArrayBuffer
    );

    expect(result).toEqual({
      status: "error",
      reason: "corrupt",
      fileName: "statistics.sqlite3",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types before touching persistence", async () => {
    const result = await ingestUpload("user-1", "highlights.txt", bytes("text"));

    expect(result).toEqual({
      status: "error",
      reason: "unsupported",
      fileName: "highlights.txt",
    });
    expect(mocks.findBook).not.toHaveBeenCalled();
  });

  it("uses KOReader's content checksum to keep a renamed book attached to one record", async () => {
    await ingestUpload(
      "user-1",
      "metadata.epub.lua",
      bytes(metadataLua("Original Title", "First quotation", "stable-md5"))
    );
    await ingestUpload(
      "user-1",
      "metadata.epub.lua",
      bytes(metadataLua("Renamed Title", "Second quotation", "stable-md5"))
    );

    expect(mocks.createBook).toHaveBeenCalledOnce();
    const firstBookId = mocks.createHighlights.mock.calls[0][0].data[0].bookId;
    const secondBookId = mocks.createHighlights.mock.calls[1][0].data[0].bookId;
    expect(secondBookId).toBe(firstBookId);
  });

  it("attaches a newly available checksum to an existing title match", async () => {
    await ingestUpload(
      "user-1",
      "metadata.epub.lua",
      bytes(metadataLua("Stable Title", "First quotation", null))
    );
    await ingestUpload(
      "user-1",
      "metadata.epub.lua",
      bytes(metadataLua("Stable Title", "Second quotation", "new-md5"))
    );

    expect(mocks.createBook).toHaveBeenCalledOnce();
    expect(mocks.updateBook).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data: { md5: "new-md5" },
    });
  });

  it("keeps different books separate when neither has a content checksum", async () => {
    await ingestUpload(
      "user-1",
      "metadata.first.lua",
      bytes(metadataLua("First Book", "First quotation", null))
    );
    await ingestUpload(
      "user-1",
      "metadata.second.lua",
      bytes(metadataLua("Second Book", "Second quotation", null))
    );

    expect(mocks.createBook).toHaveBeenCalledTimes(2);
    expect(mocks.createHighlights.mock.calls[0][0].data[0].bookId).not.toBe(
      mocks.createHighlights.mock.calls[1][0].data[0].bookId
    );
  });

  it("does not overwrite an established checksum on a title fallback match", async () => {
    await ingestUpload(
      "user-1",
      "metadata.first.lua",
      bytes(metadataLua("Stable Title", "First quotation", "original-md5"))
    );
    await ingestUpload(
      "user-1",
      "metadata.second.lua",
      bytes(metadataLua("Stable Title", "Second quotation", "different-md5"))
    );

    expect(mocks.createBook).toHaveBeenCalledOnce();
    expect(mocks.updateBook).not.toHaveBeenCalled();
    expect(mocks.createHighlights.mock.calls[1][0].data[0].bookId).toBe("book-1");
  });

  it("replaces persisted reading statistics from a complete SQLite export", async () => {
    const fileBuffer = Uint8Array.from(statisticsFixture).buffer;

    const result = await ingestUpload("user-1", "statistics.sqlite3", fileBuffer);

    expect(result).toEqual({
      status: "success",
      kind: "stats",
      booksUpdated: 3,
      fileName: "statistics.sqlite3",
    });
    expect(mocks.upsertBookStats).toHaveBeenCalledTimes(3);
    expect(mocks.deletePageStats).toHaveBeenCalledTimes(3);
    expect(
      mocks.deletePageStats.mock.calls.map(([request]) => request.where.bookStatsId)
    ).toEqual(["stats-book-1", "stats-book-2", "stats-book-3"]);

    const persistedPages = mocks.createPageStats.mock.calls.flatMap(
      ([request]) => request.data
    );
    expect(persistedPages).toHaveLength(45);
    expect(
      persistedPages.every(
        (page) =>
          typeof page.bookStatsId === "string" &&
          typeof page.page === "number" &&
          page.startTime instanceof Date
      )
    ).toBe(true);

    const mountain = mocks.upsertBookStats.mock.calls.find(
      ([request]) => request.create.md5 === "fake-md5-0001"
    )?.[0];
    expect(mountain).toMatchObject({
      update: {
        md5: "fake-md5-0001",
        totalPages: 240,
        totalReadTimeSec: 5400,
        totalReadPages: 180,
      },
      create: {
        md5: "fake-md5-0001",
        totalPages: 240,
        totalReadTimeSec: 5400,
        totalReadPages: 180,
      },
    });
  });

  it("skips a statistics row with no checksum instead of creating an unstable book", async () => {
    const result = await ingestUpload(
      "user-1",
      "statistics.sqlite3",
      await statisticsBytes(null)
    );

    expect(result).toEqual({
      status: "success",
      kind: "stats",
      booksUpdated: 0,
      fileName: "statistics.sqlite3",
    });
    expect(mocks.findBook).not.toHaveBeenCalled();
    expect(mocks.createBook).not.toHaveBeenCalled();
    expect(mocks.upsertBookStats).not.toHaveBeenCalled();
  });

  it("updates book totals without manufacturing page sessions when none exist", async () => {
    const result = await ingestUpload(
      "user-1",
      "statistics.sqlite3",
      await statisticsBytes("stats-md5")
    );

    expect(result).toMatchObject({ status: "success", kind: "stats", booksUpdated: 1 });
    expect(mocks.upsertBookStats).toHaveBeenCalledOnce();
    expect(mocks.deletePageStats).toHaveBeenCalledOnce();
    expect(mocks.createPageStats).not.toHaveBeenCalled();
  });

  it("reimports cumulative statistics without duplicating books", async () => {
    const fileBuffer = Uint8Array.from(statisticsFixture).buffer as ArrayBuffer;

    const first = await ingestUpload("user-1", "statistics.sqlite3", fileBuffer);
    const second = await ingestUpload("user-1", "statistics.sqlite3", fileBuffer);

    expect(first).toMatchObject({ status: "success", booksUpdated: 3 });
    expect(second).toMatchObject({ status: "success", booksUpdated: 3 });
    expect(mocks.createBook).toHaveBeenCalledTimes(3);
    expect(mocks.upsertBookStats).toHaveBeenCalledTimes(6);
    expect(mocks.deletePageStats).toHaveBeenCalledTimes(6);
  });
});
