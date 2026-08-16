import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  createClient: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/rateLimit", () => ({
  checkPasswordResetRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { requestPasswordReset } from "./actions";

function resetForm(email: string): FormData {
  const form = new FormData();
  form.set("email", email);
  return form;
}

describe("requestPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(null);
    mocks.createClient.mockResolvedValue({
      auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
    });
    mocks.resetPasswordForEmail.mockImplementation(async (email: string) =>
      email === "known@example.com"
        ? { error: null }
        : { error: { code: "user_not_found", message: "No such account" } }
    );
  });

  it("returns the same success response whether or not the account exists", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const unknown = await requestPasswordReset({}, resetForm("unknown@example.com"));
    const known = await requestPasswordReset({}, resetForm("known@example.com"));

    expect(unknown).toEqual({ sent: true });
    expect(known).toEqual(unknown);
    consoleError.mockRestore();
  });

  it("validates the submitted email before spending a rate-limit budget", async () => {
    const result = await requestPasswordReset({}, resetForm("not-an-email"));

    expect(result).toEqual({ error: "That doesn't look like a valid email address." });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stops before the provider when reset requests are throttled", async () => {
    mocks.checkRateLimit.mockResolvedValue("Too many attempts.");

    const result = await requestPasswordReset({}, resetForm("reader@example.com"));

    expect(result).toEqual({ error: "Too many attempts." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports the provider's email-send throttle instead of claiming mail was sent", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit" },
    });

    const result = await requestPasswordReset({}, resetForm("reader@example.com"));

    expect(result).toEqual({
      error: "Too many reset emails just went out. Wait a bit and try again.",
    });
  });
});
