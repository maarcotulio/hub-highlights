import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { signOut } from "./actions";

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
  });

  it("revokes all sessions, clears cached authenticated UI, and redirects", async () => {
    await expect(signOut()).rejects.toThrow("redirect:/login");

    expect(mocks.signOut).toHaveBeenCalledWith();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("still signs out this browser when server-side revocation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signOut.mockResolvedValue({ error: { code: "provider_unavailable" } });

    await expect(signOut()).rejects.toThrow("redirect:/login");

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
