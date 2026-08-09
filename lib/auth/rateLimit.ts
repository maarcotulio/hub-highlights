import "server-only";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/http/rateLimit";

/**
 * Throttling for the auth server actions, on top of the generic limiter in
 * lib/http/rateLimit.ts.
 *
 * Why this exists at all, when Supabase has its own rate limits: those are
 * per-IP, and since these actions call Supabase from the server, every user's
 * sign-in now arrives from the same deployment IP. That collapses a per-user
 * budget into one shared bucket — useless against a distributed guesser, and a
 * denial of service the moment one attacker exhausts it for everyone. Limiting
 * here, per email and per client IP, is what restores the per-user shape.
 *
 * Same caveat as the underlying limiter: instance memory, so serverless spreads
 * it and it is best-effort, not a hard guarantee. A shared store (Upstash,
 * Redis) is what turns it into one. It still bounds the realistic attack — a
 * script hammering one account from one place.
 */

type Budget = { limit: number; windowSec: number };

const FIFTEEN_MIN = 15 * 60;
const ONE_HOUR = 60 * 60;

// Sign-in is the credential-guessing surface, so the per-email budget is the
// tight one; the per-IP budget is looser because a household or office shares
// an address.
const SIGN_IN_PER_EMAIL: Budget = { limit: 10, windowSec: FIFTEEN_MIN };
const SIGN_IN_PER_IP: Budget = { limit: 30, windowSec: FIFTEEN_MIN };

// Account creation is the enumeration surface — /signup is the one place that
// confirms an address is registered, so the budget is what keeps that answer
// from being harvestable in bulk.
const SIGN_UP_PER_IP: Budget = { limit: 5, windowSec: ONE_HOUR };

// Recovery sends mail to an address the requester doesn't have to own, so the
// per-email budget is really the victim's inbox budget.
const RESET_PER_EMAIL: Budget = { limit: 3, windowSec: ONE_HOUR };
const RESET_PER_IP: Budget = { limit: 10, windowSec: ONE_HOUR };

async function clientIp(): Promise<string> {
  const headerList = await headers();
  // Vercel and most proxies prepend the client; the first entry is the one the
  // edge saw. Everything after it is downstream hops and is attacker-settable.
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

function retryMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/**
 * Returns a message to show the caller, or null when the request may proceed.
 *
 * The message is identical whether or not the address has an account: the keys
 * are the *submitted* email and the caller's IP, neither of which depends on
 * what the database holds. A throttle that only tripped for real accounts would
 * be the account-enumeration oracle the sign-in form carefully avoids being.
 */
async function check(budgets: Array<[string, Budget]>): Promise<string | null> {
  const ip = await clientIp();

  for (const [scope, budget] of budgets) {
    const key = scope.startsWith("ip:") ? `${scope}${ip}` : scope;
    const result = rateLimit(key, budget.limit, budget.windowSec);
    if (!result.ok) return retryMessage(result.retryAfterSec);
  }

  return null;
}

// Lowercased so that changing the casing of an address doesn't mint a fresh
// budget; Supabase treats addresses case-insensitively for lookup anyway.
const emailKey = (action: string, email: string) => `${action}:email:${email.toLowerCase()}`;

export function checkSignInRateLimit(email: string) {
  return check([
    [emailKey("signin", email), SIGN_IN_PER_EMAIL],
    ["ip:signin:", SIGN_IN_PER_IP],
  ]);
}

export function checkSignUpRateLimit() {
  return check([["ip:signup:", SIGN_UP_PER_IP]]);
}

export function checkPasswordResetRateLimit(email: string) {
  return check([
    [emailKey("reset", email), RESET_PER_EMAIL],
    ["ip:reset:", RESET_PER_IP],
  ]);
}
