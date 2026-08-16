import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { hashApiToken } from "./apiToken";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: mocks.findUser } },
}));

import { authorizeWebhook, requireApiUser } from "./webhook-auth";

function request(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return { headers } as NextRequest;
}

function rawAuthorizationRequest(authorization: string): NextRequest {
  return {
    headers: { get: () => authorization },
  } as unknown as NextRequest;
}

describe("requireApiUser", () => {
  const token = "0123456789abcdef0123456789abcdef0123456789abcdef";
  const user = { id: "user-1", apiTokenHash: hashApiToken(token) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockImplementation(async ({ where }: { where: { apiTokenHash: string } }) =>
      where.apiTokenHash === user.apiTokenHash ? user : null
    );
  });

  it("authenticates the correct bearer token by its hash", async () => {
    await expect(requireApiUser(request(`Bearer ${token}`))).resolves.toEqual(user);
  });

  it("normalizes surrounding bearer-token whitespace before hashing", async () => {
    await expect(requireApiUser(request(`Bearer   ${token}   `))).resolves.toEqual(user);
  });

  it("rejects an incorrect bearer token", async () => {
    await expect(requireApiUser(request(`Bearer ${"f".repeat(48)}`))).resolves.toBeNull();
  });

  it.each([undefined, "", "Basic credentials", "Bearer", "Bearer   "])(
    "rejects a missing or malformed authorization header: %s",
    async (authorization) => {
      await expect(requireApiUser(request(authorization))).resolves.toBeNull();
    }
  );

  it.each(["Basic credentials", "Bearer", "Bearer   "])(
    "rejects malformed credentials even if a database digest happens to match: %s",
    async (authorization) => {
      mocks.findUser.mockResolvedValue(user);

      await expect(requireApiUser(request(authorization))).resolves.toBeNull();
    }
  );

  it("rejects an all-whitespace bearer value before querying persistence", async () => {
    mocks.findUser.mockResolvedValue(user);

    await expect(requireApiUser(rawAuthorizationRequest("Bearer   "))).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("never queries the database with the plaintext token", async () => {
    await requireApiUser(request(`Bearer ${token}`));

    const queriedValue = mocks.findUser.mock.calls[0][0].where.apiTokenHash;
    expect(queriedValue).toBe(hashApiToken(token));
    expect(queriedValue).not.toBe(token);
  });
});

describe("authorizeWebhook", () => {
  const token = "abcdef0123456789abcdef0123456789abcdef0123456789";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockImplementation(async ({ where }: { where: { apiTokenHash: string } }) =>
      where.apiTokenHash === hashApiToken(token)
        ? { id: "rate-limited-user", apiTokenHash: where.apiTokenHash }
        : null
    );
  });

  it("returns an unauthorized response for invalid credentials", async () => {
    const result = await authorizeWebhook(request("Bearer incorrect"));

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: "Unauthorized" });
    }
  });

  it("allows exactly the documented per-token request budget", async () => {
    const authenticatedRequest = request(`Bearer ${token}`);
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const result = await authorizeWebhook(authenticatedRequest);
      expect("user" in result).toBe(true);
    }

    const blocked = await authorizeWebhook(authenticatedRequest);
    expect("response" in blocked).toBe(true);
    if ("response" in blocked) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("retry-after")).toBe("3600");
      await expect(blocked.response.json()).resolves.toEqual({ error: "Too many requests" });
    }
  });

  it("does not let one authenticated user spend another user's request budget", async () => {
    const firstToken = "a".repeat(48);
    const secondToken = "b".repeat(48);
    mocks.findUser.mockImplementation(async ({ where }: { where: { apiTokenHash: string } }) => {
      if (where.apiTokenHash === hashApiToken(firstToken)) return { id: "budget-owner-a" };
      if (where.apiTokenHash === hashApiToken(secondToken)) return { id: "budget-owner-b" };
      return null;
    });

    for (let attempt = 0; attempt < 1000; attempt += 1) {
      await authorizeWebhook(request(`Bearer ${firstToken}`));
    }

    const secondUser = await authorizeWebhook(request(`Bearer ${secondToken}`));
    expect(secondUser).toEqual({ user: { id: "budget-owner-b" } });
  });
});
