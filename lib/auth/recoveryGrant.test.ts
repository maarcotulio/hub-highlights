import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { clearRecoveryAccess, grantRecoveryAccess, hasRecoveryAccess } from "./recoveryGrant";

describe("recovery grant cookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ set: mocks.set, get: mocks.get, delete: mocks.delete });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a short-lived HTTP-only marker after recovery redemption", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await grantRecoveryAccess();

    expect(mocks.set).toHaveBeenCalledWith("hub-recovery", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
  });

  it("does not require a Secure cookie on an explicitly non-TLS development origin", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await grantRecoveryAccess();

    expect(mocks.set).toHaveBeenCalledWith(
      "hub-recovery",
      "1",
      expect.objectContaining({ secure: false })
    );
  });

  it("grants access only for the exact marker value", async () => {
    mocks.get.mockReturnValue({ value: "1" });
    await expect(hasRecoveryAccess()).resolves.toBe(true);

    mocks.get.mockReturnValue({ value: "forged" });
    await expect(hasRecoveryAccess()).resolves.toBe(false);

    mocks.get.mockReturnValue(undefined);
    await expect(hasRecoveryAccess()).resolves.toBe(false);
  });

  it("deletes the marker after a successful reset", async () => {
    await clearRecoveryAccess();

    expect(mocks.delete).toHaveBeenCalledWith("hub-recovery");
  });
});
