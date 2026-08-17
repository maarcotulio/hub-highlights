import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { update: mocks.updateUser } },
}));

import { PATCH } from "./route";

function patchRequest(body: BodyInit, contentType = "application/json") {
  return new Request("http://localhost/api/settings/streak", {
    method: "PATCH",
    headers: { "content-type": contentType },
    body,
  });
}

describe("PATCH /api/settings/streak", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.updateUser.mockImplementation(async ({ data }: { data: { maxConsecutiveDaysOff: number } }) => ({
      ...data,
    }));
  });

  it("requires an authenticated session", async () => {
    mocks.getSessionDbUser.mockResolvedValue(null);

    const response = await PATCH(patchRequest(JSON.stringify({ maxConsecutiveDaysOff: 2 })));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([0, 30])("stores an allowed days-off boundary of %i", async (maxConsecutiveDaysOff) => {
    const response = await PATCH(patchRequest(JSON.stringify({ maxConsecutiveDaysOff })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ maxConsecutiveDaysOff });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { maxConsecutiveDaysOff },
      select: { maxConsecutiveDaysOff: true },
    });
  });

  it.each([
    ["malformed JSON", "{"],
    ["a null JSON value", "null"],
    ["an array", "[]"],
    ["a string", JSON.stringify("2")],
    ["a missing value", JSON.stringify({})],
    ["a decimal", JSON.stringify({ maxConsecutiveDaysOff: 1.5 })],
    ["a negative value", JSON.stringify({ maxConsecutiveDaysOff: -1 })],
    ["a value above the limit", JSON.stringify({ maxConsecutiveDaysOff: 31 })],
  ])("rejects %s without persisting it", async (_description, body) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "maxConsecutiveDaysOff must be an integer between 0 and 30.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
