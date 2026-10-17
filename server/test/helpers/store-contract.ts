import { describe, expect, it } from "vitest";
import {
  DuplicateEmailError,
  DuplicateTokenHashError,
  UnknownActorError,
  UnknownUserError,
  type Store,
} from "../../src/store.js";
import { runLockoutContract } from "./lockout-contract.js";
import { runActiveContract } from "./active-contract.js";
import { runAuditListContract } from "./audit-list-contract.js";
import { runPasswordContract } from "./password-contract.js";
import { runPermissionsContract } from "./permissions-contract.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
const uniqueHash = () => `hash-${Date.now()}-${++counter}`;
const uniqueFamily = () => `family-${Date.now()}-${++counter}`;

// Building a fresh database runs the real migrations, which is slow on a slow machine.
const EMPTY_STORE_TIMEOUT = 120_000;

/**
 * The same rules for every adapter. The in-memory adapter must behave like the real one.
 * makeStore may return a store that keeps data between tests.
 * makeEmptyStore must return a brand new, empty store every time it is called.
 */
export function runStoreContract(
  label: string,
  makeStore: () => Promise<Store> | Store,
  makeEmptyStore: () => Promise<Store> | Store,
): void {
  describe(`Store contract: ${label}`, () => {
    const newUser = (store: Store, tag: string, role?: "SUPER_ADMIN" | "STAFF") =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
        ...(role ? { role } : {}),
      });

    it("creates a user with default role STAFF, active, with id and date", async () => {
      const store = await makeStore();
      const u = await newUser(store, "default");
      expect(u.id.length).toBeGreaterThan(0);
      expect(u.role).toBe("STAFF");
      expect(u.isActive).toBe(true);
      expect(u.createdAt).toBeInstanceOf(Date);
    });

    it("keeps an explicit SUPER_ADMIN role", async () => {
      const store = await makeStore();
      const u = await newUser(store, "admin", "SUPER_ADMIN");
      expect(u.role).toBe("SUPER_ADMIN");
    });

    it("finds a user by email and by id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "find");
      expect(await store.users.findByEmail(u.email)).toMatchObject({ id: u.id, email: u.email });
      expect(await store.users.findById(u.id)).toMatchObject({ id: u.id, email: u.email });
    });

    it("returns null for an unknown email or id", async () => {
      const store = await makeStore();
      expect(await store.users.findByEmail("nobody@example.test")).toBeNull();
      expect(await store.users.findById("no-such-id")).toBeNull();
    });

    it("rejects a duplicate email with DuplicateEmailError", async () => {
      const store = await makeStore();
      const u = await newUser(store, "dup");
      await expect(
        store.users.create({ email: u.email, passwordHash: "x", displayName: "Other" }),
      ).rejects.toBeInstanceOf(DuplicateEmailError);
    });

    it("matches email exactly: a different letter case is a different email (logic code normalises, D-22)", async () => {
      const store = await makeStore();
      const u = await newUser(store, "case");
      expect(await store.users.findByEmail(u.email.toUpperCase())).toBeNull();
    });

    it("does not let a caller change stored data through a returned user", async () => {
      const store = await makeStore();
      const u = await newUser(store, "copy");
      u.displayName = "Changed";
      u.role = "SUPER_ADMIN";
      const again = await store.users.findById(u.id);
      expect(again?.displayName).toBe("Test User");
      expect(again?.role).toBe("STAFF");
    });

    it(
      "reports whether a Super Admin exists (staff do not count)",
      { timeout: EMPTY_STORE_TIMEOUT },
      async () => {
        const store = await makeEmptyStore();
        expect(await store.users.hasSuperAdmin()).toBe(false);
        await newUser(store, "staff-only", "STAFF");
        expect(await store.users.hasSuperAdmin()).toBe(false);
        await newUser(store, "the-admin", "SUPER_ADMIN");
        expect(await store.users.hasSuperAdmin()).toBe(true);
      },
    );

    it("stores an audit entry with its actor and lists it", async () => {
      const store = await makeStore();
      const u = await newUser(store, "actor");
      const entry = await store.audit.append({
        actorId: u.id,
        action: "test.action",
        entityType: "User",
        entityId: u.id,
        detail: "hello",
      });
      expect(entry).toMatchObject({
        actorId: u.id,
        action: "test.action",
        entityType: "User",
        entityId: u.id,
        detail: "hello",
      });
      expect(entry.createdAt).toBeInstanceOf(Date);
      const list = await store.audit.listByActor(u.id);
      expect(list.map((a) => a.id)).toEqual([entry.id]);
    });

    it("fills missing optional audit fields with null", async () => {
      const store = await makeStore();
      const entry = await store.audit.append({ action: "system.setup", entityType: "System" });
      expect(entry.actorId).toBeNull();
      expect(entry.entityId).toBeNull();
      expect(entry.detail).toBeNull();
    });

    it("rejects an audit entry whose actor does not exist with UnknownActorError", async () => {
      const store = await makeStore();
      await expect(
        store.audit.append({ actorId: "no-such-user", action: "x", entityType: "User" }),
      ).rejects.toBeInstanceOf(UnknownActorError);
    });

    it("lists only the entries of the asked actor", async () => {
      const store = await makeStore();
      const a = await newUser(store, "list-a");
      const b = await newUser(store, "list-b");
      await store.audit.append({ actorId: a.id, action: "a.one", entityType: "User" });
      await store.audit.append({ actorId: a.id, action: "a.two", entityType: "User" });
      await store.audit.append({ actorId: b.id, action: "b.one", entityType: "User" });
      const forA = (await store.audit.listByActor(a.id)).map((e) => e.action).sort();
      const forB = (await store.audit.listByActor(b.id)).map((e) => e.action);
      expect(forA).toEqual(["a.one", "a.two"]);
      expect(forB).toEqual(["b.one"]);
    });

    describe("refresh tokens", () => {
      // Fixed times, far from "now", so a clock bug in an adapter cannot hide behind them.
      const T0 = new Date("2026-10-15T10:00:00.000Z");
      const EXPIRY = new Date("2026-10-22T10:00:00.123Z");
      const at = (ms: number) => new Date(EXPIRY.getTime() + ms);

      async function newToken(store: Store, userId: string, familyId = uniqueFamily()) {
        return store.refreshTokens.create({
          userId,
          familyId,
          tokenHash: uniqueHash(),
          expiresAt: EXPIRY,
        });
      }

      it("creates a token: unused, not revoked, with an id, a date and the exact expiry", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-create");
        const familyId = uniqueFamily();
        const hash = uniqueHash();
        const t = await store.refreshTokens.create({
          userId: u.id,
          familyId,
          tokenHash: hash,
          expiresAt: EXPIRY,
        });
        expect(t.id.length).toBeGreaterThan(0);
        expect(t).toMatchObject({ userId: u.id, familyId, tokenHash: hash, usedAt: null, revokedAt: null });
        expect(t.createdAt).toBeInstanceOf(Date);
        expect(t.expiresAt.getTime()).toBe(EXPIRY.getTime());
      });

      it("finds a token by its hash, in any state, and returns null for an unknown hash", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-find");
        const t = await newToken(store, u.id);
        expect(await store.refreshTokens.findByHash(t.tokenHash)).toMatchObject({
          id: t.id,
          userId: u.id,
        });
        await store.refreshTokens.consume(t.id, T0);
        await store.refreshTokens.revokeFamily(t.familyId, T0);
        expect(await store.refreshTokens.findByHash(t.tokenHash)).toMatchObject({ id: t.id });
        expect(await store.refreshTokens.findByHash("no-such-hash")).toBeNull();
      });

      it("matches the hash exactly (letter case counts)", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-case");
        const t = await newToken(store, u.id);
        expect(await store.refreshTokens.findByHash(t.tokenHash.toUpperCase())).toBeNull();
      });

      it("rejects a duplicate hash with DuplicateTokenHashError", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-dup");
        const t = await newToken(store, u.id);
        await expect(
          store.refreshTokens.create({
            userId: u.id,
            familyId: uniqueFamily(),
            tokenHash: t.tokenHash,
            expiresAt: EXPIRY,
          }),
        ).rejects.toBeInstanceOf(DuplicateTokenHashError);
      });

      it("rejects a token for an unknown user with UnknownUserError", async () => {
        const store = await makeStore();
        await expect(
          store.refreshTokens.create({
            userId: "no-such-user",
            familyId: uniqueFamily(),
            tokenHash: uniqueHash(),
            expiresAt: EXPIRY,
          }),
        ).rejects.toBeInstanceOf(UnknownUserError);
      });

      it("consumes a token once: true, then false, and records the time used", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-once");
        const t = await newToken(store, u.id);
        expect(await store.refreshTokens.consume(t.id, T0)).toBe(true);
        expect(await store.refreshTokens.consume(t.id, T0)).toBe(false);
        const after = await store.refreshTokens.findByHash(t.tokenHash);
        expect(after?.usedAt?.getTime()).toBe(T0.getTime());
        expect(after?.revokedAt).toBeNull();
      });

      it("gives only one winner when two callers consume the same token at once", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-race");
        const t = await newToken(store, u.id);
        const results = await Promise.all([
          store.refreshTokens.consume(t.id, T0),
          store.refreshTokens.consume(t.id, T0),
          store.refreshTokens.consume(t.id, T0),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it("does not consume an unknown id", async () => {
        const store = await makeStore();
        expect(await store.refreshTokens.consume("no-such-id", T0)).toBe(false);
      });

      it("consumes up to the last millisecond before expiry, not at or after it", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-expiry");
        const before = await newToken(store, u.id);
        const exact = await newToken(store, u.id);
        const later = await newToken(store, u.id);
        expect(await store.refreshTokens.consume(before.id, at(-1))).toBe(true);
        expect(await store.refreshTokens.consume(exact.id, at(0))).toBe(false);
        expect(await store.refreshTokens.consume(later.id, at(1))).toBe(false);
        expect((await store.refreshTokens.findByHash(exact.tokenHash))?.usedAt).toBeNull();
      });

      it("does not consume a revoked token", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-revoked");
        const t = await newToken(store, u.id);
        await store.refreshTokens.revokeFamily(t.familyId, T0);
        expect(await store.refreshTokens.consume(t.id, T0)).toBe(false);
        expect((await store.refreshTokens.findByHash(t.tokenHash))?.usedAt).toBeNull();
      });

      it("revokes one family only, and counts only what changed", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-family");
        const fam = uniqueFamily();
        const a = await newToken(store, u.id, fam);
        const b = await newToken(store, u.id, fam);
        const other = await newToken(store, u.id);
        expect(await store.refreshTokens.revokeFamily(fam, T0)).toBe(2);
        expect((await store.refreshTokens.findByHash(a.tokenHash))?.revokedAt?.getTime()).toBe(
          T0.getTime(),
        );
        expect((await store.refreshTokens.findByHash(b.tokenHash))?.revokedAt).not.toBeNull();
        expect((await store.refreshTokens.findByHash(other.tokenHash))?.revokedAt).toBeNull();
        expect(await store.refreshTokens.revokeFamily(fam, at(5))).toBe(0);
        // The first revoke time is kept.
        expect((await store.refreshTokens.findByHash(a.tokenHash))?.revokedAt?.getTime()).toBe(
          T0.getTime(),
        );
      });

      it("revokes used tokens of the family as well", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-used-family");
        const fam = uniqueFamily();
        const used = await newToken(store, u.id, fam);
        await store.refreshTokens.consume(used.id, T0);
        const fresh = await newToken(store, u.id, fam);
        expect(await store.refreshTokens.revokeFamily(fam, T0)).toBe(2);
        expect((await store.refreshTokens.findByHash(used.tokenHash))?.revokedAt).not.toBeNull();
        expect(await store.refreshTokens.consume(fresh.id, T0)).toBe(false);
      });

      it("revokes every token of one user and no other user's", async () => {
        const store = await makeStore();
        const a = await newUser(store, "rt-user-a");
        const b = await newUser(store, "rt-user-b");
        const a1 = await newToken(store, a.id);
        const a2 = await newToken(store, a.id);
        const b1 = await newToken(store, b.id);
        expect(await store.refreshTokens.revokeAllForUser(a.id, T0)).toBe(2);
        expect((await store.refreshTokens.findByHash(a1.tokenHash))?.revokedAt).not.toBeNull();
        expect((await store.refreshTokens.findByHash(a2.tokenHash))?.revokedAt).not.toBeNull();
        expect((await store.refreshTokens.findByHash(b1.tokenHash))?.revokedAt).toBeNull();
        expect(await store.refreshTokens.revokeAllForUser(a.id, T0)).toBe(0);
      });

      it("returns 0 when revoking an unknown family or user", async () => {
        const store = await makeStore();
        expect(await store.refreshTokens.revokeFamily("no-such-family", T0)).toBe(0);
        expect(await store.refreshTokens.revokeAllForUser("no-such-user", T0)).toBe(0);
      });

      it("does not let a caller change stored data through a returned record or a passed-in date", async () => {
        const store = await makeStore();
        const u = await newUser(store, "rt-copy");
        const expiry = new Date(EXPIRY);
        const t = await store.refreshTokens.create({
          userId: u.id,
          familyId: uniqueFamily(),
          tokenHash: uniqueHash(),
          expiresAt: expiry,
        });
        // Change the date we passed in, and the record that create returned.
        expiry.setFullYear(2000);
        t.revokedAt = new Date();
        t.usedAt = new Date();
        t.expiresAt.setFullYear(2000);
        // Change a record that findByHash returned.
        const found = await store.refreshTokens.findByHash(t.tokenHash);
        if (!found) throw new Error("token not found");
        found.revokedAt = new Date();
        found.usedAt = new Date();
        found.expiresAt.setFullYear(2000);
        // The stored data is unchanged.
        const again = await store.refreshTokens.findByHash(t.tokenHash);
        expect(again?.revokedAt).toBeNull();
        expect(again?.usedAt).toBeNull();
        expect(again?.expiresAt.getTime()).toBe(EXPIRY.getTime());
      });
    });

    runLockoutContract(makeStore);
    runPermissionsContract(makeStore);
    runActiveContract(makeStore);
    runPasswordContract(makeStore);
    runAuditListContract(makeStore);
  });
}