import { describe, expect, it } from "vitest";
import { DuplicateEmailError, type Store } from "../../src/store.js";

let counter = 0;
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
const uniqueHash = () => `tx-hash-${Date.now()}-${++counter}`;

// Real databases are slower than memory, and the machine may be slow too.
const SLOW = { timeout: 60_000 };

const T0 = new Date("2026-10-15T10:00:00.000Z");
const EXPIRY = new Date("2026-10-22T10:00:00.000Z");

class Boom extends Error {
  constructor() {
    super("boom");
    this.name = "Boom";
  }
}

/** Transactions must behave the same on every adapter: all saved, or all undone. */
export function runTransactionContract(makeStore: () => Promise<Store> | Store): void {
  describe("transactions", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    const newMember = (store: Store, createdById: string, fullName = "Test Member") =>
      store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });

    it("returns the value of the function and keeps its writes", SLOW, async () => {
      const store = await makeStore();
      const email = uniqueEmail("tx-commit");
      const id = await store.transaction(async (tx) => {
        const u = await tx.users.create({ email, passwordHash: "x", displayName: "A" });
        return u.id;
      });
      expect((await store.users.findByEmail(email))?.id).toBe(id);
    });

    it("lets the function read its own writes", SLOW, async () => {
      const store = await makeStore();
      const actor = await newUser(store, "tx-own");
      const found = await store.transaction(async (tx) => {
        const m = await newMember(tx, actor.id);
        return tx.members.findById(m.id);
      });
      expect(found?.createdById).toBe(actor.id);
    });

    it("undoes a create and throws the same error again", SLOW, async () => {
      const store = await makeStore();
      const email = uniqueEmail("tx-undo");
      let id = "";
      await expect(
        store.transaction(async (tx) => {
          const u = await tx.users.create({ email, passwordHash: "x", displayName: "A" });
          id = u.id;
          throw new Boom();
        }),
      ).rejects.toBeInstanceOf(Boom);
      expect(id.length).toBeGreaterThan(0);
      expect(await store.users.findByEmail(email)).toBeNull();
      expect(await store.users.findById(id)).toBeNull();
    });

    it("undoes a member, a payment and an audit entry together", SLOW, async () => {
      const store = await makeStore();
      const actor = await newUser(store, "tx-many");
      let memberId = "";
      let paymentId = "";
      await expect(
        store.transaction(async (tx) => {
          const m = await newMember(tx, actor.id);
          memberId = m.id;
          const p = await tx.payments.create({
            memberId: m.id,
            method: "CASH",
            paidOn: "2026-10-20",
            total: 1000n,
            lines: [{ category: "Shares", amount: 1000n }],
            createdById: actor.id,
          });
          paymentId = p.id;
          await tx.audit.append({ actorId: actor.id, action: "payment.created", entityType: "Payment" });
          throw new Boom();
        }),
      ).rejects.toBeInstanceOf(Boom);
      expect(await store.members.findById(memberId)).toBeNull();
      expect(await store.payments.findById(paymentId)).toBeNull();
      expect(await store.audit.listByActor(actor.id)).toEqual([]);
    });

    it("undoes changes to existing data: status, permissions, tokens, lockout", SLOW, async () => {
      const store = await makeStore();
      const user = await newUser(store, "tx-update");
      const member = await newMember(store, user.id);
      const token = await store.refreshTokens.create({
        userId: user.id,
        familyId: `family-${uniqueHash()}`,
        tokenHash: uniqueHash(),
        expiresAt: EXPIRY,
      });
      await expect(
        store.transaction(async (tx) => {
          await tx.users.setActive(user.id, false);
          await tx.users.setPermissions(user.id, ["members.view"]);
          await tx.members.setStatus(member.id, "INACTIVE");
          await tx.refreshTokens.consume(token.id, T0);
          await tx.refreshTokens.revokeAllForUser(user.id, T0);
          await tx.users.recordFailedLogin(user.id, T0, 5, 900);
          throw new Boom();
        }),
      ).rejects.toBeInstanceOf(Boom);
      expect((await store.users.findById(user.id))?.isActive).toBe(true);
      expect((await store.users.findById(user.id))?.permissions).toEqual([]);
      expect((await store.members.findById(member.id))?.status).toBe("ACTIVE");
      const after = await store.refreshTokens.findByHash(token.tokenHash);
      expect(after?.usedAt).toBeNull();
      expect(after?.revokedAt).toBeNull();
      expect((await store.users.getLockout(user.id))?.failedCount).toBe(0);
    });

    it("passes a store error through and undoes the earlier writes", SLOW, async () => {
      const store = await makeStore();
      const existing = await newUser(store, "tx-dup-existing");
      const first = uniqueEmail("tx-dup-first");
      await expect(
        store.transaction(async (tx) => {
          await tx.users.create({ email: first, passwordHash: "x", displayName: "A" });
          await tx.users.create({ email: existing.email, passwordHash: "x", displayName: "B" });
        }),
      ).rejects.toBeInstanceOf(DuplicateEmailError);
      expect(await store.users.findByEmail(first)).toBeNull();
    });

    it("joins a nested transaction to the outer one and saves both", SLOW, async () => {
      const store = await makeStore();
      const a = uniqueEmail("tx-nest-a");
      const b = uniqueEmail("tx-nest-b");
      await store.transaction(async (tx) => {
        await tx.users.create({ email: a, passwordHash: "x", displayName: "A" });
        await tx.transaction(async (inner) => {
          await inner.users.create({ email: b, passwordHash: "x", displayName: "B" });
        });
      });
      expect(await store.users.findByEmail(a)).not.toBeNull();
      expect(await store.users.findByEmail(b)).not.toBeNull();
    });

    it("undoes the outer writes when a nested transaction throws", SLOW, async () => {
      const store = await makeStore();
      const c = uniqueEmail("tx-nest-c");
      const d = uniqueEmail("tx-nest-d");
      await expect(
        store.transaction(async (tx) => {
          await tx.users.create({ email: c, passwordHash: "x", displayName: "C" });
          await tx.transaction(async (inner) => {
            await inner.users.create({ email: d, passwordHash: "x", displayName: "D" });
            throw new Boom();
          });
        }),
      ).rejects.toBeInstanceOf(Boom);
      expect(await store.users.findByEmail(c)).toBeNull();
      expect(await store.users.findByEmail(d)).toBeNull();
    });

    it("does not undo a successful transaction when another one fails at the same time", SLOW, async () => {
      const store = await makeStore();
      const kept = uniqueEmail("tx-par-kept");
      const lost = uniqueEmail("tx-par-lost");
      const results = await Promise.allSettled([
        store.transaction(async (tx) => {
          await tx.users.create({ email: kept, passwordHash: "x", displayName: "K" });
        }),
        store.transaction(async (tx) => {
          await tx.users.create({ email: lost, passwordHash: "x", displayName: "L" });
          throw new Boom();
        }),
      ]);
      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
      expect(await store.users.findByEmail(kept)).not.toBeNull();
      expect(await store.users.findByEmail(lost)).toBeNull();
    });

    it("gives two parallel transactions different Membership IDs", SLOW, async () => {
      const store = await makeStore();
      const actor = await newUser(store, "tx-par-members");
      const [a, b] = await Promise.all([
        store.transaction((tx) => newMember(tx, actor.id, "Parallel A")),
        store.transaction((tx) => newMember(tx, actor.id, "Parallel B")),
      ]);
      expect(a.membershipId).not.toBe(b.membershipId);
    });
  });
}