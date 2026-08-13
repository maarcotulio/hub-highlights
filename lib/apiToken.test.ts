import { describe, expect, it } from "vitest";
import { generateApiToken, hashApiToken } from "./apiToken";

describe("API token helpers", () => {
  it("generates an opaque 192-bit token", () => {
    const first = generateApiToken();
    const second = generateApiToken();

    expect(first).toMatch(/^[a-f0-9]{48}$/);
    expect(second).toMatch(/^[a-f0-9]{48}$/);
    expect(second).not.toBe(first);
  });

  it("uses the standard SHA-256 digest for persisted tokens", () => {
    expect(hashApiToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("never returns the plaintext token as its stored representation", () => {
    const token = generateApiToken();

    expect(hashApiToken(token)).not.toBe(token);
  });
});
