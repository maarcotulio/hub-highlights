import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  findBooks: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/db", () => ({
  prisma: { book: { findMany: mocks.findBooks } },
}));

import { GET } from "./route";

const book = (title: string, archivedAt: Date | null) => ({
  id: title,
  userId: "user-1",
  title,
  author: null,
  source: "KOREADER" as const,
  status: "READING" as const,
  archivedAt,
  highlights: [],
});

describe("GET /api/export/all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.findBooks.mockResolvedValue([
      book("Shared/Title", null),
      book("SharedTitle", new Date("2026-01-01T00:00:00Z")),
    ]);
  });

  it("requires an authenticated session", async () => {
    mocks.getSessionDbUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.findBooks).not.toHaveBeenCalled();
  });

  it("exports active and archived books with collision-safe deterministic filenames", async () => {
    const response = await GET();
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    const filenames = Object.keys(archive.files).sort();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(filenames).toEqual(["SharedTitle-2.md", "SharedTitle.md"]);
    await expect(archive.file("SharedTitle.md")!.async("string")).resolves.toContain(
      '# Shared/Title'
    );
    await expect(archive.file("SharedTitle-2.md")!.async("string")).resolves.toContain(
      "# SharedTitle"
    );
  });

  it("excludes books owned by another user from the bulk archive", async () => {
    const storedBooks = [
      book("Owned Book", null),
      { ...book("Private Foreign Book", null), userId: "user-2" },
    ];
    mocks.findBooks.mockImplementation(async ({ where }) =>
      where?.userId
        ? storedBooks.filter((candidate) => candidate.userId === where.userId)
        : storedBooks
    );

    const response = await GET();
    const archive = await JSZip.loadAsync(await response.arrayBuffer());

    expect(Object.keys(archive.files)).toEqual(["Owned Book.md"]);
    await expect(archive.file("Owned Book.md")!.async("string")).resolves.toContain(
      "# Owned Book"
    );
    expect(archive.file("Private Foreign Book.md")).toBeNull();
  });

  it("keeps book and highlight ordering deterministic", async () => {
    const later = {
      text: "Later quotation",
      note: null,
      location: null,
      chapter: null,
      tags: [],
      highlightedAt: new Date("2026-02-01T00:00:00Z"),
    };
    const earlier = {
      ...later,
      text: "Earlier quotation",
      highlightedAt: new Date("2026-01-01T00:00:00Z"),
    };
    const storedBooks = [
      {
        ...book("Older Book", null),
        createdAt: new Date("2025-01-01T00:00:00Z"),
        highlights: [later, earlier],
      },
      {
        ...book("Newer Book", null),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        highlights: [],
      },
    ];
    mocks.findBooks.mockImplementation(
      async ({ where, include, orderBy }) => {
        let result = where?.userId
          ? storedBooks.filter((candidate) => candidate.userId === where.userId)
          : storedBooks;
        result = result.map((storedBook) => ({
          ...storedBook,
          highlights:
            include?.highlights?.orderBy?.highlightedAt === "asc"
              ? [...storedBook.highlights].sort(
                  (first, second) =>
                    first.highlightedAt.getTime() - second.highlightedAt.getTime()
                )
              : storedBook.highlights,
        }));
        if (orderBy?.createdAt === "desc") {
          result.sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
        }
        return result;
      }
    );

    const response = await GET();
    const archive = await JSZip.loadAsync(await response.arrayBuffer());
    const olderMarkdown = await archive.file("Older Book.md")!.async("string");

    expect(Object.keys(archive.files)).toEqual(["Newer Book.md", "Older Book.md"]);
    expect(olderMarkdown.indexOf("Earlier quotation")).toBeLessThan(
      olderMarkdown.indexOf("Later quotation")
    );
  });
});
