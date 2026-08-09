import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "./rateLimit";

// The limiter keys off Date.now() and holds state in module memory, so every
// test drives a fake clock and its own key namespace — otherwise cases leak
// counts into each other through the shared map.
let keySeq = 0;
const freshKey = () => `test:${keySeq++}`;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows exactly `limit` requests in a window", () => {
    const key = freshKey();
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60).ok).toBe(true);
    }
    expect(rateLimit(key, 3, 60).ok).toBe(false);
  });

  it("reports how long the caller has to wait", () => {
    const key = freshKey();
    rateLimit(key, 1, 60);

    vi.advanceTimersByTime(20_000);
    const blocked = rateLimit(key, 1, 60);

    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(40);
  });

  it("starts a fresh window once the old one elapses", () => {
    const key = freshKey();
    rateLimit(key, 1, 60);
    expect(rateLimit(key, 1, 60).ok).toBe(false);

    vi.advanceTimersByTime(60_000);

    expect(rateLimit(key, 1, 60).ok).toBe(true);
  });

  it("keeps separate budgets per key", () => {
    const mine = freshKey();
    const yours = freshKey();

    rateLimit(mine, 1, 60);
    expect(rateLimit(mine, 1, 60).ok).toBe(false);
    // One caller exhausting their budget must not spend anyone else's — this
    // is the property that makes per-email keying worth anything.
    expect(rateLimit(yours, 1, 60).ok).toBe(true);
  });

  it("does not leak a budget across a window boundary mid-burst", () => {
    const key = freshKey();
    expect(rateLimit(key, 2, 60).ok).toBe(true);

    vi.advanceTimersByTime(59_000);
    expect(rateLimit(key, 2, 60).ok).toBe(true);
    expect(rateLimit(key, 2, 60).ok).toBe(false);

    // Fixed window: the whole budget returns at the boundary, which is the
    // documented trade-off — a burst can straddle it.
    vi.advanceTimersByTime(1_000);
    expect(rateLimit(key, 2, 60).ok).toBe(true);
  });
});
