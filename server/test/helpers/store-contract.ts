import { describe, expect, it } from "vitest";
import { DuplicateEmailError, UnknownActorError, type Store } from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;

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
  });
}