import { describe, expect, it } from "vitest";
import {
  UnknownActorError,
  UnknownLoanError,
  UnknownMemberError,
  type NewPayment,
  type Store,
} from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
// Payments with equal times have no promised order (A-74), so tests wait a little between them.
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** Rules for the payments store, the same for every adapter. */
export function runPaymentsContract(makeStore: () => Promise<Store> | Store): void {
  describe("payments", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    // Fictional details only (D-08).
    const newMember = (store: Store, createdById: string) =>
      store.members.create({
        fullName: "Pay Member",
        phone: "",
        address: "",
        occupation: "",
        createdById,
      });

    // 2,000,000 kobo is ₦20,000 = ₦5,000 + ₦10,000 + ₦5,000.
    const payment = (
      memberId: string,
      createdById: string,
      over: Partial<NewPayment> = {},
    ): NewPayment => ({
      memberId,
      createdById,
      method: "CASH",
      paidOn: "2026-10-20",
      total: 2_000_000n,
      lines: [
        { category: "Shares", amount: 500_000n },
        { category: "Savings", amount: 1_000_000n },
        { category: "Development Levy", amount: 500_000n },
      ],
      ...over,
    });

    it("saves a payment with its lines in order, with ids, the creator and a date", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-create");
      const m = await newMember(store, u.id);
      const p = await store.payments.create(payment(m.id, u.id));
      expect(p.id.length).toBeGreaterThan(0);
      expect(p).toMatchObject({ memberId: m.id, createdById: u.id, method: "CASH", total: 2_000_000n });
      expect(p.createdAt).toBeInstanceOf(Date);
      expect(p.lines.map((l) => [l.category, l.amount])).toEqual([
        ["Shares", 500_000n],
        ["Savings", 1_000_000n],
        ["Development Levy", 500_000n],
      ]);
      for (const l of p.lines) expect(l.id.length).toBeGreaterThan(0);
      expect(new Set(p.lines.map((l) => l.id)).size).toBe(3);
    });

    it("keeps amounts exact, even above the largest safe integer, and keeps the method", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-big");
      const m = await newMember(store, u.id);
      const huge = 9_007_199_254_740_993n; // 2^53 + 1: a float would round it
      const p = await store.payments.create(
        payment(m.id, u.id, {
          method: "BANK_TRANSFER",
          total: huge,
          lines: [{ category: "Building Funds", amount: huge }],
        }),
      );
      expect(p.total).toBe(huge);
      const found = await store.payments.findById(p.id);
      expect(found?.method).toBe("BANK_TRANSFER");
      expect(found?.total).toBe(huge);
      expect(found?.lines.map((l) => l.amount)).toEqual([huge]);
    });

    it("saves the payment date as given and reads it back by id and in the list (U.4a)", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-paid-on");
      const m = await newMember(store, u.id);
      const p = await store.payments.create(payment(m.id, u.id, { paidOn: "2025-02-28" }));
      expect(p.paidOn).toBe("2025-02-28");
      expect((await store.payments.findById(p.id))?.paidOn).toBe("2025-02-28");
      expect((await store.payments.listByMember(m.id)).map((x) => x.paidOn)).toEqual(["2025-02-28"]);
    });

    it("finds a payment by id, and returns null for an unknown id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-find");
      const m = await newMember(store, u.id);
      const p = await store.payments.create(payment(m.id, u.id));
      expect(await store.payments.findById(p.id)).toEqual(p);
      expect(await store.payments.findById("no-such-id")).toBeNull();
    });

    it("rejects an unknown member with UnknownMemberError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-nomember");
      await expect(store.payments.create(payment("no-such-member", u.id))).rejects.toBeInstanceOf(
        UnknownMemberError,
      );
      expect(await store.payments.listByMember("no-such-member")).toEqual([]);
    });

    it("rejects an unknown creator with UnknownActorError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-noactor");
      const m = await newMember(store, u.id);
      await expect(store.payments.create(payment(m.id, "no-such-user"))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
      expect(await store.payments.listByMember(m.id)).toEqual([]);
    });

    it("lists only the payments of the asked member, oldest first", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-list");
      const m1 = await newMember(store, u.id);
      const m2 = await newMember(store, u.id);
      const p1 = await store.payments.create(payment(m1.id, u.id));
      await pause();
      const p2 = await store.payments.create(payment(m2.id, u.id));
      await pause();
      const p3 = await store.payments.create(payment(m1.id, u.id));
      expect((await store.payments.listByMember(m1.id)).map((p) => p.id)).toEqual([p1.id, p3.id]);
      expect((await store.payments.listByMember(m2.id)).map((p) => p.id)).toEqual([p2.id]);
    });

    it("returns an empty list for a member with no payments", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-empty");
      const m = await newMember(store, u.id);
      expect(await store.payments.listByMember(m.id)).toEqual([]);
    });

    it("keeps the same category on two lines, in the order given", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-twice");
      const m = await newMember(store, u.id);
      const p = await store.payments.create(
        payment(m.id, u.id, {
          total: 300n,
          lines: [
            { category: "Savings", amount: 100n },
            { category: "Shares", amount: 50n },
            { category: "Savings", amount: 150n },
          ],
        }),
      );
      const found = await store.payments.findById(p.id);
      expect(found?.lines.map((l) => [l.category, l.amount])).toEqual([
        ["Savings", 100n],
        ["Shares", 50n],
        ["Savings", 150n],
      ]);
    });

    it("does not let a caller change stored data through input or returned records", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-copy");
      const m = await newMember(store, u.id);
      const input = payment(m.id, u.id);
      const p = await store.payments.create(input);
      const time = p.createdAt.getTime();
      // Change what we passed in.
      const first = input.lines[0];
      if (first === undefined) throw new Error("no line");
      first.amount = 1n;
      input.lines.push({ category: "Savings", amount: 1n });
      // Change what create returned.
      p.method = "BANK_TRANSFER";
      p.createdAt.setFullYear(2000);
      p.lines.push({ id: "x", category: "Savings", amount: 1n, loanId: null });
      const l0 = p.lines[0];
      if (l0 !== undefined) l0.amount = 1n;
      // Change what findById and listByMember returned.
      const found = await store.payments.findById(p.id);
      const [listed] = await store.payments.listByMember(m.id);
      for (const r of [found, listed]) {
        if (r === undefined || r === null) throw new Error("payment not found");
        r.method = "BANK_TRANSFER";
        r.createdAt.setFullYear(2000);
        r.lines.push({ id: "y", category: "Savings", amount: 1n, loanId: null });
        const first0 = r.lines[0];
        if (first0 !== undefined) first0.amount = 1n;
      }
      const again = await store.payments.findById(p.id);
      expect(again?.method).toBe("CASH");
      expect(again?.createdAt.getTime()).toBe(time);
      expect(again?.lines.map((l) => l.amount)).toEqual([500_000n, 1_000_000n, 500_000n]);
    });

    it("keeps the loan of a line, and null on lines with none", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-loan");
      const m = await newMember(store, u.id);
      const loan = await store.loans.create({ memberId: m.id, principal: 30_000_000n, createdById: u.id });
      const p = await store.payments.create(
        payment(m.id, u.id, {
          total: 2_500_000n,
          lines: [
            { category: "Savings", amount: 500_000n },
            { category: "Loan Repaid", amount: 2_000_000n, loanId: loan.id },
          ],
        }),
      );
      expect(p.lines.map((l) => [l.category, l.loanId])).toEqual([
        ["Savings", null],
        ["Loan Repaid", loan.id],
      ]);
      expect(await store.payments.findById(p.id)).toEqual(p);
      expect(await store.payments.listByMember(m.id)).toEqual([p]);
    });

    it("rejects a line with an unknown loan with UnknownLoanError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-noloan");
      const m = await newMember(store, u.id);
      const loan = await store.loans.create({ memberId: m.id, principal: 30_000_000n, createdById: u.id });
      await expect(
        store.payments.create(
          payment(m.id, u.id, {
            total: 300n,
            lines: [
              { category: "Loan Repaid", amount: 100n, loanId: loan.id },
              { category: "Loan Repaid", amount: 200n, loanId: "no-such-loan" },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(UnknownLoanError);
      expect(await store.payments.listByMember(m.id)).toEqual([]);
    });

    it("checks the member and the creator before the loan", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-loan-order");
      const m = await newMember(store, u.id);
      const lines = [{ category: "Loan Repaid", amount: 2_000_000n, loanId: "no-such-loan" }];
      await expect(
        store.payments.create(payment("no-such-member", "no-such-user", { lines })),
      ).rejects.toBeInstanceOf(UnknownMemberError);
      await expect(
        store.payments.create(payment(m.id, "no-such-user", { lines })),
      ).rejects.toBeInstanceOf(UnknownActorError);
    });

    it("gives parallel creates different ids and saves every one", async () => {
      const store = await makeStore();
      const u = await newUser(store, "p-parallel");
      const m = await newMember(store, u.id);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.payments.create(payment(m.id, u.id))),
      );
      expect(new Set(results.map((p) => p.id)).size).toBe(5);
      expect(await store.payments.listByMember(m.id)).toHaveLength(5);
    });
  });
}