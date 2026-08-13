import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
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
vi.mock("@/lib/auth/rateLimit", () => ({ checkSignInRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/currentUser", () => ({ resolveDbUser: mocks.resolveDbUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { signIn } from "./actions";

function signInForm(email: string, password = "wrong-password", next?: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  if (next !== undefined) form.set("next", next);
  return form;
}

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPassword },
    });
    mocks.signInWithPassword.mockImplementation(async ({ email }: { email: string }) =>
      email === "known@example.com"
        ? { data: { user: null }, error: { code: "invalid_credentials" } }
        : { data: { user: null }, error: { code: "user_not_found" } }
    );
  });

  it("returns the same generic failure for an unknown account and a wrong password", async () => {
    const unknown = await signIn({}, signInForm("unknown@example.com"));
    const wrongPassword = await signIn({}, signInForm("known@example.com"));

    expect(unknown).toEqual({ error: "Email or password is incorrect." });
    expect(wrongPassword).toEqual(unknown);
  });

  it("validates malformed credentials before spending a rate-limit budget", async () => {
    const result = await signIn({}, signInForm("not-an-email"));

    expect(result).toEqual({ error: "That doesn't look like a valid email address." });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stops before the provider when the request is throttled", async () => {
    mocks.checkRateLimit.mockResolvedValue("Too many attempts.");

    const result = await signIn({}, signInForm("reader@example.com"));

    expect(result).toEqual({ error: "Too many attempts." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("provisions the authenticated identity and constrains the redirect", async () => {
    const authUser = { id: "auth-user-1", email: "reader@example.com" };
    mocks.signInWithPassword.mockResolvedValue({ data: { user: authUser }, error: null });
    mocks.resolveDbUser.mockResolvedValue({ id: "db-user-1" });

    await expect(
      signIn({}, signInForm("  reader@example.com  ", "correct-password", "//evil.example"))
    ).rejects.toThrow("redirect:/dashboard");

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "reader@example.com",
      password: "correct-password",
    });
    expect(mocks.resolveDbUser).toHaveBeenCalledWith(authUser);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a recoverable error when database identity provisioning fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.resolveDbUser.mockRejectedValue(new Error("database unavailable"));

    const result = await signIn({}, signInForm("reader@example.com"));

    expect(result).toEqual({
      error: "We couldn't finish setting up your account. Please try again.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
