import { describe, expect, it } from "vitest";
import {
  DuplicatePayOffKeyError,
  UnknownActorError,
  UnknownMemberError,
  type NewPayOff,
  type Store,
} from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
const uniqueKey = () => `payoff-contract-key-${Date.now()}-${++counter}`;
// Pay-offs with equal times have no promised order, so tests wait a little between them.
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** Rules for the pay-offs store (step 6.3), the same for every adapter. */
export function runPayOffsContract(makeStore: () => Promise<Store> | Store): void {
  describe("pay-offs", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    // Fictional details only (D-08).
    const newMember = (store: Store, createdById: string) =>
      store.members.create({
        fullName: "Pay-off Member",
        phone: "",
        address: "",
        occupation: "",
        createdById,
      });

    // The DR-05 worked example: ₦12,000 + ₦8,000 + ₦5,000 = ₦25,000 (2,500,000 kobo).
    const payOff = (memberId: string, createdById: string, over: Partial<NewPayOff> = {}): NewPayOff => ({
      memberId,
      createdById,
      method: "CASH",
      total: 2_500_000n,
      lines: [
        { category: "Shares", amount: 1_200_000n },
        { category: "Savings", amount: 800_000n },
        { category: "Special Savings", amount: 500_000n },
      ],
      ...over,
    });

    it("saves a pay-off with an id, the member, the method, the total, the lines in order and the creator", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-create");
      const m = await newMember(store, u.id);
      const p = await store.payOffs.create(payOff(m.id, u.id));
      expect(p.id.length).toBeGreaterThan(0);
      expect(p).toMatchObject({
        memberId: m.id,
        method: "CASH",
        total: 2_500_000n,
        idempotencyKey: null,
        requestHash: null,
        createdById: u.id,
      });
      expect(p.lines.map((l) => [l.category, l.amount])).toEqual([
        ["Shares", 1_200_000n],
        ["Savings", 800_000n],
        ["Special Savings", 500_000n],
      ]);
      expect(new Set(p.lines.map((l) => l.id)).size).toBe(3);
      expect(p.createdAt).toBeInstanceOf(Date);
    });

    it("keeps the method and amounts above the largest safe integer exactly", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-exact");
      const m = await newMember(store, u.id);
      const huge = 9_007_199_254_740_993n; // 2^53 + 1: a float would round it
      const p = await store.payOffs.create(
        payOff(m.id, u.id, {
          method: "BANK_TRANSFER",
          total: huge + 1n,
          lines: [
            { category: "Building Funds", amount: huge },
            { category: "Special Deposit", amount: 1n },
          ],
        }),
      );
      const found = await store.payOffs.findById(p.id);
      expect(found).toEqual(p);
      expect(found).toMatchObject({ method: "BANK_TRANSFER", total: huge + 1n });
      expect(found?.lines.map((l) => [l.category, l.amount])).toEqual([
        ["Building Funds", huge],
        ["Special Deposit", 1n],
      ]);
    });

    it("saves the values as given: checking them is the logic code's job", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-as-given");
      const m = await newMember(store, u.id);
      const p = await store.payOffs.create(payOff(m.id, u.id, { total: 7n, lines: [] }));
      expect(await store.payOffs.findById(p.id)).toMatchObject({ total: 7n, lines: [] });
    });

    it("returns null for an unknown id", async () => {
      const store = await makeStore();
      expect(await store.payOffs.findById("no-such-id")).toBeNull();
    });

    it("rejects an unknown member with UnknownMemberError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-nomember");
      await expect(store.payOffs.create(payOff("no-such-member", u.id))).rejects.toBeInstanceOf(
        UnknownMemberError,
      );
      expect(await store.payOffs.listByMember("no-such-member")).toEqual([]);
    });

    it("rejects an unknown creator with UnknownActorError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-noactor");
      const m = await newMember(store, u.id);
      await expect(store.payOffs.create(payOff(m.id, "no-such-user"))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
      expect(await store.payOffs.listByMember(m.id)).toEqual([]);
    });

    it("checks the member before the creator", async () => {
      const store = await makeStore();
      await expect(
        store.payOffs.create(payOff("no-such-member", "no-such-user")),
      ).rejects.toBeInstanceOf(UnknownMemberError);
    });

    it("lists only the pay-offs of the asked member, oldest first, each with its own lines", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-list");
      const m1 = await newMember(store, u.id);
      const m2 = await newMember(store, u.id);
      const m3 = await newMember(store, u.id);
      const p1 = await store.payOffs.create(
        payOff(m1.id, u.id, { total: 100n, lines: [{ category: "Shares", amount: 100n }] }),
      );
      await pause();
      const p2 = await store.payOffs.create(
        payOff(m2.id, u.id, { total: 200n, lines: [{ category: "Savings", amount: 200n }] }),
      );
      await pause();
      const p3 = await store.payOffs.create(
        payOff(m1.id, u.id, { total: 300n, lines: [{ category: "Special Deposit", amount: 300n }] }),
      );
      expect(await store.payOffs.listByMember(m1.id)).toEqual([p1, p3]);
      expect(await store.payOffs.listByMember(m2.id)).toEqual([p2]);
      expect(await store.payOffs.listByMember(m3.id)).toEqual([]);
    });

    it("does not let a caller change stored data through input or returned records", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-copy");
      const m = await newMember(store, u.id);
      const input = payOff(m.id, u.id);
      const p = await store.payOffs.create(input);
      const time = p.createdAt.getTime();
      // Change what we passed in.
      input.total = 1n;
      const firstInput = input.lines[0];
      if (firstInput === undefined) throw new Error("no line");
      firstInput.amount = 1n;
      input.lines.push({ category: "Shares", amount: 5n });
      // Change what create, findById and listByMember returned.
      const found = await store.payOffs.findById(p.id);
      const [listed] = await store.payOffs.listByMember(m.id);
      for (const r of [p, found, listed]) {
        if (r === undefined || r === null) throw new Error("pay-off not found");
        r.total = 1n;
        r.memberId = "other";
        const line = r.lines[0];
        if (line === undefined) throw new Error("no line");
        line.amount = 1n;
        line.category = "Changed";
        r.lines.pop();
        r.createdAt.setFullYear(2000);
      }
      const again = await store.payOffs.findById(p.id);
      expect(again).toMatchObject({ total: 2_500_000n, memberId: m.id });
      expect(again?.lines.map((l) => [l.category, l.amount])).toEqual([
        ["Shares", 1_200_000n],
        ["Savings", 800_000n],
        ["Special Savings", 500_000n],
      ]);
      expect(again?.createdAt.getTime()).toBe(time);
    });

    it("gives parallel creates different ids and saves every one", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-parallel");
      const m = await newMember(store, u.id);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.payOffs.create(payOff(m.id, u.id))),
      );
      expect(new Set(results.map((p) => p.id)).size).toBe(5);
      expect(await store.payOffs.listByMember(m.id)).toHaveLength(5);
    });

    it("undoes a pay-off and its lines when the transaction it was made in throws", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-tx");
      const m = await newMember(store, u.id);
      let madeId = "";
      await expect(
        store.transaction(async (tx) => {
          madeId = (await tx.payOffs.create(payOff(m.id, u.id))).id;
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.payOffs.listByMember(m.id)).toEqual([]);
      expect(await store.payOffs.findById(madeId)).toBeNull();
    });

    it("keeps the pay-offs saved before a transaction that throws", async () => {
      const store = await makeStore();
      const u = await newUser(store, "po-tx-keep");
      const m = await newMember(store, u.id);
      const before = await store.payOffs.create(payOff(m.id, u.id));
      await expect(
        store.transaction(async (tx) => {
          await tx.payOffs.create(payOff(m.id, u.id, { total: 1n, lines: [{ category: "Shares", amount: 1n }] }));
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.payOffs.listByMember(m.id)).toEqual([before]);
    });

    // Idempotency keys, as loans-contract.ts.
    it("saves the key and the hash and reads them back by id and by key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pok-save");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      const p = await store.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key, requestHash: "hash-one" }));
      expect(p.idempotencyKey).toBe(key);
      expect(p.requestHash).toBe("hash-one");
      expect(await store.payOffs.findById(p.id)).toEqual(p);
      expect(await store.payOffs.findByKey(u.id, key)).toEqual(p);
    });

    it("finds nothing for an unknown key or for another user's key", async () => {
      const store = await makeStore();
      const a = await newUser(store, "pok-find-a");
      const b = await newUser(store, "pok-find-b");
      const m = await newMember(store, a.id);
      const key = uniqueKey();
      await store.payOffs.create(payOff(m.id, a.id, { idempotencyKey: key, requestHash: "h" }));
      expect(await store.payOffs.findByKey(a.id, uniqueKey())).toBeNull();
      expect(await store.payOffs.findByKey(b.id, key)).toBeNull();
    });

    it("refuses a second pay-off with the same key for the same user, and saves only the first", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pok-dup");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      await store.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
      await expect(
        store.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key, requestHash: "other" })),
      ).rejects.toBeInstanceOf(DuplicatePayOffKeyError);
      expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    });

    it("checks the member and the creator before the key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pok-order");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      await store.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key }));
      await expect(
        store.payOffs.create(payOff("no-such-member", u.id, { idempotencyKey: key })),
      ).rejects.toBeInstanceOf(UnknownMemberError);
      await expect(
        store.payOffs.create(payOff(m.id, "no-such-user", { idempotencyKey: key })),
      ).rejects.toBeInstanceOf(UnknownActorError);
    });

    it("lets two users use the same key", async () => {
      const store = await makeStore();
      const a = await newUser(store, "pok-two-a");
      const b = await newUser(store, "pok-two-b");
      const m = await newMember(store, a.id);
      const key = uniqueKey();
      const pa = await store.payOffs.create(payOff(m.id, a.id, { idempotencyKey: key, requestHash: "h" }));
      const pb = await store.payOffs.create(payOff(m.id, b.id, { idempotencyKey: key, requestHash: "h" }));
      expect((await store.payOffs.findByKey(a.id, key))?.id).toBe(pa.id);
      expect((await store.payOffs.findByKey(b.id, key))?.id).toBe(pb.id);
    });

    it("returns a copy from findByKey: changing it does not change the stored pay-off", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pok-copy");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      const saved = await store.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
      const found = await store.payOffs.findByKey(u.id, key);
      if (found === null) throw new Error("pay-off not found");
      found.requestHash = "changed";
      found.total = 1n;
      found.lines.pop();
      found.createdAt.setTime(0);
      expect(await store.payOffs.findByKey(u.id, key)).toEqual(saved);
    });

    it("saves pay-offs without a key, as many as wanted, with null key and hash", async () => {
      const store = await makeStore();
      const u = await newUser(store, "pok-none");
      const m = await newMember(store, u.id);
      const p1 = await store.payOffs.create(payOff(m.id, u.id));
      const p2 = await store.payOffs.create(payOff(m.id, u.id));
      expect(p1.idempotencyKey).toBeNull();
      expect(p1.requestHash).toBeNull();
      expect(p2.id).not.toBe(p1.id);
      expect(await store.payOffs.listByMember(m.id)).toHaveLength(2);
    });

    it("undoes earlier writes in a transaction when the key is a duplicate", { timeout: 60_000 }, async () => {
      const store = await makeStore();
      const u = await newUser(store, "pok-tx");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      await store.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
      const other = uniqueKey();
      await expect(
        store.transaction(async (tx) => {
          await tx.payOffs.create(payOff(m.id, u.id, { idempotencyKey: other, requestHash: "h" }));
          await tx.payOffs.create(payOff(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
        }),
      ).rejects.toBeInstanceOf(DuplicatePayOffKeyError);
      expect(await store.payOffs.findByKey(u.id, other)).toBeNull();
      expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    });
  });
}
