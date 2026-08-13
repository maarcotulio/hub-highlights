import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { requireUser } from "./auth";

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("returns the user from a provider-validated session", async () => {
    const user = { id: "auth-user-1", email: "reader@example.com" };
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(requireUser()).resolves.toEqual(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects when the provider reports a session error despite stale user data", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "stale-user" } },
      error: { code: "session_expired" },
    });

    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });

  it("redirects when no authenticated user exists", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(requireUser()).rejects.toThrow("redirect:/login");
  });
});
