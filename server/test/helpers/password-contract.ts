import { describe, expect, it } from "vitest";
import type { Store } from "../../src/store.js";

let counter = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;

/** Password-hash rules every adapter must follow. Called from runStoreContract. */
export function runPasswordContract(makeStore: () => Promise<Store> | Store): void {
  describe("stored password hash", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "old-hash",
        displayName: "Test User",
        permissions: ["dashboard"],
      });

    it("setPasswordHash returns true and the new hash shows in findById and findByEmail", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pw-set");
      expect(await store.users.setPasswordHash(u.id, "new-hash")).toBe(true);
      expect((await store.users.findById(u.id))?.passwordHash).toBe("new-hash");
      expect((await store.users.findByEmail(u.email))?.passwordHash).toBe("new-hash");
    });

    it("returns false for an unknown user", async () => {
      const store = await makeStore();
      expect(await store.users.setPasswordHash("no-such-user", "new-hash")).toBe(false);
    });

    it("changes only the hash, and only for that user", async () => {
      const store = await makeStore();
      const a = await newUser(store, "pw-only-a");
      const b = await newUser(store, "pw-only-b");
      await store.users.setPasswordHash(a.id, "new-hash");
      expect(await store.users.findById(a.id)).toMatchObject({
        email: a.email,
        role: "STAFF",
        isActive: true,
        displayName: "Test User",
        permissions: ["dashboard"],
      });
      expect((await store.users.findById(b.id))?.passwordHash).toBe("old-hash");
    });

    it("leaves the lockout state and refresh tokens alone (the logic code decides about both)", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pw-alone");
      await store.users.recordFailedLogin(u.id, new Date("2026-10-16T10:00:00.000Z"), 5, 900);
      const t = await store.refreshTokens.create({
        userId: u.id,
        familyId: `pw-family-${++counter}`,
        tokenHash: `pw-hash-${Date.now()}-${++counter}`,
        expiresAt: new Date("2026-10-23T10:00:00.000Z"),
      });
      await store.users.setPasswordHash(u.id, "new-hash");
      expect(await store.users.getLockout(u.id)).toEqual({ failedCount: 1, lockedUntil: null });
      expect((await store.refreshTokens.findByHash(t.tokenHash))?.revokedAt).toBeNull();
    });
  });
}