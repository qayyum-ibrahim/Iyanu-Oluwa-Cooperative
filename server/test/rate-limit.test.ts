import { describe, expect, it } from "vitest";
import {
  LOGIN_LIMIT_MAX,
  LOGIN_LIMIT_WINDOW_SECONDS,
  createRateLimiter,
} from "../src/rate-limit.js";

const T0 = new Date("2026-10-28T10:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe("login limit numbers (A-284)", () => {
  it("allows 30 sign-in attempts per address in 15 minutes", () => {
    expect(LOGIN_LIMIT_MAX).toBe(30);
    expect(LOGIN_LIMIT_WINDOW_SECONDS).toBe(900);
  });
});

describe("createRateLimiter", () => {
  it("allows exactly max hits in a window, then refuses", () => {
    const limiter = createRateLimiter(3, 60);
    expect(limiter.hit("a", T0)).toEqual({ ok: true });
    expect(limiter.hit("a", at(1))).toEqual({ ok: true });
    expect(limiter.hit("a", at(2))).toEqual({ ok: true });
    expect(limiter.hit("a", at(3))).toEqual({ ok: false, retryAfterSeconds: 57 });
  });

  it("counts each key on its own", () => {
    const limiter = createRateLimiter(1, 60);
    expect(limiter.hit("a", T0).ok).toBe(true);
    expect(limiter.hit("a", T0).ok).toBe(false);
    expect(limiter.hit("b", T0).ok).toBe(true);
  });

  it("opens a fresh window exactly when the old one ends", () => {
    const limiter = createRateLimiter(1, 60);
    expect(limiter.hit("a", T0).ok).toBe(true);
    expect(limiter.hit("a", new Date(T0.getTime() + 59_999))).toEqual({
      ok: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.hit("a", at(60))).toEqual({ ok: true });
    expect(limiter.hit("a", at(61)).ok).toBe(false);
  });

  it("does not count a refused hit, so hammering does not push the window back", () => {
    const limiter = createRateLimiter(1, 60);
    limiter.hit("a", T0);
    for (let i = 0; i < 10; i += 1) expect(limiter.hit("a", at(30)).ok).toBe(false);
    expect(limiter.hit("a", at(60)).ok).toBe(true);
  });

  it("rounds the wait up to whole seconds, at least 1", () => {
    const limiter = createRateLimiter(1, 60);
    limiter.hit("a", T0);
    expect(limiter.hit("a", new Date(T0.getTime() + 500))).toEqual({
      ok: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.hit("a", new Date(T0.getTime() + 59_001))).toEqual({
      ok: false,
      retryAfterSeconds: 1,
    });
  });

  it("never asks for more than one window when the clock steps back", () => {
    const limiter = createRateLimiter(1, 60);
    limiter.hit("a", T0);
    expect(limiter.hit("a", at(-600))).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("drops ended windows, so memory stays bounded", () => {
    const limiter = createRateLimiter(5, 60);
    for (let i = 0; i < 100; i += 1) limiter.hit(`k${i}`, T0);
    expect(limiter.size()).toBe(100);
    limiter.hit("late", at(60));
    expect(limiter.size()).toBe(1);
  });

  it("keeps windows that have not ended when it sweeps", () => {
    const limiter = createRateLimiter(1, 60);
    limiter.hit("old", T0);
    limiter.hit("young", at(30));
    limiter.hit("other", at(60));
    expect(limiter.size()).toBe(2);
    expect(limiter.hit("young", at(61)).ok).toBe(false);
  });

  it.each([
    [0, 60],
    [-1, 60],
    [1.5, 60],
    [Number.NaN, 60],
    [3, 0],
    [3, 0.5],
    [3, Number.POSITIVE_INFINITY],
  ])("refuses bad numbers (max %s, window %s)", (max, windowSeconds) => {
    expect(() => createRateLimiter(max, windowSeconds)).toThrow(RangeError);
  });
});
