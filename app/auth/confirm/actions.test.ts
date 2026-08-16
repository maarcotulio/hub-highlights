import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  createClient: vi.fn(),
  resolveDbUser: vi.fn(),
  grantRecoveryAccess: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/recoveryGrant", () => ({
  grantRecoveryAccess: mocks.grantRecoveryAccess,
}));
vi.mock("@/lib/currentUser", () => ({ resolveDbUser: mocks.resolveDbUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { confirmRecovery } from "./actions";

describe("confirmRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: "auth-user-1", email: "reader@example.com" } },
      error: null,
    });
    mocks.resolveDbUser.mockResolvedValue({ id: "db-user-1" });
    mocks.grantRecoveryAccess.mockResolvedValue(undefined);
  });

  it("redeems only a recovery OTP and pins the destination", async () => {
    await expect(confirmRecovery("trusted-token-hash")).rejects.toThrow(
      "redirect:/reset-password"
    );

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "trusted-token-hash",
    });
    expect(mocks.grantRecoveryAccess).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenLastCalledWith("/reset-password");
  });

  it("does not grant reset access when OTP redemption fails", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "expired" } });

    await expect(confirmRecovery("expired-token")).rejects.toThrow(
      "redirect:/login?error=link_expired"
    );

    expect(mocks.grantRecoveryAccess).not.toHaveBeenCalled();
  });

  it("does not grant reset access when account provisioning fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.resolveDbUser.mockRejectedValue(new Error("database unavailable"));

    await expect(confirmRecovery("trusted-token-hash")).rejects.toThrow(
      "redirect:/login?error=account_setup_failed"
    );

    expect(mocks.grantRecoveryAccess).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
