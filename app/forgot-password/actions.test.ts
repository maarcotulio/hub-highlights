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

describe("requestPasswordReset account enumeration", () => {
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
});
