import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  createClient: vi.fn(),
  checkRateLimit: vi.fn(),
  resolveDbUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/rateLimit", () => ({ checkSignUpRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/currentUser", () => ({ resolveDbUser: mocks.resolveDbUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { signUp } from "./actions";

function signUpForm(next = "/dashboard"): FormData {
  const form = new FormData();
  form.set("email", "reader@example.com");
  form.set("password", "new-password");
  form.set("confirmPassword", "new-password");
  form.set("next", next);
  return form;
}

describe("signUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({ auth: { signUp: mocks.signUp } });
    mocks.resolveDbUser.mockResolvedValue({ id: "db-user-1" });
  });

  it("validates malformed submissions before spending a rate-limit budget", async () => {
    const form = signUpForm();
    form.set("confirmPassword", "different-password");

    const result = await signUp({}, form);

    expect(result).toEqual({ error: "Those passwords don't match." });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stops before the provider when account creation is throttled", async () => {
    mocks.checkRateLimit.mockResolvedValue("Too many attempts.");

    const result = await signUp({}, signUpForm());

    expect(result).toEqual({ error: "Too many attempts." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(["user_already_exists", "email_exists"])(
    "reports an already-registered address from provider code %s",
    async (code) => {
      mocks.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { code },
      });

      await expect(signUp({}, signUpForm())).resolves.toEqual({
        error: "That email already has an account. Sign in instead.",
      });
    }
  );

  it("maps an unexpected provider failure without leaking its details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "provider_unavailable", message: "internal details" },
    });

    await expect(signUp({}, signUpForm())).resolves.toEqual({
      error: "We couldn't create that account. Please try again.",
    });
    consoleError.mockRestore();
  });

  it("reports the provider's decoy user as an already-registered address", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "decoy", identities: [] }, session: null },
      error: null,
    });

    await expect(signUp({}, signUpForm())).resolves.toEqual({
      error: "That email already has an account. Sign in instead.",
    });
  });

  it("does not treat an account without a session as signed in", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "auth-user-1", identities: [{}] }, session: null },
      error: null,
    });

    await expect(signUp({}, signUpForm())).resolves.toEqual({
      error: "Account created. Confirm it from your email, then sign in.",
    });
    expect(mocks.resolveDbUser).not.toHaveBeenCalled();
  });

  it("does not treat a session without an account identity as signed in", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: { access_token: "session" } },
      error: null,
    });

    await expect(signUp({}, signUpForm())).resolves.toEqual({
      error: "Account created. Confirm it from your email, then sign in.",
    });
    expect(mocks.resolveDbUser).not.toHaveBeenCalled();
  });

  it("returns a recoverable error when database identity provisioning fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signUp.mockResolvedValue({
      data: {
        user: { id: "auth-user-1", identities: [{}] },
        session: { access_token: "session" },
      },
      error: null,
    });
    mocks.resolveDbUser.mockRejectedValue(new Error("database unavailable"));

    await expect(signUp({}, signUpForm())).resolves.toEqual({
      error: "We couldn't finish setting up your account. Please try again.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("provisions identity by auth subject and constrains the post-signup redirect", async () => {
    const authUser = { id: "auth-user-1", email: "reader@example.com", identities: [{}] };
    mocks.signUp.mockResolvedValue({
      data: { user: authUser, session: { access_token: "session" } },
      error: null,
    });

    await expect(signUp({}, signUpForm("//evil.example"))).rejects.toThrow(
      "redirect:/dashboard"
    );

    expect(mocks.resolveDbUser).toHaveBeenCalledWith(authUser);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenLastCalledWith("/dashboard");
  });
});
