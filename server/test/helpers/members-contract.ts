import { describe, expect, it } from "vitest";
import { UnknownActorError, type NewMember, type Store } from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;

// Building a fresh database runs the real migrations, which is slow on a slow machine.
const EMPTY_STORE_TIMEOUT = 120_000;

/**
 * Rules for the members store, the same for every adapter.
 * makeStore may return a store that keeps data between tests.
 * makeEmptyStore must return a brand new, empty store every time it is called.
 */
export function runMembersContract(
  makeStore: () => Promise<Store> | Store,
  makeEmptyStore: () => Promise<Store> | Store,
): void {
  describe("members", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    // Fictional details only (D-08).
    const details = (createdById: string, over: Partial<NewMember> = {}): NewMember => ({
      fullName: "Test Member",
      phone: "08000000001",
      address: "1 Test Street",
      occupation: "Trader",
      createdById,
      ...over,
    });

    it("creates an active member with the given details, an id, a Membership ID and a date", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-create");
      const m = await store.members.create(details(u.id));
      expect(m.id.length).toBeGreaterThan(0);
      expect(m).toMatchObject({
        fullName: "Test Member",
        phone: "08000000001",
        address: "1 Test Street",
        occupation: "Trader",
        status: "ACTIVE",
        createdById: u.id,
      });
      expect(m.membershipId).toMatch(/^IO-\d{3,}$/);
      expect(m.createdAt).toBeInstanceOf(Date);
    });

    it(
      "numbers the first three members IO-001, IO-002 and IO-003 on an empty store",
      { timeout: EMPTY_STORE_TIMEOUT },
      async () => {
        const store = await makeEmptyStore();
        const u = await newUser(store, "m-numbers");
        const ids: string[] = [];
        for (let i = 0; i < 3; i += 1) {
          ids.push((await store.members.create(details(u.id))).membershipId);
        }
        expect(ids).toEqual(["IO-001", "IO-002", "IO-003"]);
      },
    );

    it("gives parallel creates different numbers and different ids", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-parallel");
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          store.members.create(details(u.id, { fullName: `Parallel ${i}` })),
        ),
      );
      const numbers = results.map((m) => m.membershipId);
      expect(new Set(numbers).size).toBe(5);
      expect(new Set(results.map((m) => m.id)).size).toBe(5);
      for (const n of numbers) expect(n).toMatch(/^IO-\d{3,}$/);
    });

    it("rejects an unknown creator with UnknownActorError and saves nothing", async () => {
      const store = await makeStore();
      const before = (await store.members.list({})).length;
      await expect(store.members.create(details("no-such-user"))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
      expect((await store.members.list({})).length).toBe(before);
    });

    it("finds a member by id, and returns null for an unknown id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-find");
      const m = await store.members.create(details(u.id));
      expect(await store.members.findById(m.id)).toMatchObject({
        id: m.id,
        membershipId: m.membershipId,
      });
      expect(await store.members.findById("no-such-id")).toBeNull();
    });

    it("saves text exactly as given, including empty text", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-text");
      const m = await store.members.create(
        details(u.id, { fullName: "  Adé  Ọlá ", phone: "", address: "", occupation: "" }),
      );
      const found = await store.members.findById(m.id);
      expect(found).toMatchObject({ fullName: "  Adé  Ọlá ", phone: "", address: "", occupation: "" });
    });

    it("lists members in Membership ID order, oldest first", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-order");
      for (const name of ["Order A", "Order B", "Order C"]) {
        await store.members.create(details(u.id, { fullName: name }));
      }
      const list = await store.members.list({ createdById: u.id });
      expect(list.map((m) => m.fullName)).toEqual(["Order A", "Order B", "Order C"]);
    });

    it("lists only the members recorded by the asked user", async () => {
      const store = await makeStore();
      const a = await newUser(store, "m-by-a");
      const b = await newUser(store, "m-by-b");
      const ma = await store.members.create(details(a.id));
      const mb = await store.members.create(details(b.id));
      expect((await store.members.list({ createdById: a.id })).map((m) => m.id)).toEqual([ma.id]);
      expect((await store.members.list({ createdById: b.id })).map((m) => m.id)).toEqual([mb.id]);
      expect(await store.members.list({ createdById: "no-such-user" })).toEqual([]);
    });

    it("filters by status", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-status");
      const a = await store.members.create(details(u.id, { fullName: "Active One" }));
      const b = await store.members.create(details(u.id, { fullName: "Inactive One" }));
      await store.members.setStatus(b.id, "INACTIVE");
      const ids = async (status?: "ACTIVE" | "INACTIVE") =>
        (
          await store.members.list({ createdById: u.id, ...(status ? { status } : {}) })
        ).map((m) => m.id);
      expect(await ids("ACTIVE")).toEqual([a.id]);
      expect(await ids("INACTIVE")).toEqual([b.id]);
      expect(await ids()).toEqual([a.id, b.id]);
    });

    it("sets the status both ways, and returns false for an unknown member", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-set");
      const m = await store.members.create(details(u.id));
      expect(await store.members.setStatus(m.id, "INACTIVE")).toBe(true);
      expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
      expect(await store.members.setStatus(m.id, "ACTIVE")).toBe(true);
      expect((await store.members.findById(m.id))?.status).toBe("ACTIVE");
      expect(await store.members.setStatus("no-such-id", "INACTIVE")).toBe(false);
    });

    it("does not let a caller change stored data through a returned member", async () => {
      const store = await makeStore();
      const u = await newUser(store, "m-copy");
      const m = await store.members.create(details(u.id));
      m.fullName = "Changed";
      m.status = "INACTIVE";
      m.createdAt.setFullYear(2000);
      const again = await store.members.findById(m.id);
      expect(again?.fullName).toBe("Test Member");
      expect(again?.status).toBe("ACTIVE");
      expect(again?.createdAt.getFullYear()).not.toBe(2000);
    });

    it("lists every member when there is no filter, in creation order", async () => {
      const store = await makeStore();
      const a = await newUser(store, "m-all-a");
      const b = await newUser(store, "m-all-b");
      const ma = await store.members.create(details(a.id));
      const mb = await store.members.create(details(b.id));
      const ids = (await store.members.list({})).map((m) => m.id);
      expect(ids).toContain(ma.id);
      expect(ids).toContain(mb.id);
      expect(ids.indexOf(ma.id)).toBeLessThan(ids.indexOf(mb.id));
    });
  });
}