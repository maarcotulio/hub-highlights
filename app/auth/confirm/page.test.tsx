import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmRecovery: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./actions", () => ({ confirmRecovery: mocks.confirmRecovery }));

import ConfirmPage from "./page";

describe("password recovery confirmation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects OTP types other than recovery", async () => {
    await expect(
      ConfirmPage({
        searchParams: Promise.resolve({ token_hash: "token", type: "email" }),
      })
    ).rejects.toThrow("redirect:/login?error=link_expired");

    expect(mocks.confirmRecovery).not.toHaveBeenCalled();
  });

  it("rejects repeated token or type query parameters", async () => {
    await expect(
      ConfirmPage({
        searchParams: Promise.resolve({ token_hash: ["first", "second"], type: "recovery" }),
      })
    ).rejects.toThrow("redirect:/login?error=link_expired");

    await expect(
      ConfirmPage({
        searchParams: Promise.resolve({ token_hash: "token", type: ["recovery", "email"] }),
      })
    ).rejects.toThrow("redirect:/login?error=link_expired");
  });

  it("does not redeem a valid token during page rendering or prefetch", async () => {
    const page = await ConfirmPage({
      searchParams: Promise.resolve({ token_hash: "token", type: "recovery" }),
    });

    expect(page).toBeDefined();
    expect(mocks.confirmRecovery).not.toHaveBeenCalled();
  });
});
