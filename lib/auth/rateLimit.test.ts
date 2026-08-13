import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  forwardedFor: "203.0.113.10" as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));

import {
  checkPasswordResetRateLimit,
  checkSignInRateLimit,
  checkSignUpRateLimit,
} from "./rateLimit";

let sequence = 0;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.forwardedFor = `203.0.113.${++sequence}, 10.0.0.1`;
  mocks.headers.mockImplementation(async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? mocks.forwardedFor : null),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("authentication rate limits", () => {
  it("shares the sign-in budget across email casing variants", async () => {
    const email = `Reader-${sequence}@Example.com`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(checkSignInRateLimit(email)).resolves.toBeNull();
    }

    await expect(checkSignInRateLimit(email.toLowerCase())).resolves.toMatch(
      /^Too many attempts\. Try again in 15 minutes\.$/
    );
  });

  it("keeps the per-email sign-in budget shared when the client IP changes", async () => {
    const email = `distributed-${sequence}@example.com`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(checkSignInRateLimit(email)).resolves.toBeNull();
    }

    mocks.forwardedFor = `198.51.100.${sequence}, 10.0.0.2`;
    await expect(checkSignInRateLimit(email)).resolves.toMatch(/^Too many attempts\./);
  });

  it("uses the first forwarded address as the client budget", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(checkSignUpRateLimit()).resolves.toBeNull();
    }
    await expect(checkSignUpRateLimit()).resolves.toMatch(/^Too many attempts\./);

    mocks.forwardedFor = `203.0.114.${sequence}, ${mocks.forwardedFor}`;
    await expect(checkSignUpRateLimit()).resolves.toBeNull();
  });

  it("normalizes whitespace around the forwarded client address", async () => {
    const client = `198.51.100.${sequence}`;
    mocks.forwardedFor = `  ${client}  , 10.0.0.1`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(checkSignUpRateLimit()).resolves.toBeNull();
    }

    mocks.forwardedFor = `${client}, 10.0.0.1`;
    await expect(checkSignUpRateLimit()).resolves.toMatch(/^Too many attempts\./);
  });

  it("uses one bounded fallback budget when the forwarded address is missing", async () => {
    mocks.forwardedFor = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(checkSignUpRateLimit()).resolves.toBeNull();
    }

    await expect(checkSignUpRateLimit()).resolves.toMatch(/^Too many attempts\./);
  });

  it("keeps sign-in IP budgets isolated between client addresses", async () => {
    for (let account = 0; account < 3; account += 1) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          checkSignInRateLimit(`ip-budget-${sequence}-${account}@example.com`)
        ).resolves.toBeNull();
      }
    }

    await expect(
      checkSignInRateLimit(`ip-budget-${sequence}-blocked@example.com`)
    ).resolves.toMatch(/^Too many attempts\./);

    mocks.forwardedFor = `198.51.100.${sequence}, 10.0.0.1`;
    await expect(
      checkSignInRateLimit(`ip-budget-${sequence}-other-address@example.com`)
    ).resolves.toBeNull();
  });

  it("limits reset email requests per submitted address", async () => {
    const email = `reset-${sequence}@example.com`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(checkPasswordResetRateLimit(email)).resolves.toBeNull();
    }

    await expect(checkPasswordResetRateLimit(email)).resolves.toBe(
      "Too many attempts. Try again in 60 minutes."
    );
  });

  it("keeps password-reset IP budgets isolated between client addresses", async () => {
    for (let account = 0; account < 3; account += 1) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(
          checkPasswordResetRateLimit(`reset-ip-${sequence}-${account}@example.com`)
        ).resolves.toBeNull();
      }
    }
    await expect(
      checkPasswordResetRateLimit(`reset-ip-${sequence}-last@example.com`)
    ).resolves.toBeNull();
    await expect(
      checkPasswordResetRateLimit(`reset-ip-${sequence}-blocked@example.com`)
    ).resolves.toMatch(/^Too many attempts\./);

    mocks.forwardedFor = `198.51.100.${sequence}, 10.0.0.1`;
    await expect(
      checkPasswordResetRateLimit(`reset-ip-${sequence}-other-address@example.com`)
    ).resolves.toBeNull();
  });

  it("restores the budget after its fixed window expires", async () => {
    const email = `window-${sequence}@example.com`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await checkPasswordResetRateLimit(email);
    }
    await expect(checkPasswordResetRateLimit(email)).resolves.toMatch(/^Too many attempts\./);

    vi.advanceTimersByTime(60 * 60 * 1000);

    await expect(checkPasswordResetRateLimit(email)).resolves.toBeNull();
  });

  it("uses singular minute wording during the final minute of a window", async () => {
    const email = `one-minute-${sequence}@example.com`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await checkPasswordResetRateLimit(email);
    }
    vi.advanceTimersByTime(59 * 60 * 1000);

    await expect(checkPasswordResetRateLimit(email)).resolves.toBe(
      "Too many attempts. Try again in 1 minute."
    );
  });
});
