// A fixed-window request counter per key (A-42, step 9.3). Pure logic: the caller passes the time.
// In memory only: it starts empty at every server start and is not shared between processes.

/** Sign-in attempts allowed per client address in one window (A-284: my choice, not the owner's). */
export const LOGIN_LIMIT_MAX = 30;
/** One window lasts this many seconds (15 minutes). */
export const LOGIN_LIMIT_WINDOW_SECONDS = 900;

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Counts one request for `key` at `now`. A refused request is not counted. */
  hit(key: string, now: Date): LimitResult;
  /** How many keys are held right now (for tests). */
  size(): number;
}

export function createRateLimiter(max: number, windowSeconds: number): RateLimiter {
  if (!Number.isInteger(max) || max < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new RangeError("a rate limit needs whole numbers above 0");
  }
  const windowMs = windowSeconds * 1000;
  const windows = new Map<string, { startMs: number; count: number }>();
  let lastSweepMs = Number.NEGATIVE_INFINITY;

  return {
    hit(key, now) {
      const nowMs = now.getTime();
      // Drop ended windows at most once per window, so memory stays bounded without a timer.
      if (nowMs - lastSweepMs >= windowMs) {
        for (const [k, w] of windows) {
          if (nowMs - w.startMs >= windowMs) windows.delete(k);
        }
        lastSweepMs = nowMs;
      }
      const current = windows.get(key);
      if (current === undefined || nowMs - current.startMs >= windowMs) {
        windows.set(key, { startMs: nowMs, count: 1 });
        return { ok: true };
      }
      if (current.count >= max) {
        const leftSeconds = Math.ceil((current.startMs + windowMs - nowMs) / 1000);
        // Clamped, so a clock that steps back never asks for more than one window.
        return { ok: false, retryAfterSeconds: Math.min(windowSeconds, Math.max(1, leftSeconds)) };
      }
      current.count += 1;
      return { ok: true };
    },
    size() {
      return windows.size;
    },
  };
}
