import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasRecoveryAccess: vi.fn(),
  clearRecoveryAccess: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
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
vi.mock("@/lib/auth/recoveryGrant", () => ({
  hasRecoveryAccess: mocks.hasRecoveryAccess,
  clearRecoveryAccess: mocks.clearRecoveryAccess,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { updatePassword } from "./actions";

function passwordForm(password = "new-password", confirmation = password): FormData {
  const form = new FormData();
  form.set("password", password);
  form.set("confirmPassword", confirmation);
  return form;
}

describe("updatePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRecoveryAccess.mockResolvedValue(true);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } }, error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.clearRecoveryAccess.mockResolvedValue(undefined);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: mocks.getUser,
        updateUser: mocks.updateUser,
        signOut: mocks.signOut,
      },
    });
  });

  it("enforces password confirmation at the public server-action boundary", async () => {
    const result = await updatePassword({}, passwordForm("new-password", "different-password"));

    expect(result).toEqual({ error: "Those passwords don't match." });
    expect(mocks.hasRecoveryAccess).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed action submission with missing password fields", async () => {
    const result = await updatePassword({}, new FormData());

    expect(result).toEqual({ error: "Use at least 8 characters for your password." });
    expect(mocks.hasRecoveryAccess).not.toHaveBeenCalled();
  });

  it("rejects a direct action call without a recovery grant", async () => {
    mocks.hasRecoveryAccess.mockResolvedValue(false);

    const result = await updatePassword({}, passwordForm());

    expect(result).toEqual({
      error: "Your reset link expired. Request a new one from the sign-in page.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an expired recovery session even when the marker remains", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: "session_expired" } });

    const result = await updatePassword({}, passwordForm());

    expect(result).toEqual({
      error: "Your reset link expired. Request a new one from the sign-in page.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a provider session error even if a stale user object is returned", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "stale-auth-user" } },
      error: { code: "session_expired" },
    });

    const result = await updatePassword({}, passwordForm());

    expect(result).toEqual({
      error: "Your reset link expired. Request a new one from the sign-in page.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password, revokes other sessions, and consumes the grant", async () => {
    await expect(updatePassword({}, passwordForm())).rejects.toThrow("redirect:/dashboard");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(mocks.clearRecoveryAccess).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenLastCalledWith("/dashboard");
  });

  it("finishes the successful reset when revoking other sessions fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signOut.mockResolvedValue({
      error: { code: "provider_unavailable", message: "revocation failed" },
    });

    await expect(updatePassword({}, passwordForm())).rejects.toThrow("redirect:/dashboard");

    expect(mocks.clearRecoveryAccess).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("does not consume the grant when the password update fails", async () => {
    mocks.updateUser.mockResolvedValue({ error: { code: "same_password" } });

    const result = await updatePassword({}, passwordForm());

    expect(result).toEqual({
      error: "That's already your password. Choose a different one.",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.clearRecoveryAccess).not.toHaveBeenCalled();
  });

  it.each([
    ["weak_password", "That password is too easy to guess. Try a longer one."],
    ["reauthentication_needed", "For safety, sign in again before changing your password."],
    ["provider_unavailable", "We couldn't update your password. Please try again."],
  ])("maps the %s provider failure without consuming the recovery grant", async (code, message) => {
    mocks.updateUser.mockResolvedValue({ error: { code } });

    const result = await updatePassword({}, passwordForm());

    expect(result).toEqual({ error: message });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.clearRecoveryAccess).not.toHaveBeenCalled();
  });
});
