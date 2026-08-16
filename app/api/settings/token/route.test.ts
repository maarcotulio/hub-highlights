import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashApiToken } from "@/lib/apiToken";

const mocks = vi.hoisted(() => ({
  getSessionDbUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/currentUser", () => ({ getSessionDbUser: mocks.getSessionDbUser }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { update: mocks.updateUser } },
}));

import { POST } from "./route";

describe("POST /api/settings/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionDbUser.mockResolvedValue({ id: "user-1" });
    mocks.updateUser.mockResolvedValue({ id: "user-1" });
  });

  it("requires an authenticated session", async () => {
    mocks.getSessionDbUser.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("returns plaintext once while persisting only its hash", async () => {
    const response = await POST();
    const body = (await response.json()) as { apiToken: string };
    const persisted = mocks.updateUser.mock.calls[0][0].data;

    expect(response.status).toBe(200);
    expect(body.apiToken).toMatch(/^[a-f0-9]{48}$/);
    expect(persisted).toEqual({ apiTokenHash: hashApiToken(body.apiToken) });
    expect(persisted.apiTokenHash).not.toBe(body.apiToken);
    expect(JSON.stringify(persisted)).not.toContain(body.apiToken);
  });
});
