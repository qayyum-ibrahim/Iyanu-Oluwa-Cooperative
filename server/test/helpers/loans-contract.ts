import { describe, expect, it } from "vitest";
import {
  UnknownActorError,
  UnknownMemberError,
  type NewLoan,
  type Store,
} from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
// Loans with equal times have no promised order, so tests wait a little between them.
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** Rules for the loans store, the same for every adapter. */
export function runLoansContract(makeStore: () => Promise<Store> | Store): void {
  describe("loans", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    // Fictional details only (D-08).
    const newMember = (store: Store, createdById: string) =>
      store.members.create({
        fullName: "Loan Member",
        phone: "",
        address: "",
        occupation: "",
        createdById,
      });

    // 30,000,000 kobo is ₦300,000 (the DR-08 example).
    const loan = (memberId: string, createdById: string, over: Partial<NewLoan> = {}): NewLoan => ({
      memberId,
      createdById,
      principal: 30_000_000n,
      ...over,
    });

    it("saves a loan with an id, the member, the creator, a date and empty texts", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-create");
      const m = await newMember(store, u.id);
      const l = await store.loans.create(loan(m.id, u.id));
      expect(l.id.length).toBeGreaterThan(0);
      expect(l).toMatchObject({
        memberId: m.id,
        principal: 30_000_000n,
        interestNote: "",
        notes: "",
        createdById: u.id,
      });
      expect(l.createdAt).toBeInstanceOf(Date);
    });

    it("keeps the texts and an amount above the largest safe integer exactly", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-exact");
      const m = await newMember(store, u.id);
      const huge = 9_007_199_254_740_993n; // 2^53 + 1: a float would round it
      const l = await store.loans.create(
        loan(m.id, u.id, { principal: huge, interestNote: "5% flat, for information", notes: "School fees" }),
      );
      const found = await store.loans.findById(l.id);
      expect(found).toEqual(l);
      expect(found).toMatchObject({
        principal: huge,
        interestNote: "5% flat, for information",
        notes: "School fees",
      });
    });

    it("returns null for an unknown id", async () => {
      const store = await makeStore();
      expect(await store.loans.findById("no-such-id")).toBeNull();
    });

    it("rejects an unknown member with UnknownMemberError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-nomember");
      await expect(store.loans.create(loan("no-such-member", u.id))).rejects.toBeInstanceOf(
        UnknownMemberError,
      );
      expect(await store.loans.listByMember("no-such-member")).toEqual([]);
    });

    it("rejects an unknown creator with UnknownActorError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-noactor");
      const m = await newMember(store, u.id);
      await expect(store.loans.create(loan(m.id, "no-such-user"))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
      expect(await store.loans.listByMember(m.id)).toEqual([]);
    });

    it("checks the member before the creator", async () => {
      const store = await makeStore();
      await expect(store.loans.create(loan("no-such-member", "no-such-user"))).rejects.toBeInstanceOf(
        UnknownMemberError,
      );
    });

    it("lists only the loans of the asked member, oldest first, and an empty list for none", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-list");
      const m1 = await newMember(store, u.id);
      const m2 = await newMember(store, u.id);
      const m3 = await newMember(store, u.id);
      // The store does not enforce one active loan (logic code, A-156), so a member may have two here.
      const l1 = await store.loans.create(loan(m1.id, u.id));
      await pause();
      const l2 = await store.loans.create(loan(m2.id, u.id));
      await pause();
      const l3 = await store.loans.create(loan(m1.id, u.id));
      expect((await store.loans.listByMember(m1.id)).map((l) => l.id)).toEqual([l1.id, l3.id]);
      expect((await store.loans.listByMember(m2.id)).map((l) => l.id)).toEqual([l2.id]);
      expect(await store.loans.listByMember(m3.id)).toEqual([]);
    });

    it("does not let a caller change stored data through input or returned records", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-copy");
      const m = await newMember(store, u.id);
      const input = loan(m.id, u.id, { notes: "Rent" });
      const l = await store.loans.create(input);
      const time = l.createdAt.getTime();
      // Change what we passed in.
      input.principal = 1n;
      input.notes = "Changed";
      // Change what create, findById and listByMember returned.
      const found = await store.loans.findById(l.id);
      const [listed] = await store.loans.listByMember(m.id);
      for (const r of [l, found, listed]) {
        if (r === undefined || r === null) throw new Error("loan not found");
        r.principal = 1n;
        r.memberId = "other";
        r.notes = "Changed";
        r.createdAt.setFullYear(2000);
      }
      const again = await store.loans.findById(l.id);
      expect(again).toMatchObject({ principal: 30_000_000n, memberId: m.id, notes: "Rent" });
      expect(again?.createdAt.getTime()).toBe(time);
    });

    it("gives parallel creates different ids and saves every one", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-parallel");
      const m = await newMember(store, u.id);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.loans.create(loan(m.id, u.id))),
      );
      expect(new Set(results.map((l) => l.id)).size).toBe(5);
      expect(await store.loans.listByMember(m.id)).toHaveLength(5);
    });

    it("undoes a loan when the transaction it was made in throws", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-tx");
      const m = await newMember(store, u.id);
      await expect(
        store.transaction(async (tx) => {
          await tx.loans.create(loan(m.id, u.id));
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.loans.listByMember(m.id)).toEqual([]);
    });

    it("keeps the loans saved before a transaction that throws", async () => {
      const store = await makeStore();
      const u = await newUser(store, "l-tx-keep");
      const m = await newMember(store, u.id);
      const before = await store.loans.create(loan(m.id, u.id, { notes: "Before" }));
      await expect(
        store.transaction(async (tx) => {
          await tx.loans.create(loan(m.id, u.id, { notes: "Inside" }));
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.loans.listByMember(m.id)).toEqual([before]);
    });
  });
}
