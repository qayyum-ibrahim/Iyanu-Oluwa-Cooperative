import { describe, expect, it } from "vitest";
import {
  DuplicateExpenseKeyError,
  DuplicateExpenseLoanError,
  UnknownActorError,
  UnknownLoanError,
  DuplicateExpensePayOffError,
  UnknownPayOffError,
  type NewExpense,
  type Store,
} from "../../src/store.js";

let counter = 0;
// Unique per call, so the contract also works on a database that keeps data between tests.
const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${++counter}@example.test`;
const uniqueKey = () => `expense-contract-key-${Date.now()}-${++counter}`;
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

    // A real loan, since loanId is a foreign key (5.3b). Fictional details only (D-08).
    const newLoanId = async (store: Store, createdById: string) => {
      const m = await store.members.create({
        fullName: "Expense Member",
        phone: "",
        address: "",
        occupation: "",
        createdById,
      });
      const l = await store.loans.create({ memberId: m.id, principal: 30_000_000n, createdById });
      return l.id;
    };

    // A real pay-off, since payOffId is a foreign key (6.3b). Fictional details only (D-08).
    const newPayOffId = async (store: Store, createdById: string) => {
      const m = await store.members.create({
        fullName: "Pay-off Member",
        phone: "",
        address: "",
        occupation: "",
        createdById,
      });
      const p = await store.payOffs.create({
        memberId: m.id,
        method: "CASH",
        total: 2_500_000n,
        lines: [{ category: "Savings", amount: 2_500_000n }],
        createdById,
      });
      return p.id;
    };

    // 1,500,000 kobo is ₦15,000. Fictional details only (D-08).
    const expense = (createdById: string, over: Partial<NewExpense> = {}): NewExpense => ({
      createdById,
      category: "Office Maintenance",
      amount: 1_500_000n,
      method: "CASH",
      ...over,
    });

    it("saves an expense with an id, the creator, a date, empty texts and no loan, pay-off or deletion", async () => {
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
        payOffId: null,
        idempotencyKey: null,
        requestHash: null,
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
      const loanId = await newLoanId(store, u.id);
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
      const loanId = await newLoanId(store, u.id);
      const first = await store.expenses.create(expense(u.id, { category: "Loan", loanId }));
      await expect(
        store.expenses.create(expense(u.id, { category: "Loan", loanId })),
      ).rejects.toBeInstanceOf(DuplicateExpenseLoanError);
      expect((await store.expenses.list({ createdById: u.id })).map((e) => e.id)).toEqual([first.id]);
    });

    it("checks the creator before the loan id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-order");
      const loanId = await newLoanId(store, u.id);
      await store.expenses.create(expense(u.id, { loanId }));
      await expect(store.expenses.create(expense("no-such-user", { loanId }))).rejects.toBeInstanceOf(
        UnknownActorError,
      );
    });

    it("rejects an unknown loan with UnknownLoanError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-noloan-id");
      await expect(
        store.expenses.create(expense(u.id, { category: "Loan", loanId: "no-such-loan" })),
      ).rejects.toBeInstanceOf(UnknownLoanError);
      expect(await store.expenses.list({ createdById: u.id })).toEqual([]);
    });

    it("checks the creator before the loan", async () => {
      const store = await makeStore();
      await expect(
        store.expenses.create(expense("no-such-user", { loanId: "no-such-loan" })),
      ).rejects.toBeInstanceOf(UnknownActorError);
    });

    // Pay-off links (step 6.3b), the same rules as the loan links.
    it("keeps the pay-off id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-payoff");
      const payOffId = await newPayOffId(store, u.id);
      const e = await store.expenses.create(expense(u.id, { category: "Membership Withdrawal", payOffId }));
      expect(e).toMatchObject({ payOffId, loanId: null });
      expect(await store.expenses.findById(e.id)).toEqual(e);
    });

    it("rejects an unknown pay-off with UnknownPayOffError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-nopayoff");
      await expect(
        store.expenses.create(expense(u.id, { category: "Membership Withdrawal", payOffId: "no-such-pay-off" })),
      ).rejects.toBeInstanceOf(UnknownPayOffError);
      expect(await store.expenses.list({ createdById: u.id })).toEqual([]);
    });

    it("rejects a second expense for the same pay-off with DuplicateExpensePayOffError and saves nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-payoff-dup");
      const payOffId = await newPayOffId(store, u.id);
      const first = await store.expenses.create(expense(u.id, { category: "Membership Withdrawal", payOffId }));
      await expect(
        store.expenses.create(expense(u.id, { category: "Membership Withdrawal", payOffId })),
      ).rejects.toBeInstanceOf(DuplicateExpensePayOffError);
      expect((await store.expenses.list({ createdById: u.id })).map((e) => e.id)).toEqual([first.id]);
    });

    it("checks the creator before the pay-off", async () => {
      const store = await makeStore();
      await expect(
        store.expenses.create(expense("no-such-user", { payOffId: "no-such-pay-off" })),
      ).rejects.toBeInstanceOf(UnknownActorError);
    });

    it("checks the loan before the pay-off", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-loan-payoff");
      await expect(
        store.expenses.create(expense(u.id, { loanId: "no-such-loan", payOffId: "no-such-pay-off" })),
      ).rejects.toBeInstanceOf(UnknownLoanError);
    });

    it("checks a repeated loan before a repeated pay-off, and a repeated pay-off before a repeated key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-payoff-order");
      const loanId = await newLoanId(store, u.id);
      const payOffId = await newPayOffId(store, u.id);
      const idempotencyKey = uniqueKey();
      await store.expenses.create(expense(u.id, { loanId, payOffId, idempotencyKey }));
      const otherPayOffId = await newPayOffId(store, u.id);
      await expect(
        store.expenses.create(expense(u.id, { loanId, payOffId: otherPayOffId })),
      ).rejects.toBeInstanceOf(DuplicateExpenseLoanError);
      await expect(
        store.expenses.create(expense(u.id, { payOffId, idempotencyKey })),
      ).rejects.toBeInstanceOf(DuplicateExpensePayOffError);
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

    // List filters (step 5.8). Each test filters by a new creator, so data kept from other tests
    // cannot match.
    it("filters by category exactly", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-f-cat");
      const e1 = await store.expenses.create(expense(u.id));
      await pause();
      await store.expenses.create(expense(u.id, { category: "Allowances" }));
      await pause();
      const e3 = await store.expenses.create(expense(u.id));
      const ids = async (category: string) =>
        (await store.expenses.list({ createdById: u.id, category })).map((e) => e.id);
      expect(await ids("Office Maintenance")).toEqual([e1.id, e3.id]);
      expect(await ids("office maintenance")).toEqual([]);
      expect(await ids("Office")).toEqual([]);
    });

    it("filters by method", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-f-method");
      const cash = await store.expenses.create(expense(u.id));
      await pause();
      const bank = await store.expenses.create(expense(u.id, { method: "BANK_TRANSFER" }));
      const ids = async (method: "CASH" | "BANK_TRANSFER") =>
        (await store.expenses.list({ createdById: u.id, method })).map((e) => e.id);
      expect(await ids("CASH")).toEqual([cash.id]);
      expect(await ids("BANK_TRANSFER")).toEqual([bank.id]);
    });

    it("includes createdFrom and leaves out createdBefore, at the exact time", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-f-range");
      const e1 = await store.expenses.create(expense(u.id));
      await pause();
      const e2 = await store.expenses.create(expense(u.id));
      await pause();
      const e3 = await store.expenses.create(expense(u.id));
      const ids = async (range: { createdFrom?: Date; createdBefore?: Date }) =>
        (await store.expenses.list({ createdById: u.id, ...range })).map((e) => e.id);
      expect(await ids({ createdFrom: e2.createdAt })).toEqual([e2.id, e3.id]);
      expect(await ids({ createdBefore: e2.createdAt })).toEqual([e1.id]);
      expect(await ids({ createdFrom: e2.createdAt, createdBefore: e3.createdAt })).toEqual([e2.id]);
      expect(await ids({ createdFrom: new Date(e3.createdAt.getTime() + 1) })).toEqual([]);
      expect(await ids({ createdBefore: new Date(e3.createdAt.getTime() + 1) })).toEqual([e1.id, e2.id, e3.id]);
    });

    it("gives nothing for an empty or reversed time range", async () => {
      const store = await makeStore();
      const u = await newUser(store, "e-f-empty");
      const e = await store.expenses.create(expense(u.id));
      const list = (createdFrom: Date, createdBefore: Date) =>
        store.expenses.list({ createdById: u.id, createdFrom, createdBefore });
      expect(await list(e.createdAt, e.createdAt)).toEqual([]);
      expect(await list(new Date(e.createdAt.getTime() + 1), e.createdAt)).toEqual([]);
    });

    it("needs every given filter to hold", async () => {
      const store = await makeStore();
      const a = await newUser(store, "e-f-all-a");
      const b = await newUser(store, "e-f-all-b");
      const start = await store.expenses.create(expense(a.id, { method: "BANK_TRANSFER" }));
      await pause();
      const match = await store.expenses.create(expense(a.id, { method: "BANK_TRANSFER" }));
      await store.expenses.create(expense(a.id, { method: "CASH" }));
      await store.expenses.create(expense(a.id, { method: "BANK_TRANSFER", category: "Allowances" }));
      await store.expenses.create(expense(b.id, { method: "BANK_TRANSFER" }));
      const found = await store.expenses.list({
        createdById: a.id,
        category: "Office Maintenance",
        method: "BANK_TRANSFER",
        createdFrom: match.createdAt,
      });
      expect(found).toEqual([match]);
      expect(found).not.toContainEqual(start);
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

    // Idempotency keys (step 5.7c), as loans-contract.ts.
    it("saves the key and the hash and reads them back by id and by key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-save");
      const key = uniqueKey();
      const e = await store.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "hash-one" }));
      expect(e.idempotencyKey).toBe(key);
      expect(e.requestHash).toBe("hash-one");
      expect(await store.expenses.findById(e.id)).toEqual(e);
      expect(await store.expenses.findByKey(u.id, key)).toEqual(e);
    });

    it("finds nothing for an unknown key or for another user's key", async () => {
      const store = await makeStore();
      const a = await newUser(store, "ek-find-a");
      const b = await newUser(store, "ek-find-b");
      const key = uniqueKey();
      await store.expenses.create(expense(a.id, { idempotencyKey: key, requestHash: "h" }));
      expect(await store.expenses.findByKey(a.id, uniqueKey())).toBeNull();
      expect(await store.expenses.findByKey(b.id, key)).toBeNull();
    });

    it("refuses a second expense with the same key for the same user, and saves only the first", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-dup");
      const key = uniqueKey();
      const first = await store.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "h" }));
      await expect(
        store.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "other" })),
      ).rejects.toBeInstanceOf(DuplicateExpenseKeyError);
      expect((await store.expenses.list({ createdById: u.id })).map((e) => e.id)).toEqual([first.id]);
    });

    it("checks the creator before the key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-order");
      const key = uniqueKey();
      await store.expenses.create(expense(u.id, { idempotencyKey: key }));
      await expect(
        store.expenses.create(expense("no-such-user", { idempotencyKey: key })),
      ).rejects.toBeInstanceOf(UnknownActorError);
    });

    it("checks a repeated loan id before a repeated key", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-loan-first");
      const loanId = await newLoanId(store, u.id);
      const key = uniqueKey();
      await store.expenses.create(expense(u.id, { category: "Loan", loanId, idempotencyKey: key }));
      await expect(
        store.expenses.create(expense(u.id, { category: "Loan", loanId, idempotencyKey: key })),
      ).rejects.toBeInstanceOf(DuplicateExpenseLoanError);
    });

    it("refuses a repeated key on an expense with a new loan as a key clash", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-key-loan");
      const key = uniqueKey();
      await store.expenses.create(expense(u.id, { idempotencyKey: key }));
      const loanId = await newLoanId(store, u.id);
      await expect(
        store.expenses.create(expense(u.id, { category: "Loan", loanId, idempotencyKey: key })),
      ).rejects.toBeInstanceOf(DuplicateExpenseKeyError);
      expect(await store.expenses.list({ createdById: u.id })).toHaveLength(1);
    });

    it("lets two users use the same key", async () => {
      const store = await makeStore();
      const a = await newUser(store, "ek-two-a");
      const b = await newUser(store, "ek-two-b");
      const key = uniqueKey();
      const ea = await store.expenses.create(expense(a.id, { idempotencyKey: key, requestHash: "h" }));
      const eb = await store.expenses.create(expense(b.id, { idempotencyKey: key, requestHash: "h" }));
      expect((await store.expenses.findByKey(a.id, key))?.id).toBe(ea.id);
      expect((await store.expenses.findByKey(b.id, key))?.id).toBe(eb.id);
    });

    it("returns a copy from findByKey: changing it does not change the stored expense", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-copy");
      const key = uniqueKey();
      const saved = await store.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "h" }));
      const found = await store.expenses.findByKey(u.id, key);
      if (found === null) throw new Error("expense not found");
      found.requestHash = "changed";
      found.amount = 1n;
      found.createdAt.setTime(0);
      expect(await store.expenses.findByKey(u.id, key)).toEqual(saved);
    });

    it("undoes earlier writes in a transaction when the key is a duplicate", { timeout: 60_000 }, async () => {
      const store = await makeStore();
      const u = await newUser(store, "ek-tx");
      const key = uniqueKey();
      await store.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "h" }));
      const other = uniqueKey();
      await expect(
        store.transaction(async (tx) => {
          await tx.expenses.create(expense(u.id, { idempotencyKey: other, requestHash: "h" }));
          await tx.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "h" }));
        }),
      ).rejects.toBeInstanceOf(DuplicateExpenseKeyError);
      expect(await store.expenses.findByKey(u.id, other)).toBeNull();
      expect(await store.expenses.list({ createdById: u.id })).toHaveLength(1);
    });

    // Edit and soft-delete (step 5.9).
    it("updates only the given fields and keeps the rest, an amount above the largest safe integer exactly", async () => {
      const store = await makeStore();
      const u = await newUser(store, "eu-fields");
      const loanId = await newLoanId(store, u.id);
      const key = uniqueKey();
      const saved = await store.expenses.create(
        expense(u.id, { description: "Paint", loanId, idempotencyKey: key, requestHash: "h" }),
      );
      const changed = await store.expenses.update(saved.id, {
        category: "Others",
        amount: 9_007_199_254_740_993n,
        method: "BANK_TRANSFER",
        narration: "Generator fuel",
      });
      const wanted = {
        ...saved,
        category: "Others",
        amount: 9_007_199_254_740_993n,
        method: "BANK_TRANSFER",
        narration: "Generator fuel",
      };
      expect(changed).toEqual(wanted);
      expect(await store.expenses.findById(saved.id)).toEqual(wanted);
      const onlyText = await store.expenses.update(saved.id, { description: "" });
      expect(onlyText).toEqual({ ...wanted, description: "" });
    });

    it("returns the expense unchanged for an empty change", async () => {
      const store = await makeStore();
      const u = await newUser(store, "eu-empty");
      const saved = await store.expenses.create(expense(u.id));
      expect(await store.expenses.update(saved.id, {})).toEqual(saved);
      expect(await store.expenses.findById(saved.id)).toEqual(saved);
    });

    it("returns null from update for an unknown id", async () => {
      const store = await makeStore();
      expect(await store.expenses.update("no-such-expense", { amount: 1n })).toBeNull();
    });

    it("does not let a caller change stored data through the changes or the record update returns", async () => {
      const store = await makeStore();
      const u = await newUser(store, "eu-copy");
      const saved = await store.expenses.create(expense(u.id));
      const changes = { description: "Paint", amount: 2_000_000n };
      const changed = await store.expenses.update(saved.id, changes);
      if (changed === null) throw new Error("expense not found");
      changes.description = "Changed";
      changes.amount = 1n;
      changed.description = "Changed";
      changed.amount = 1n;
      changed.createdAt.setTime(0);
      expect(await store.expenses.findById(saved.id)).toEqual({ ...saved, description: "Paint", amount: 2_000_000n });
    });

    it("soft-deletes once: sets the time and the user, keeps every other field", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-once");
      const admin = await newUser(store, "ed-once-admin");
      const saved = await store.expenses.create(expense(u.id));
      const start = Date.now();
      const deleted = await store.expenses.softDelete(saved.id, admin.id);
      const end = Date.now();
      if (deleted === null) throw new Error("expense not found");
      expect(deleted).toEqual({ ...saved, deletedAt: deleted.deletedAt, deletedById: admin.id });
      const at = deleted.deletedAt?.getTime() ?? 0;
      expect(at).toBeGreaterThanOrEqual(start);
      expect(at).toBeLessThanOrEqual(end);
      expect(await store.expenses.findById(saved.id)).toEqual(deleted);
      // A second delete changes nothing, whoever asks.
      expect(await store.expenses.softDelete(saved.id, u.id)).toBeNull();
      expect(await store.expenses.findById(saved.id)).toEqual(deleted);
    });

    it("returns null from softDelete for an unknown id", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-unknown");
      expect(await store.expenses.softDelete("no-such-expense", u.id)).toBeNull();
    });

    it("rejects an unknown deleting user with UnknownActorError, before the expense, and changes nothing", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-actor");
      const saved = await store.expenses.create(expense(u.id));
      await expect(store.expenses.softDelete(saved.id, "no-such-user")).rejects.toBeInstanceOf(UnknownActorError);
      await expect(store.expenses.softDelete("no-such-expense", "no-such-user")).rejects.toBeInstanceOf(
        UnknownActorError,
      );
      expect(await store.expenses.findById(saved.id)).toEqual(saved);
    });

    it("does not let a caller change stored data through the record softDelete returns", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-copy");
      const saved = await store.expenses.create(expense(u.id));
      const deleted = await store.expenses.softDelete(saved.id, u.id);
      if (deleted === null || deleted.deletedAt === null) throw new Error("expense not deleted");
      const at = deleted.deletedAt.getTime();
      deleted.deletedAt.setTime(0);
      deleted.amount = 1n;
      expect((await store.expenses.findById(saved.id))?.deletedAt?.getTime()).toBe(at);
      expect((await store.expenses.findById(saved.id))?.amount).toBe(1_500_000n);
    });

    it("does not update a deleted expense", async () => {
      const store = await makeStore();
      const u = await newUser(store, "eu-deleted");
      const saved = await store.expenses.create(expense(u.id));
      const deleted = await store.expenses.softDelete(saved.id, u.id);
      expect(await store.expenses.update(saved.id, { amount: 1n, description: "Changed" })).toBeNull();
      expect(await store.expenses.findById(saved.id)).toEqual(deleted);
    });

    it("returns null for an empty change to a deleted expense (A-178 UP8)", async () => {
      const store = await makeStore();
      const u = await newUser(store, "eu-deleted-empty");
      const saved = await store.expenses.create(expense(u.id));
      const deleted = await store.expenses.softDelete(saved.id, u.id);
      expect(await store.expenses.update(saved.id, {})).toBeNull();
      expect(await store.expenses.findById(saved.id)).toEqual(deleted);
    });

    it("leaves deleted expenses out of every list, but findById and findByKey still find them", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-list");
      const key = uniqueKey();
      const kept = await store.expenses.create(expense(u.id));
      await pause();
      const gone = await store.expenses.create(expense(u.id, { idempotencyKey: key, requestHash: "h" }));
      await store.expenses.softDelete(gone.id, u.id);
      expect(await store.expenses.list({ createdById: u.id })).toEqual([kept]);
      expect(
        await store.expenses.list({
          createdById: u.id,
          category: "Office Maintenance",
          method: "CASH",
          createdFrom: kept.createdAt,
          createdBefore: new Date(Date.now() + 60_000),
        }),
      ).toEqual([kept]);
      expect((await store.expenses.list({})).map((e) => e.id)).not.toContain(gone.id);
      expect((await store.expenses.findById(gone.id))?.deletedById).toBe(u.id);
      expect((await store.expenses.findByKey(u.id, key))?.id).toBe(gone.id);
    });

    it("gives one record to five parallel deletes of one expense", async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-race");
      const saved = await store.expenses.create(expense(u.id));
      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.expenses.softDelete(saved.id, u.id)),
      );
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });

    it("undoes an update and a delete when the transaction they were made in throws", { timeout: 60_000 }, async () => {
      const store = await makeStore();
      const u = await newUser(store, "ed-tx");
      const a = await store.expenses.create(expense(u.id));
      await pause();
      const b = await store.expenses.create(expense(u.id));
      await expect(
        store.transaction(async (tx) => {
          await tx.expenses.update(a.id, { amount: 1n });
          await tx.expenses.softDelete(b.id, u.id);
          throw new Error("stop");
        }),
      ).rejects.toThrow("stop");
      expect(await store.expenses.findById(a.id)).toEqual(a);
      expect(await store.expenses.findById(b.id)).toEqual(b);
      expect(await store.expenses.list({ createdById: u.id })).toEqual([a, b]);
    });
  });
}
