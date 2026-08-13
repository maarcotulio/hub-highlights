import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  createClient: vi.fn(),
  checkRateLimit: vi.fn(),
  resolveDbUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/rateLimit", () => ({ checkSignInRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/currentUser", () => ({ resolveDbUser: mocks.resolveDbUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { signIn } from "./actions";

function signInForm(email: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("password", "wrong-password");
  return form;
}

describe("signIn account enumeration", () => {
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
});
