import { describe, expect, it } from "vitest";
import type { Store } from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const unique = (tag: string) => `${tag}-${Date.now()}-${++counter}`;
// Entries get their time from the store, so tests wait a little to get different times.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** Contract for AuditStore.list. Every test isolates its entries by a unique actor or action. */
export function runAuditListContract(makeStore: () => Promise<Store> | Store): void {
  describe("audit list", () => {
    const newUser = (store: Store) =>
      store.users.create({
        email: `${unique("audit-list")}@example.test`,
        passwordHash: "not-a-real-hash",
        displayName: "Audit Test",
      });

    async function addEntries(store: Store, actorId: string, actions: string[]): Promise<void> {
      for (const action of actions) {
        await store.audit.append({ actorId, action, entityType: "Test" });
        await tick();
      }
    }

    it("lists newest first", async () => {
      const store = await makeStore();
      const u = await newUser(store);
      const actions = [unique("n1"), unique("n2"), unique("n3")];
      await addEntries(store, u.id, actions);
      const list = await store.audit.list({ actorId: u.id, limit: 10, offset: 0 });
      expect(list.map((e) => e.action)).toEqual([...actions].reverse());
    });

    it("filters by action, matching exactly (letter case counts)", async () => {
      const store = await makeStore();
      const u = await newUser(store);
      const x = unique("x");
      await addEntries(store, u.id, [x, unique("other"), x]);
      const hit = await store.audit.list({ action: x, limit: 10, offset: 0 });
      expect(hit).toHaveLength(2);
      expect(hit.every((e) => e.action === x && e.actorId === u.id)).toBe(true);
      expect(await store.audit.list({ action: x.toUpperCase(), limit: 10, offset: 0 })).toEqual([]);
    });

    it("includes entries with no actor", async () => {
      const store = await makeStore();
      const action = unique("system");
      await store.audit.append({ action, entityType: "System" });
      const list = await store.audit.list({ action, limit: 10, offset: 0 });
      expect(list).toHaveLength(1);
      expect(list[0]?.actorId).toBeNull();
    });

    it("pages with limit and offset", async () => {
      const store = await makeStore();
      const u = await newUser(store);
      const a = [unique("p1"), unique("p2"), unique("p3"), unique("p4"), unique("p5")];
      await addEntries(store, u.id, a);
      const page = async (limit: number, offset: number) =>
        (await store.audit.list({ actorId: u.id, limit, offset })).map((e) => e.action);
      expect(await page(2, 0)).toEqual([a[4], a[3]]);
      expect(await page(2, 2)).toEqual([a[2], a[1]]);
      expect(await page(2, 4)).toEqual([a[0]]);
      expect(await page(2, 5)).toEqual([]);
    });

    it("combines the actor and action filters", async () => {
      const store = await makeStore();
      const a = await newUser(store);
      const b = await newUser(store);
      const x = unique("x");
      await addEntries(store, a.id, [x, unique("y")]);
      await addEntries(store, b.id, [x]);
      const list = await store.audit.list({ actorId: a.id, action: x, limit: 10, offset: 0 });
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ actorId: a.id, action: x });
    });

    it("returns an empty list for an unknown actor", async () => {
      const store = await makeStore();
      expect(await store.audit.list({ actorId: "no-such-user", limit: 10, offset: 0 })).toEqual([]);
    });

    it("returns copies: changing a returned entry does not change stored data", async () => {
      const store = await makeStore();
      const u = await newUser(store);
      const action = unique("copy");
      await addEntries(store, u.id, [action]);
      const first = await store.audit.list({ actorId: u.id, limit: 10, offset: 0 });
      const entry = first[0];
      if (!entry) throw new Error("entry not found");
      const time = entry.createdAt.getTime();
      entry.action = "changed";
      entry.createdAt.setFullYear(2000);
      const again = await store.audit.list({ actorId: u.id, limit: 10, offset: 0 });
      expect(again[0]?.action).toBe(action);
      expect(again[0]?.createdAt.getTime()).toBe(time);
    });
  });
}