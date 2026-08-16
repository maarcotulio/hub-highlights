import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  hasRecoveryAccess: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/auth/recoveryGrant", () => ({ hasRecoveryAccess: mocks.hasRecoveryAccess }));

import ResetPasswordPage from "./page";

describe("reset password page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ email: "reader@example.com" });
    mocks.hasRecoveryAccess.mockResolvedValue(true);
  });

  it("redirects an ordinary signed-in session without a recovery grant", async () => {
    mocks.hasRecoveryAccess.mockResolvedValue(false);

    await expect(ResetPasswordPage()).rejects.toThrow("redirect:/forgot-password");
  });

  it("renders only when both the authenticated session and recovery grant exist", async () => {
    await expect(ResetPasswordPage()).resolves.toBeDefined();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.hasRecoveryAccess).toHaveBeenCalledOnce();
  });
});
