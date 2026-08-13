import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  findBook: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/db", () => ({
  prisma: { book: { findFirst: mocks.findBook } },
}));

import { GET } from "./route";

const foreignBook = {
  id: "foreign-book",
  userId: "user-2",
  title: "Someone Else's Book",
  author: null,
  source: "KOREADER" as const,
  status: "READING" as const,
  highlights: [],
};
const ownedBook = {
  ...foreignBook,
  id: "owned-book",
  userId: "user-1",
  title: "Owned/Book",
};

async function getBook(bookId: string) {
  return GET({} as NextRequest, { params: Promise.resolve({ bookId }) });
}

describe("GET /api/export/[bookId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.findBook.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      const book =
        where.id === foreignBook.id ? foreignBook : where.id === ownedBook.id ? ownedBook : null;
      return book && where.userId === book.userId ? book : null;
    });
  });

  it("requires an authenticated session", async () => {
    mocks.getSessionDbUser.mockResolvedValue(null);

    const response = await getBook(foreignBook.id);

    expect(response.status).toBe(401);
    expect(mocks.findBook).not.toHaveBeenCalled();
  });

  it("does not export a book owned by another user", async () => {
    const response = await getBook(foreignBook.id);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("makes a foreign book indistinguishable from a missing book", async () => {
    const foreign = await getBook(foreignBook.id);
    const missing = await getBook("missing-book");

    expect({ status: foreign.status, body: await foreign.json() }).toEqual({
      status: missing.status,
      body: await missing.json(),
    });
  });

  it("exports an owned book as Markdown with a safe attachment filename", async () => {
    const response = await getBook(ownedBook.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="OwnedBook.md"'
    );
    await expect(response.text()).resolves.toContain("# Owned/Book");
  });

  it("exports highlights in chronological order", async () => {
    const later = {
      id: "later",
      text: "Later quotation",
      note: null,
      location: null,
      chapter: null,
      tags: [],
      highlightedAt: new Date("2026-02-01T00:00:00Z"),
    };
    const earlier = {
      ...later,
      id: "earlier",
      text: "Earlier quotation",
      highlightedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const storedBook = { ...ownedBook, highlights: [later, earlier] };
    mocks.findBook.mockImplementation(
      async ({ where, include }: { where: Record<string, string>; include?: {
        highlights?: { orderBy?: { highlightedAt?: string } };
      } }) => {
        if (where.id !== storedBook.id || where.userId !== storedBook.userId) return null;
        const highlights =
          include?.highlights?.orderBy?.highlightedAt === "asc"
            ? [...storedBook.highlights].sort(
                (first, second) =>
                  first.highlightedAt.getTime() - second.highlightedAt.getTime()
              )
            : storedBook.highlights;
        return { ...storedBook, highlights };
      }
    );

    const response = await getBook(ownedBook.id);
    const markdown = await response.text();

    expect(markdown.indexOf("Earlier quotation")).toBeLessThan(
      markdown.indexOf("Later quotation")
    );
  });
});
