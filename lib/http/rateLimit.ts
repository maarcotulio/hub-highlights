/**
 * Best-effort fixed-window rate limiter, held in the instance's memory.
 *
 * Be clear about what this is and isn't. Serverless spreads requests across
 * instances that share no state, and instances are recycled, so this is NOT a
 * hard guarantee and must not be treated as one — a determined attacker who
 * spreads requests wide enough will get more through than the nominal limit.
 * A shared store (Upstash/Redis) is what turns this into a real control.
 *
 * What it does buy, cheaply and with no new infrastructure, is a ceiling on
 * the realistic failure here: one misconfigured or looping KOReader plugin
 * hammering /api/webhook/* with the same token, which is exactly the traffic
 * that lands on a single warm instance.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Bound the map so a flood of distinct keys can't itself become the leak.
const MAX_TRACKED_KEYS = 10_000;

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the current window rolls over; for the Retry-After header. */
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) {
      sweep(now);
      // A flood of still-active keys cannot be swept by time. Evict the
      // oldest budget before inserting another so the documented memory bound
      // remains real even under that adversarial shape.
      if (windows.size >= MAX_TRACKED_KEYS) {
        const oldestKey = windows.keys().next().value;
        if (oldestKey !== undefined) windows.delete(oldestKey);
      }
    }
    windows.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

// The plugin syncs every 15 minutes at its most frequent, uploading one file
// per changed book plus a cover backfill on a forced sync. A few hundred
// requests an hour is generous for a large library; a thousand is a loop.
export const WEBHOOK_LIMIT = 1000;
export const WEBHOOK_WINDOW_SEC = 60 * 60;
