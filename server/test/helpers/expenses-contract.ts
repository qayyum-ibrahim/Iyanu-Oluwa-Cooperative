import { describe, expect, it } from "vitest";
import {
  DuplicateExpenseLoanError,
  UnknownActorError,
  type NewExpense,
  type Store,
} from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
const uniqueLoanId = () => `loan-${Date.now()}-${++counter}`;
// Expenses with equal times have no promised order, so tests wait a little between them.
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

/** Rules for the expenses store, the same for every adapter. */
export function runExpensesContract(makeStore: () => Promise<Store> | Store): void {
  describe("expenses", () => {
    const newUser = (store: Store, tag: string) =>
      store.users.create({
        email: uniqueEmail(tag),
        passwordHash: "not-a-real-hash",
        displayName: "Test User",
      });

    // 1,500,000 kobo is ₦15,000. Fictional details only (D-08).
    const expense = (createdById: string, over: Partial<NewExpense> = {}): NewExpense => ({
      createdById,
      category: "Office Maintenance",
      amount: 1_500_000n,
      method: "CASH",
      ...over,
    });

    it("saves an expense with an id, the creator, a date, empty texts and no loan or deletion", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-create");
      const e = await store.expenses.create(expense(u.id));
      expect(e.id.length).toBeGreaterThan(0);
      expect(e).toMatchObject({
        category: "Office Maintenance",
        amount: 1_500_000n,
        method: "CASH",
        description: "",
        narration: "",
        loanId: null,
        createdById: u.id,
        deletedAt: null,
        deletedById: null,
      });
      expect(e.createdAt).toBeInstanceOf(Date);
    });

    it("keeps the texts, the loan id, the method and an amount above the largest safe integer exactly", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-exact");
      const huge = 9_007_199_254_740_993n; // 2^53 + 1: a float would round it
      const loanId = uniqueLoanId();
      const e = await store.expenses.create(
        expense(u.id, {
          category: "Others",
          amount: huge,
          method: "BANK_TRANSFER",
          description: "Generator fuel",
          narration: "Fuel for the office generator",
          loanId,
        }),
      );
      const found = await store.expenses.findById(e.id);
      expect(found).toEqual(e);
      expect(found).toMatchObject({
        category: "Others",
        amount: huge,
        method: "BANK_TRANSFER",
        description: "Generator fuel",
        narration: "Fuel for the office generator",
        loanId,
      });
    });

    it("returns null for an unknown id", async () => {
      const store = await makeStore();
      expect(await store.expenses.findById("no-such-id")).toBeNull();
    });

    it("rejects an unknown creator with UnknownActorError and saves nothing", async () => {
      const store = await makeStore();
      await expect(store.expenses.create(expense("no-such-user"))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
      expect(await store.expenses.list({ createdById: "no-such-user" })).toEqual([]);
    });

    it("rejects a second expense for the same loan with DuplicateExpenseLoanError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-loan");
      const loanId = uniqueLoanId();
      const first = await store.expenses.create(expense(u.id, { category: "Loan", loanId }));
      await expect(
        store.expenses.create(expense(u.id, { category: "Loan", loanId })),
      ).rejects.toBeInstanceOf(DuplicateExpenseLoanError);
      expect((await store.expenses.list({ createdById: u.id })).map((e) => e.id)).toEqual([first.id]);
    });

    it("checks the creator before the loan id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-order");
      const loanId = uniqueLoanId();
      await store.expenses.create(expense(u.id, { loanId }));
      await expect(store.expenses.create(expense("no-such-user", { loanId }))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
    });

    it("allows many expenses with no loan", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-noloan");
      await store.expenses.create(expense(u.id));
      await store.expenses.create(expense(u.id));
      expect(await store.expenses.list({ createdById: u.id })).toHaveLength(2);
    });

    it("lists oldest first, only the asked creator's expenses, and everything with no filter", async () => {
      const store = await makeStore();
      const a = await newUser(store, "e-list-a");
      const b = await newUser(store, "e-list-b");
      const e1 = await store.expenses.create(expense(a.id));
      await pause();
      const e2 = await store.expenses.create(expense(b.id));
      await pause();
      const e3 = await store.expenses.create(expense(a.id));
      expect((await store.expenses.list({ createdById: a.id })).map((e) => e.id)).toEqual([e1.id, e3.id]);
      expect((await store.expenses.list({ createdById: b.id })).map((e) => e.id)).toEqual([e2.id]);
      const all = (await store.expenses.list({})).map((e) => e.id);
      expect(all.filter((id) => [e1.id, e2.id, e3.id].includes(id))).toEqual([e1.id, e2.id, e3.id]);
    });

    it("does not let a caller change stored data through input or returned records", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-copy");
      const input = expense(u.id, { description: "Paint" });
      const e = await store.expenses.create(input);
      const time = e.createdAt.getTime();
      // Change what we passed in.
      input.amount = 1n;
      input.description = "Changed";
      // Change what create, findById and list returned.
      const found = await store.expenses.findById(e.id);
      const [listed] = await store.expenses.list({ createdById: u.id });
      for (const r of [e, found, listed]) {
        if (r === undefined || r === null) throw new Error("expense not found");
        r.amount = 1n;
        r.category = "Loan";
        r.description = "Changed";
        r.createdAt.setFullYear(2000);
      }
      const again = await store.expenses.findById(e.id);
      expect(again).toMatchObject({ amount: 1_500_000n, category: "Office Maintenance", description: "Paint" });
      expect(again?.createdAt.getTime()).toBe(time);
    });

    it("gives parallel creates different ids and saves every one", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-parallel");
      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.expenses.create(expense(u.id))),
      );
      expect(new Set(results.map((e) => e.id)).size).toBe(5);
      expect(await store.expenses.list({ createdById: u.id })).toHaveLength(5);
    });

    it("undoes an expense when the transaction it was made in throws", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-tx");
      await expect(
        store.transaction(async (tx) => {
          await tx.expenses.create(expense(u.id));
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.expenses.list({ createdById: u.id })).toEqual([]);
    });

    it("keeps the expenses saved before a transaction that throws", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-tx-keep");
      const before = await store.expenses.create(expense(u.id, { description: "Before" }));
      await expect(
        store.transaction(async (tx) => {
          await tx.expenses.create(expense(u.id, { description: "Inside" }));
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.expenses.list({ createdById: u.id })).toEqual([before]);
    });
  });
}
