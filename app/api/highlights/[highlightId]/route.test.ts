import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  findHighlight: vi.fn(),
  updateHighlight: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    highlight: {
      findFirst: mocks.findHighlight,
      update: mocks.updateHighlight,
    },
  },
}));

import { PATCH } from "./route";

const foreignHighlight = {
  id: "foreign-highlight",
  book: { userId: "user-2" },
  tags: [],
};
const ownedHighlight = {
  id: "owned-highlight",
  book: { userId: "user-1" },
  tags: [],
};

function patchHighlight(highlightId: string, body: unknown) {
  const request = new NextRequest(`https://hub.example/api/highlights/${highlightId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return PATCH(request, { params: Promise.resolve({ highlightId }) });
}

describe("PATCH /api/highlights/[highlightId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.findHighlight.mockImplementation(
      async ({ where }: { where: { id: string; book?: { userId?: string } } }) => {
        const highlight =
          where.id === foreignHighlight.id
            ? foreignHighlight
            : where.id === ownedHighlight.id
              ? ownedHighlight
              : null;
        return highlight && where.book?.userId === highlight.book.userId ? highlight : null;
      }
    );
    mocks.updateHighlight.mockImplementation(async ({ data }) => ({ ...ownedHighlight, ...data }));
  });

  it("rejects a null JSON body without reaching persistence", async () => {
    const response = await patchHighlight(ownedHighlight.id, null);

    expect(response.status).toBe(400);
    expect(mocks.findHighlight).not.toHaveBeenCalled();
    expect(mocks.updateHighlight).not.toHaveBeenCalled();
  });

  it("does not modify a highlight owned by another user", async () => {
    const response = await patchHighlight(foreignHighlight.id, { tags: ["stolen"] });

    expect(response.status).toBe(404);
    expect(mocks.updateHighlight).not.toHaveBeenCalled();
  });

  it("makes a foreign highlight indistinguishable from a missing highlight", async () => {
    const foreign = await patchHighlight(foreignHighlight.id, { tags: [] });
    const missing = await patchHighlight("missing-highlight", { tags: [] });

    expect({ status: foreign.status, body: await foreign.json() }).toEqual({
      status: missing.status,
      body: await missing.json(),
    });
  });

  it("normalizes, removes empty values, and deduplicates owned highlight tags", async () => {
    const response = await patchHighlight(ownedHighlight.id, {
      tags: ["  important  ", "", "important", "review"],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tags: ["important", "review"] });
  });

  it("rejects malformed tag collections before persistence", async () => {
    const response = await patchHighlight(ownedHighlight.id, { tags: ["valid", 42] });

    expect(response.status).toBe(400);
    expect(mocks.findHighlight).not.toHaveBeenCalled();
    expect(mocks.updateHighlight).not.toHaveBeenCalled();
  });
});
