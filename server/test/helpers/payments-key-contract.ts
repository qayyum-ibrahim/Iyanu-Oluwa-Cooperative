import { describe, expect, it } from "vitest";
import { DuplicateIdempotencyKeyError, type NewPayment, type Store } from "../../src/store.js";

let counter = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
const uniqueKey = () => `contract-key-${Date.now()}-${++counter}`;

const SLOW = { timeout: 60_000 };

/** Rules for payment idempotency keys in the payments store, the same for every adapter. */
export function runPaymentsKeyContract(makeStore: () => Promise<Store> | Store): void {
  describe("payment idempotency keys", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    // Fictional details only (D-08).
    const newMember = (store: Store, createdById: string) =>
      store.members.create({
        fullName: "Key Member",
        phone: "",
        address: "",
        occupation: "",
        createdById,
      });

    const payment = (
      memberId: string,
      createdById: string,
      over: Partial<NewPayment> = {},
    ): NewPayment => ({
      memberId,
      createdById,
      method: "CASH",
      total: 1000n,
      lines: [{ category: "Shares", amount: 1000n }],
      ...over,
    });

    it("saves the key and the hash and reads them back by id and by key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "k-save");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      const p = await store.payments.create(
        payment(m.id, u.id, { idempotencyKey: key, requestHash: "hash-one" }),
      );
      expect(p.idempotencyKey).toBe(key);
      expect(p.requestHash).toBe("hash-one");
      expect(await store.payments.findById(p.id)).toEqual(p);
      expect(await store.payments.findByKey(u.id, key)).toEqual(p);
    });

    it("finds nothing for an unknown key or for another user's key", async () => {
      const store = await makeStore();
      const a = await newUser(store, "k-find-a");
      const b = await newUser(store, "k-find-b");
      const m = await newMember(store, a.id);
      const key = uniqueKey();
      await store.payments.create(payment(m.id, a.id, { idempotencyKey: key, requestHash: "h" }));
      expect(await store.payments.findByKey(a.id, uniqueKey())).toBeNull();
      expect(await store.payments.findByKey(b.id, key)).toBeNull();
    });

    it("refuses a second payment with the same key for the same user, and saves only the first", async () => {
      const store = await makeStore();
      const u = await newUser(store, "k-dup");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      await store.payments.create(payment(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
      await expect(
        store.payments.create(payment(m.id, u.id, { idempotencyKey: key, requestHash: "h" })),
      ).rejects.toBeInstanceOf(DuplicateIdempotencyKeyError);
      expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    });

    it("lets two users use the same key", async () => {
      const store = await makeStore();
      const a = await newUser(store, "k-two-a");
      const b = await newUser(store, "k-two-b");
      const ma = await newMember(store, a.id);
      const mb = await newMember(store, b.id);
      const key = uniqueKey();
      const pa = await store.payments.create(payment(ma.id, a.id, { idempotencyKey: key, requestHash: "h" }));
      const pb = await store.payments.create(payment(mb.id, b.id, { idempotencyKey: key, requestHash: "h" }));
      expect((await store.payments.findByKey(a.id, key))?.id).toBe(pa.id);
      expect((await store.payments.findByKey(b.id, key))?.id).toBe(pb.id);
    });

    it("returns a copy from findByKey: changing it does not change the stored payment", async () => {
      const store = await makeStore();
      const u = await newUser(store, "k-copy");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      const saved = await store.payments.create(
        payment(m.id, u.id, { idempotencyKey: key, requestHash: "h" }),
      );
      const found = (await store.payments.findByKey(u.id, key)) as {
        requestHash: string | null;
        total: bigint;
        lines: { id: string; category: string; amount: bigint }[];
        createdAt: Date;
      } | null;
      if (found === null) throw new Error("payment not found");
      found.requestHash = "changed";
      found.total = 1n;
      found.lines.splice(0, found.lines.length);
      found.createdAt.setTime(0);
      expect(await store.payments.findByKey(u.id, key)).toEqual(saved);
    });

    it("saves payments without a key, as many as wanted, with null key and hash", async () => {
      const store = await makeStore();
      const u = await newUser(store, "k-none");
      const m = await newMember(store, u.id);
      const p1 = await store.payments.create(payment(m.id, u.id));
      const p2 = await store.payments.create(payment(m.id, u.id));
      expect(p1.idempotencyKey).toBeNull();
      expect(p1.requestHash).toBeNull();
      expect(p2.id).not.toBe(p1.id);
      expect(await store.payments.listByMember(m.id)).toHaveLength(2);
    });

    it("undoes earlier writes in a transaction when the key is a duplicate", SLOW, async () => {
      const store = await makeStore();
      const u = await newUser(store, "k-tx");
      const m = await newMember(store, u.id);
      const key = uniqueKey();
      await store.payments.create(payment(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
      const other = uniqueKey();
      await expect(
        store.transaction(async (tx) => {
          await tx.payments.create(payment(m.id, u.id, { idempotencyKey: other, requestHash: "h" }));
          await tx.payments.create(payment(m.id, u.id, { idempotencyKey: key, requestHash: "h" }));
        }),
      ).rejects.toBeInstanceOf(DuplicateIdempotencyKeyError);
      expect(await store.payments.findByKey(u.id, other)).toBeNull();
      expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    });
  });
}