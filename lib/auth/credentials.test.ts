import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validatePasswordChoice,
  validateSignIn,
  validateSignUp,
} from "./credentials";

const LONG_ENOUGH = "a".repeat(MIN_PASSWORD_LENGTH);

describe("validateEmail", () => {
  it("accepts an ordinary address", () => {
    expect(validateEmail("reader@example.com")).toBeNull();
  });

  it("rejects empty and malformed addresses", () => {
    expect(validateEmail("")).not.toBeNull();
    expect(validateEmail("reader")).not.toBeNull();
    expect(validateEmail("reader@example")).not.toBeNull();
    expect(validateEmail("reader @example.com")).not.toBeNull();
  });
});

describe("validateSignIn", () => {
  it("accepts any non-empty password", () => {
    // Deliberately shorter than MIN_PASSWORD_LENGTH: the length policy applies
    // to passwords being set, not to signing in with an older one.
    expect(validateSignIn("reader@example.com", "short")).toBeNull();
  });

  it("rejects a missing password", () => {
    expect(validateSignIn("reader@example.com", "")).not.toBeNull();
  });

  it("reports the email problem first", () => {
    expect(validateSignIn("nope", "")).toBe(validateEmail("nope"));
  });
});

describe("validatePasswordChoice", () => {
  it("accepts a matching password at the minimum length", () => {
    expect(validatePasswordChoice(LONG_ENOUGH, LONG_ENOUGH)).toBeNull();
  });

  it("rejects a password one character short", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validatePasswordChoice(short, short)).not.toBeNull();
  });

  it("rejects a mismatched confirmation", () => {
    expect(validatePasswordChoice(LONG_ENOUGH, `${LONG_ENOUGH}x`)).not.toBeNull();
  });

  it("checks length before the match, so a short pair reports the length", () => {
    expect(validatePasswordChoice("abc", "xyz")).toBe(validatePasswordChoice("abc", "abc"));
  });
});

describe("validateSignUp", () => {
  it("accepts a valid, matching, long-enough password", () => {
    expect(validateSignUp("reader@example.com", LONG_ENOUGH, LONG_ENOUGH)).toBeNull();
  });

  it("rejects a password below the minimum length", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateSignUp("reader@example.com", short, short)).not.toBeNull();
  });

  it("rejects mismatched confirmations", () => {
    expect(
      validateSignUp("reader@example.com", LONG_ENOUGH, `${LONG_ENOUGH}x`)
    ).not.toBeNull();
  });

  it("rejects a bad email before looking at the password", () => {
    expect(validateSignUp("nope", LONG_ENOUGH, LONG_ENOUGH)).toBe(validateEmail("nope"));
  });
});
