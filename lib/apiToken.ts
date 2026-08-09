import { createHash, randomBytes } from "crypto";

// 24 bytes = 192 bits of entropy, rendered as 48 hex chars. Far beyond what a
// remote attacker could search, so the lookup below doesn't need to be
// constant-time — and hashing makes the stored value useless anyway.
export function generateApiToken(): string {
  return randomBytes(24).toString("hex");
}

// Plain sha256, deliberately not a password KDF: this is a high-entropy random
// token, not a human-chosen secret, so there is nothing to brute-force and
// nothing for bcrypt/argon2's work factor to buy us. What we need is that the
// stored form can't be replayed against /api/webhook/*, which a one-way hash
// gives us at the cost of a single cheap digest per request.
export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
