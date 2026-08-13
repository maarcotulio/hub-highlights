import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  findBook: vi.fn(),
  updateBook: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/db", () => ({
  prisma: { book: { findFirst: mocks.findBook, update: mocks.updateBook } },
}));

import { PATCH } from "./route";

const ownedBook = { id: "owned-book", userId: "user-1", status: "NOT_STARTED" };
const foreignBook = { id: "foreign-book", userId: "user-2", status: "READING" };

function patchBook(bookId: string, body: unknown) {
  const request = new NextRequest(`https://hub.example/api/books/${bookId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return PATCH(request, { params: Promise.resolve({ bookId }) });
}

function patchBookRaw(bookId: string, body: string) {
  const request = new NextRequest(`https://hub.example/api/books/${bookId}`, {
    method: "PATCH",
    body,
    headers: { "content-type": "application/json" },
  });
  return PATCH(request, { params: Promise.resolve({ bookId }) });
}

async function expectError(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body).toEqual({ error: expect.any(String) });
  expect(body.error.trim()).not.toBe("");
}

describe("PATCH /api/books/[bookId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.findBook.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      const book = where.id === ownedBook.id ? ownedBook : where.id === foreignBook.id ? foreignBook : null;
      return book && where.userId === book.userId ? book : null;
    });
    mocks.updateBook.mockImplementation(async ({ data }) =>
      "status" in data ? { status: data.status } : { archivedAt: data.archivedAt }
    );
  });

  it("rejects an unauthenticated request before persistence", async () => {
    mocks.getSessionDbUser.mockResolvedValue(null);

    const response = await patchBook(ownedBook.id, { status: "READING" });

    await expectError(response, 401);
    expect(mocks.findBook).not.toHaveBeenCalled();
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it.each([null, [], "status", 42])("rejects non-object JSON bodies: %j", async (body) => {
    const response = await patchBook(ownedBook.id, body);

    await expectError(response, 400);
    expect(mocks.findBook).not.toHaveBeenCalled();
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without reaching persistence", async () => {
    const response = await patchBookRaw(ownedBook.id, "{");

    await expectError(response, 400);
    expect(mocks.findBook).not.toHaveBeenCalled();
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it("requires exactly one supported mutation", async () => {
    const neither = await patchBook(ownedBook.id, {});
    const both = await patchBook(ownedBook.id, { status: "READING", archived: true });

    await expectError(neither, 400);
    await expectError(both, 400);
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it.each(["DELETED", null, false, 42, [], {}])("rejects invalid status values: %j", async (status) => {
    const response = await patchBook(ownedBook.id, { status });

    await expectError(response, 400);
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it("updates the status of a book owned by the authenticated user", async () => {
    const response = await patchBook(ownedBook.id, { status: "FINISHED" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "FINISHED" });
  });

  it("archives and restores a book through boolean input", async () => {
    const archived = await patchBook(ownedBook.id, { archived: true });
    const restored = await patchBook(ownedBook.id, { archived: false });

    expect(archived.status).toBe(200);
    expect((await archived.json()).archived).toBe(true);
    expect((await restored.json()).archived).toBe(false);
  });

  it("rejects non-boolean archive values", async () => {
    const response = await patchBook(ownedBook.id, { archived: "true" });

    await expectError(response, 400);
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });

  it("does not reveal whether an unavailable book belongs to another user", async () => {
    const foreign = await patchBook(foreignBook.id, { status: "FINISHED" });
    const missing = await patchBook("missing-book", { status: "FINISHED" });

    expect({ status: foreign.status, body: await foreign.json() }).toEqual({
      status: missing.status,
      body: await missing.json(),
    });
    expect(mocks.updateBook).not.toHaveBeenCalled();
  });
});
