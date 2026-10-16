import { describe, expect, it } from "vitest";
import type { Store } from "../../src/store.js";

let counter = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;

/** Stored-permission rules every adapter must follow. Called from runStoreContract. */
export function runPermissionsContract(makeStore: () => Promise<Store> | Store): void {
  describe("stored staff permissions", () => {
    const newUser = (store: Store, tag: string, permissions?: readonly string[]) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
        ...(permissions ? { permissions } : {}),
      });

    it("starts with an empty permission list", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pm-new");
      expect(u.permissions).toEqual([]);
      expect((await store.users.findById(u.id))?.permissions).toEqual([]);
    });

    it("saves the list given at creation, as given and in order", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pm-create", ["payments.create", "dashboard"]);
      expect(u.permissions).toEqual(["payments.create", "dashboard"]);
      expect((await store.users.findById(u.id))?.permissions).toEqual([
        "payments.create",
        "dashboard",
      ]);
    });

    it("also returns the list from findByEmail", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pm-email", ["members.view"]);
      expect((await store.users.findByEmail(u.email))?.permissions).toEqual(["members.view"]);
    });

    it("setPermissions replaces the whole list and returns true", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pm-set", ["dashboard"]);
      expect(await store.users.setPermissions(u.id, ["members.view", "reports.view"])).toBe(true);
      expect((await store.users.findById(u.id))?.permissions).toEqual([
        "members.view",
        "reports.view",
      ]);
    });

    it("setPermissions with an empty list clears the permissions", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pm-clear", ["dashboard", "members.view"]);
      expect(await store.users.setPermissions(u.id, [])).toBe(true);
      expect((await store.users.findById(u.id))?.permissions).toEqual([]);
    });

    it("setPermissions returns false for an unknown user", async () => {
      const store = await makeStore();
      expect(await store.users.setPermissions("no-such-user", ["dashboard"])).toBe(false);
    });

    it("lists users with their permissions", async () => {
      const store = await makeStore();
      const a = await newUser(store, "pm-list-a", ["dashboard"]);
      const b = await newUser(store, "pm-list-b");
      const all = await store.users.list();
      expect(all.map((u) => u.id)).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(all.find((u) => u.id === a.id)?.permissions).toEqual(["dashboard"]);
      expect(all.find((u) => u.id === b.id)?.permissions).toEqual([]);
    });

    it("does not let a caller change stored data through a returned list", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pm-copy", ["dashboard"]);
      u.permissions.push("changed");
      const read = await store.users.findById(u.id);
      if (!read) throw new Error("user not found");
      read.permissions.push("changed-too");
      const [fromList] = (await store.users.list()).filter((x) => x.id === u.id);
      fromList?.permissions.push("and-this");
      expect((await store.users.findById(u.id))?.permissions).toEqual(["dashboard"]);
    });

    it("does not keep a reference to the list that was passed in", async () => {
      const store = await makeStore();
      const given = ["dashboard"];
      const u = await newUser(store, "pm-alias", given);
      given.push("changed");
      expect((await store.users.findById(u.id))?.permissions).toEqual(["dashboard"]);
      const next = ["members.view"];
      await store.users.setPermissions(u.id, next);
      next.push("changed");
      expect((await store.users.findById(u.id))?.permissions).toEqual(["members.view"]);
    });
  });
}
