import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User as AuthUser } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  upsertUser: vi.fn(),
  findUser: vi.fn(),
  createClient: vi.fn(),
  getAuthUser: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      upsert: mocks.upsertUser,
      findUnique: mocks.findUser,
    },
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: mocks.requireUser }));

import { getSessionDbUser, requireDbUser, resolveDbUser } from "./currentUser";

function authUser(id: string, email: string): AuthUser {
  return { id, email } as AuthUser;
}

describe("resolveDbUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getAuthUser } });
  });

  it("resolves account identity from the Supabase subject", async () => {
    const existing = { id: "db-user-1", authId: "auth-user-1", email: "reader@example.com" };
    mocks.upsertUser.mockResolvedValue(existing);

    await expect(resolveDbUser(authUser("auth-user-1", "reader@example.com"))).resolves.toEqual(
      existing
    );
    expect(mocks.upsertUser).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      update: { email: "reader@example.com" },
      create: { authId: "auth-user-1", email: "reader@example.com" },
    });
  });

  it("updates a mutable email without changing account ownership", async () => {
    const existing = { id: "db-user-1", authId: "auth-user-1", email: "old@example.com" };
    const updated = { ...existing, email: "new@example.com" };
    mocks.upsertUser.mockResolvedValue(updated);

    await expect(resolveDbUser(authUser("auth-user-1", "new@example.com"))).resolves.toEqual(
      updated
    );
    expect(mocks.upsertUser).toHaveBeenCalledWith({
      where: { authId: existing.authId },
      update: { email: "new@example.com" },
      create: { authId: existing.authId, email: "new@example.com" },
    });
  });

  it("does not inherit a legacy account that happens to have the same email", async () => {
    const legacyOwner = {
      id: "legacy-owner",
      authId: null,
      email: "recycled@example.com",
      books: ["private-library"],
    };
    const freshAccount = {
      id: "fresh-account",
      authId: "new-auth-subject",
      email: "recycled@example.com",
      books: [],
    };
    mocks.upsertUser.mockResolvedValue(freshAccount);

    const resolved = await resolveDbUser(authUser("new-auth-subject", "recycled@example.com"));

    expect(resolved).toEqual(freshAccount);
    expect(resolved).not.toBe(legacyOwner);
    expect(mocks.upsertUser).toHaveBeenCalledWith({
      where: { authId: "new-auth-subject" },
      update: { email: "recycled@example.com" },
      create: { authId: "new-auth-subject", email: "recycled@example.com" },
    });
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("creates a separate account when the auth subject is unknown", async () => {
    const created = { id: "db-user-2", authId: "auth-user-2", email: "new@example.com" };
    mocks.upsertUser.mockResolvedValue(created);

    await expect(resolveDbUser(authUser("auth-user-2", "new@example.com"))).resolves.toEqual(
      created
    );
  });

  it("maps the auth subject atomically so concurrent requests cannot create two owners", async () => {
    const resolved = { id: "db-user-3", authId: "auth-user-3", email: "reader@example.com" };
    mocks.upsertUser.mockResolvedValue(resolved);

    await expect(resolveDbUser(authUser("auth-user-3", "reader@example.com"))).resolves.toEqual(
      resolved
    );
    expect(mocks.upsertUser).toHaveBeenCalledWith({
      where: { authId: "auth-user-3" },
      update: { email: "reader@example.com" },
      create: { authId: "auth-user-3", email: "reader@example.com" },
    });
  });
});

describe("database user session helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getAuthUser } });
  });

  it("returns null when the route has no valid Supabase user", async () => {
    mocks.getAuthUser.mockResolvedValue({
      data: { user: null },
      error: { code: "session_expired" },
    });

    await expect(getSessionDbUser()).resolves.toBeNull();
    expect(mocks.upsertUser).not.toHaveBeenCalled();
  });

  it("maps a valid route session through the Supabase subject", async () => {
    const auth = authUser("auth-route-user", "route@example.com");
    const db = { id: "db-route-user", authId: auth.id, email: auth.email };
    mocks.getAuthUser.mockResolvedValue({ data: { user: auth }, error: null });
    mocks.upsertUser.mockResolvedValue(db);

    await expect(getSessionDbUser()).resolves.toEqual(db);
  });

  it("maps the required page session through the same identity boundary", async () => {
    const auth = authUser("auth-page-user", "page@example.com");
    const db = { id: "db-page-user", authId: auth.id, email: auth.email };
    mocks.requireUser.mockResolvedValue(auth);
    mocks.upsertUser.mockResolvedValue(db);

    await expect(requireDbUser()).resolves.toEqual(db);
  });
});
