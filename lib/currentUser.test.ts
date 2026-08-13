import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User as AuthUser } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  createClient: vi.fn(),
  getAuthUser: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
      create: mocks.createUser,
      update: mocks.updateUser,
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
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getAuthUser } });
  });

  it("resolves account identity from the Supabase subject", async () => {
    const existing = { id: "db-user-1", authId: "auth-user-1", email: "reader@example.com" };
    mocks.findUser.mockResolvedValue(existing);

    await expect(resolveDbUser(authUser("auth-user-1", "reader@example.com"))).resolves.toEqual(
      existing
    );
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("updates a mutable email without changing account ownership", async () => {
    const existing = { id: "db-user-1", authId: "auth-user-1", email: "old@example.com" };
    const updated = { ...existing, email: "new@example.com" };
    mocks.findUser.mockResolvedValue(existing);
    mocks.updateUser.mockResolvedValue(updated);

    await expect(resolveDbUser(authUser("auth-user-1", "new@example.com"))).resolves.toEqual(
      updated
    );
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: "db-user-1" },
      data: { email: "new@example.com" },
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
    mocks.findUser.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.email === legacyOwner.email) return legacyOwner;
      return null;
    });
    mocks.createUser.mockResolvedValue(freshAccount);

    const resolved = await resolveDbUser(authUser("new-auth-subject", "recycled@example.com"));

    expect(resolved).toEqual(freshAccount);
    expect(resolved).not.toBe(legacyOwner);
    expect(mocks.createUser).toHaveBeenCalledWith({
      data: { authId: "new-auth-subject", email: "recycled@example.com" },
    });
  });

  it("creates a separate account when the auth subject is unknown", async () => {
    const created = { id: "db-user-2", authId: "auth-user-2", email: "new@example.com" };
    mocks.findUser.mockResolvedValue(null);
    mocks.createUser.mockResolvedValue(created);

    await expect(resolveDbUser(authUser("auth-user-2", "new@example.com"))).resolves.toEqual(
      created
    );
  });
});

describe("database user session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getAuthUser } });
  });

  it("returns null when the route has no valid Supabase user", async () => {
    mocks.getAuthUser.mockResolvedValue({
      data: { user: null },
      error: { code: "session_expired" },
    });

    await expect(getSessionDbUser()).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
  });

  it("maps a valid route session through the Supabase subject", async () => {
    const auth = authUser("auth-route-user", "route@example.com");
    const db = { id: "db-route-user", authId: auth.id, email: auth.email };
    mocks.getAuthUser.mockResolvedValue({ data: { user: auth }, error: null });
    mocks.findUser.mockResolvedValue(db);

    await expect(getSessionDbUser()).resolves.toEqual(db);
  });

  it("maps the required page session through the same identity boundary", async () => {
    const auth = authUser("auth-page-user", "page@example.com");
    const db = { id: "db-page-user", authId: auth.id, email: auth.email };
    mocks.requireUser.mockResolvedValue(auth);
    mocks.findUser.mockResolvedValue(db);

    await expect(requireDbUser()).resolves.toEqual(db);
  });
});
