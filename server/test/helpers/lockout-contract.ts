import { describe, expect, it } from "vitest";
import { UnknownUserError, type LockoutState, type Store } from "../../src/store.js";

let counter = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;

// Fixed times, far from "now", so a clock bug in an adapter cannot hide behind them.
const T0 = new Date("2026-10-15T10:00:00.000Z");
const MAX = 5;
const LOCK_SECONDS = 900;
const UNTIL = new Date(T0.getTime() + LOCK_SECONDS * 1000);

/** Lockout rules every adapter must follow. Called from runStoreContract. */
export function runLockoutContract(makeStore: () => Promise<Store> | Store): void {
  describe("sign-in lockout", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    const fail = (store: Store, id: string, now: Date = T0) =>
      store.users.recordFailedLogin(id, now, MAX, LOCK_SECONDS);

    async function failTimes(store: Store, id: string, n: number, now: Date = T0) {
      let last: LockoutState | undefined;
      for (let i = 0; i < n; i += 1) last = await fail(store, id, now);
      if (!last) throw new Error("n must be at least 1");
      return last;
    }

    it("starts with no failures and no lock", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-new");
      expect(await store.users.getLockout(u.id)).toEqual({ failedCount: 0, lockedUntil: null });
    });

    it("returns null for an unknown user, throws on count, ignores clear", async () => {
      const store = await makeStore();
      expect(await store.users.getLockout("no-such-user")).toBeNull();
      await expect(fail(store, "no-such-user")).rejects.toBeInstanceOf(UnknownUserError);
      await expect(store.users.clearLockout("no-such-user")).resolves.toBeUndefined();
    });

    it("counts failures below the limit without locking", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-below");
      const state = await failTimes(store, u.id, MAX - 1);
      expect(state).toEqual({ failedCount: MAX - 1, lockedUntil: null });
      expect(await store.users.getLockout(u.id)).toEqual(state);
    });

    it("locks at the limit for exactly the lock time", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-lock");
      const state = await failTimes(store, u.id, MAX);
      expect(state.failedCount).toBe(MAX);
      expect(state.lockedUntil?.getTime()).toBe(UNTIL.getTime());
      expect((await store.users.getLockout(u.id))?.lockedUntil?.getTime()).toBe(UNTIL.getTime());
    });

    it("changes nothing for a failure while locked", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-while");
      await failTimes(store, u.id, MAX);
      const later = new Date(T0.getTime() + 60_000);
      const state = await fail(store, u.id, later);
      expect(state.failedCount).toBe(MAX);
      expect(state.lockedUntil?.getTime()).toBe(UNTIL.getTime());
    });

    it("starts counting again once the lock has expired (expired at its expiry instant)", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-expiry");
      await failTimes(store, u.id, MAX);
      const justBefore = await fail(store, u.id, new Date(UNTIL.getTime() - 1));
      expect(justBefore.failedCount).toBe(MAX);
      expect(justBefore.lockedUntil?.getTime()).toBe(UNTIL.getTime());
      const atExpiry = await fail(store, u.id, UNTIL);
      expect(atExpiry).toEqual({ failedCount: 1, lockedUntil: null });
    });

    it("clearLockout resets the count and removes the lock", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-clear");
      await failTimes(store, u.id, MAX);
      await store.users.clearLockout(u.id);
      expect(await store.users.getLockout(u.id)).toEqual({ failedCount: 0, lockedUntil: null });
      expect(await fail(store, u.id)).toEqual({ failedCount: 1, lockedUntil: null });
    });

    it("keeps each user's count separate", async () => {
      const store = await makeStore();
      const a = await newUser(store, "lk-a");
      const b = await newUser(store, "lk-b");
      await failTimes(store, a.id, MAX);
      await failTimes(store, b.id, 2);
      expect((await store.users.getLockout(a.id))?.lockedUntil).not.toBeNull();
      expect(await store.users.getLockout(b.id)).toEqual({ failedCount: 2, lockedUntil: null });
    });

    it("does not let a caller change stored data through a returned state", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-copy");
      const state = await failTimes(store, u.id, MAX);
      if (!state.lockedUntil) throw new Error("expected a lock");
      state.lockedUntil.setFullYear(2000);
      state.failedCount = 0;
      const read = await store.users.getLockout(u.id);
      if (!read?.lockedUntil) throw new Error("expected a lock");
      read.lockedUntil.setFullYear(2000);
      read.failedCount = 0;
      const again = await store.users.getLockout(u.id);
      expect(again?.failedCount).toBe(MAX);
      expect(again?.lockedUntil?.getTime()).toBe(UNTIL.getTime());
    });

    it("counts every failure when several arrive at once, and locks once", async () => {
      const store = await makeStore();
      const u = await newUser(store, "lk-race");
      await Promise.all(Array.from({ length: MAX }, () => fail(store, u.id)));
      const state = await store.users.getLockout(u.id);
      expect(state?.failedCount).toBe(MAX);
      expect(state?.lockedUntil?.getTime()).toBe(UNTIL.getTime());
    });
  });
}