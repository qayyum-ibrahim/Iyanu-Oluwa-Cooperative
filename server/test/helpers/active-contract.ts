import { describe, expect, it } from "vitest";
import type { Store } from "../../src/store.js";

let counter = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;

/** Active-state rules every adapter must follow. Called from runStoreContract. */
export function runActiveContract(makeStore: () => Promise<Store> | Store): void {
  describe("user active state", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
        permissions: ["dashboard"],
      });

    it("starts active", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ac-new");
      expect(u.isActive).toBe(true);
    });

    it("setActive(false) returns true and shows in findById, findByEmail and list", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ac-off");
      expect(await store.users.setActive(u.id, false)).toBe(true);
      expect((await store.users.findById(u.id))?.isActive).toBe(false);
      expect((await store.users.findByEmail(u.email))?.isActive).toBe(false);
      expect((await store.users.list()).find((x) => x.id === u.id)?.isActive).toBe(false);
    });

    it("setActive(true) makes the user active again", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ac-on");
      await store.users.setActive(u.id, false);
      expect(await store.users.setActive(u.id, true)).toBe(true);
      expect((await store.users.findById(u.id))?.isActive).toBe(true);
    });

    it("returns false for an unknown user", async () => {
      const store = await makeStore();
      expect(await store.users.setActive("no-such-user", false)).toBe(false);
    });

    it("changes only isActive, and only for that user", async () => {
      const store = await makeStore();
      const a = await newUser(store, "ac-only-a");
      const b = await newUser(store, "ac-only-b");
      await store.users.setActive(a.id, false);
      const after = await store.users.findById(a.id);
      expect(after).toMatchObject({
        email: a.email,
        role: "STAFF",
        displayName: "Test User",
        permissions: ["dashboard"],
      });
      expect((await store.users.findById(b.id))?.isActive).toBe(true);
    });
  });
}