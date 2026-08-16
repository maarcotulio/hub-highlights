import JSZip from "jszip";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getSessionDbUser: vi.fn() }));
vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: session.getSessionDbUser }));

import { PATCH as patchBookRoute } from "@/app/api/books/[bookId]/route";
import { GET as exportBookRoute } from "@/app/api/export/[bookId]/route";
import { GET as exportAllRoute } from "@/app/api/export/all/route";
import { PATCH as patchHighlightRoute } from "@/app/api/highlights/[highlightId]/route";
import { prisma } from "@/lib/db";

async function cleanDatabase() {
  await prisma.pageStat.deleteMany();
  await prisma.bookStats.deleteMany();
  await prisma.highlight.deleteMany();
  await prisma.book.deleteMany();
  await prisma.user.deleteMany();
}

function patchBook(bookId: string) {
  const request = new NextRequest(`https://hub.example/api/books/${bookId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "FINISHED" }),
    headers: { "content-type": "application/json" },
  });
  return patchBookRoute(request, { params: Promise.resolve({ bookId }) });
}

function patchHighlight(highlightId: string) {
  const request = new NextRequest(`https://hub.example/api/highlights/${highlightId}`, {
    method: "PATCH",
    body: JSON.stringify({ tags: ["stolen"] }),
    headers: { "content-type": "application/json" },
  });
  return patchHighlightRoute(request, { params: Promise.resolve({ highlightId }) });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("route ownership against persisted relations", () => {
  it("cannot mutate or individually export another user's persisted records", async () => {
    const owner = await prisma.user.create({
      data: { authId: "route-owner", email: "owner@example.test" },
    });
    const otherUser = await prisma.user.create({
      data: { authId: "route-other", email: "other@example.test" },
    });
    const foreignBook = await prisma.book.create({
      data: {
        userId: otherUser.id,
        title: "Private Foreign Book",
        source: "KOREADER",
      },
    });
    const foreignHighlight = await prisma.highlight.create({
      data: {
        bookId: foreignBook.id,
        text: "Private quotation",
        dedupeHash: "foreign-highlight-hash",
      },
    });
    session.getSessionDbUser.mockResolvedValue(owner);

    const bookMutation = await patchBook(foreignBook.id);
    const highlightMutation = await patchHighlight(foreignHighlight.id);
    const individualExport = await exportBookRoute({} as NextRequest, {
      params: Promise.resolve({ bookId: foreignBook.id }),
    });

    expect(bookMutation.status).toBe(404);
    expect(highlightMutation.status).toBe(404);
    expect(individualExport.status).toBe(404);
    await expect(
      prisma.book.findUniqueOrThrow({ where: { id: foreignBook.id } })
    ).resolves.toMatchObject({ status: "NOT_STARTED" });
    await expect(
      prisma.highlight.findUniqueOrThrow({ where: { id: foreignHighlight.id } })
    ).resolves.toMatchObject({ tags: [] });
  });

  it("bulk export contains only books related to the authenticated user", async () => {
    const owner = await prisma.user.create({
      data: { authId: "bulk-owner", email: "bulk-owner@example.test" },
    });
    const otherUser = await prisma.user.create({
      data: { authId: "bulk-other", email: "bulk-other@example.test" },
    });
    await prisma.book.createMany({
      data: [
        { userId: owner.id, title: "Owned Book", source: "KOREADER" },
        { userId: otherUser.id, title: "Foreign Book", source: "KOREADER" },
      ],
    });
    session.getSessionDbUser.mockResolvedValue(owner);

    const response = await exportAllRoute();
    const archive = await JSZip.loadAsync(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(Object.keys(archive.files)).toEqual(["Owned Book.md"]);
    expect(archive.file("Foreign Book.md")).toBeNull();
  });
});
