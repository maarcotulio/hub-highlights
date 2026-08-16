import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
      update: mocks.updateUser,
    },
  },
}));

import { POST } from "./route";

function heartbeat(token?: string) {
  return POST(
    new NextRequest("https://hub.example/api/webhook/heartbeat", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    })
  );
}

describe("POST /api/webhook/heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.updateUser.mockResolvedValue({ id: "user-1" });
  });

  it("rejects an unauthenticated heartbeat before persistence", async () => {
    const response = await heartbeat();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("records the authenticated user's check-in and acknowledges it", async () => {
    const before = Date.now();
    const response = await heartbeat("device-token");
    const after = Date.now();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledOnce();

    const update = mocks.updateUser.mock.calls[0][0];
    expect(update.where).toEqual({ id: "user-1" });
    expect(update.data.lastSyncAt).toBeInstanceOf(Date);
    expect(update.data.lastSyncAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(update.data.lastSyncAt.getTime()).toBeLessThanOrEqual(after);
  });
});
