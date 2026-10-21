import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MANUAL_EXPENSE_CATEGORIES } from "../src/expense-categories.js";
import {
  createExpense,
  deleteExpense,
  EXPENSE_TEXT_MAX,
  listExpenses,
  updateExpense,
  type ExpenseActor,
  type ExpenseResult,
  type ExpenseView,
} from "../src/expenses.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPrismaStore } from "../src/prisma-store.js";
import {
  DuplicateExpenseKeyError,
  type ExpenseListQuery,
  type Role,
  type Store,
  type UserRecord,
} from "../src/store.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// Fictional data only (D-08).
async function build(store: Store = createMemoryStore()) {
  const make = (name: string, role: Role, permissions: string[]) =>
    store.users.create({
      email: `${name}-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role,
      permissions,
    });
  const admin = await make("admin", "SUPER_ADMIN", []);
  const a = await make("staff-a", "STAFF", ["expenses.create"]);
  const viewOnly = await make("view-only", "STAFF", ["expenses.view", "expenses.edit", "expenses.delete"]);
  return { store, admin, a, viewOnly };
}

const actorOf = (u: UserRecord): ExpenseActor => ({ id: u.id, subject: subjectOf(u) });

let keyCount = 0;
/** A new idempotency key on every call, so separate calls are separate requests. */
const newKey = () => `expense-test-key-${String(++keyCount).padStart(6, "0")}`;

const body = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: newKey(),
  category: "Office Maintenance",
  amount: "15000",
  method: "CASH",
  ...over,
});

function must(r: ExpenseResult): ExpenseView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason} ${r.code ?? ""}`);
  return r.value;
}

describe("createExpense: success", () => {
  it("saves the expense, the view and one audit entry for Staff", async () => {
    const { store, a } = await build();
    const r = must(
      await createExpense(store, actorOf(a), body({ method: "BANK_TRANSFER", description: "  roof repair  " })),
    );
    expect(r).toMatchObject({
      category: "Office Maintenance",
      amount: "15000.00",
      method: "BANK_TRANSFER",
      description: "roof repair",
      narration: "",
      createdById: a.id,
    });
    expect(Object.keys(r).sort()).toEqual([
      "amount",
      "category",
      "createdAt",
      "createdById",
      "description",
      "id",
      "method",
      "narration",
    ]);
    expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);

    expect(await store.expenses.list({})).toEqual([
      expect.objectContaining({
        id: r.id,
        category: "Office Maintenance",
        amount: 1_500_000n,
        method: "BANK_TRANSFER",
        description: "roof repair",
        narration: "",
        loanId: null,
        createdById: a.id,
        deletedAt: null,
        deletedById: null,
      }),
    ]);
    const audit = await store.audit.listByActor(a.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "expense.created",
      entityType: "Expense",
      entityId: r.id,
      detail: "category=Office Maintenance amount_kobo=1500000",
    });
  });

  it("accepts every category that can be picked by hand", async () => {
    const { store, a } = await build();
    for (const category of MANUAL_EXPENSE_CATEGORIES) {
      const over = category === "Others" ? { category, narration: "fuel for generator" } : { category };
      expect(must(await createExpense(store, actorOf(a), body(over))).category).toBe(category);
    }
    expect(await store.expenses.list({})).toHaveLength(MANUAL_EXPENSE_CATEGORIES.length);
  });

  it("saves the trimmed narration for Others", async () => {
    const { store, a } = await build();
    const r = must(await createExpense(store, actorOf(a), body({ category: "Others", narration: "  fuel  " })));
    expect(r.narration).toBe("fuel");
    expect((await store.expenses.findById(r.id))?.narration).toBe("fuel");
  });

  it("lets the Super Admin record an expense", async () => {
    const { store, admin } = await build();
    expect(must(await createExpense(store, actorOf(admin), body())).createdById).toBe(admin.id);
  });

  it("keeps the largest allowed amount and the smallest (1 kobo) exact", async () => {
    const { store, a } = await build();
    const big = must(await createExpense(store, actorOf(a), body({ amount: "999999999999.99" })));
    const small = must(await createExpense(store, actorOf(a), body({ amount: "0.01" })));
    expect(big.amount).toBe("999999999999.99");
    expect(small.amount).toBe("0.01");
    expect((await store.expenses.findById(big.id))?.amount).toBe(99_999_999_999_999n);
    expect((await store.expenses.findById(small.id))?.amount).toBe(1n);
  });

  it("accepts a description and a narration of exactly 200 characters, and null for both", async () => {
    const { store, a } = await build();
    const max = "d".repeat(EXPENSE_TEXT_MAX);
    const r = must(await createExpense(store, actorOf(a), body({ category: "Others", description: max, narration: max })));
    expect(r.description).toBe(max);
    expect(r.narration).toBe(max);
    const n = must(await createExpense(store, actorOf(a), body({ description: null, narration: null })));
    expect(n.description).toBe("");
    expect(n.narration).toBe("");
  });

  it("accepts blank narration for a category other than Others", async () => {
    const { store, a } = await build();
    expect(must(await createExpense(store, actorOf(a), body({ narration: "   " }))).narration).toBe("");
  });
});

describe("createExpense: refusals save nothing", () => {
  it("refuses Staff without expenses.create", async () => {
    const { store, viewOnly } = await build();
    expect(await createExpense(store, actorOf(viewOnly), body())).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.expenses.list({})).toEqual([]);
    expect(await store.audit.listByActor(viewOnly.id)).toEqual([]);
  });

  it("refuses an inactive Staff user", async () => {
    const { store, a } = await build();
    const inactive = { ...a, isActive: false };
    expect(await createExpense(store, actorOf(inactive), body())).toEqual({ ok: false, reason: "forbidden" });
  });

  it("answers forbidden before checking anything else", async () => {
    const { store, viewOnly } = await build();
    expect(await createExpense(store, actorOf(viewOnly), {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it.each([
    { label: "Loan (system-only, DR-10)", over: { category: "Loan" }, code: "system_only" },
    { label: "Membership Withdrawal (system-only, DR-05)", over: { category: "Membership Withdrawal" }, code: "system_only" },
    { label: "an unknown category", over: { category: "Fuel" }, code: "unknown_category" },
    { label: "a category in the wrong case", over: { category: "others" }, code: "unknown_category" },
    { label: "a missing category", over: { category: undefined }, code: "unknown_category" },
    { label: "a payment category", over: { category: "Savings" }, code: "unknown_category" },
    { label: "a missing method", over: { method: undefined }, code: "invalid_method" },
    { label: "a method in the wrong case", over: { method: "cash" }, code: "invalid_method" },
    { label: "a JSON number amount", over: { amount: 15000 }, code: "invalid_amount" },
    { label: "a missing amount", over: { amount: undefined }, code: "invalid_amount" },
    { label: "a negative amount", over: { amount: "-1" }, code: "invalid_amount" },
    { label: "three decimals", over: { amount: "1.005" }, code: "invalid_amount" },
    { label: "a zero amount", over: { amount: "0" }, code: "amount_not_positive" },
    { label: "a zero amount with decimals", over: { amount: "0.00" }, code: "amount_not_positive" },
    { label: "a description over 200 characters", over: { description: "d".repeat(201) }, code: "invalid_description" },
    { label: "a description that is not text", over: { description: 5 }, code: "invalid_description" },
    { label: "a narration that is not text", over: { category: "Others", narration: ["x"] }, code: "invalid_narration" },
    { label: "a narration over 200 characters", over: { category: "Others", narration: "n".repeat(201) }, code: "invalid_narration" },
    { label: "Others without a narration", over: { category: "Others" }, code: "missing_narration" },
    { label: "Others with a blank narration", over: { category: "Others", narration: "   " }, code: "missing_narration" },
    { label: "a narration on another category", over: { narration: "fuel" }, code: "narration_not_allowed" },
  ])("refuses $label with the code $code", async ({ over, code }) => {
    const { store, a } = await build();
    expect(await createExpense(store, actorOf(a), body(over))).toEqual({ ok: false, reason: "invalid_input", code });
    expect(await store.expenses.list({})).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("checks the category before the method and the amount", async () => {
    const { store, a } = await build();
    const r = await createExpense(store, actorOf(a), { idempotencyKey: newKey(), category: "Loan", method: "x", amount: 1 });
    expect(r).toEqual({ ok: false, reason: "invalid_input", code: "system_only" });
  });

  it("checks the method before the amount", async () => {
    const { store, a } = await build();
    const r = await createExpense(store, actorOf(a), body({ method: "x", amount: 1 }));
    expect(r).toEqual({ ok: false, reason: "invalid_input", code: "invalid_method" });
  });

  it("checks the amount before the description and narration", async () => {
    const { store, a } = await build();
    const r = await createExpense(store, actorOf(a), body({ amount: "0", description: 5, narration: "x" }));
    expect(r).toEqual({ ok: false, reason: "invalid_input", code: "amount_not_positive" });
  });

  it("never repeats the input in a refusal", async () => {
    const { store, a } = await build();
    const r = await createExpense(store, actorOf(a), body({ category: "Secret Category 08012345678" }));
    expect(JSON.stringify(r)).not.toContain("08012345678");
  });
});

describe("createExpense: idempotency key (5.7c)", () => {
  it("a first request is saved and not marked as a replay", async () => {
    const { store, a } = await build();
    expect(await createExpense(store, actorOf(a), body())).toMatchObject({ ok: true, replayed: false });
  });

  it("a repeat returns the first expense: one expense, one audit entry", async () => {
    const { store, a } = await build();
    const b = body({ description: "roof repair" });
    const first = await createExpense(store, actorOf(a), b);
    const second = await createExpense(store, actorOf(a), b);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(must(second)).toEqual(must(first));
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("saves the key and the request hash on the expense", async () => {
    const { store, a } = await build();
    const b = body();
    const r = must(await createExpense(store, actorOf(a), b));
    const saved = await store.expenses.findById(r.id);
    expect(saved?.idempotencyKey).toBe(b.idempotencyKey);
    expect(saved?.requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats the same checked request as a repeat: \"15000\" and \"15000.00\", extra spaces, null texts", async () => {
    const { store, a } = await build();
    const k = newKey();
    const first = must(await createExpense(store, actorOf(a), body({ idempotencyKey: k, description: "paint" })));
    const again = await createExpense(
      store,
      actorOf(a),
      body({ idempotencyKey: k, amount: "15000.00", description: "  paint ", narration: null }),
    );
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again)).toEqual(first);
  });

  it.each([
    { label: "another category", over: { category: "Allowances" } },
    { label: "another amount", over: { amount: "15000.01" } },
    { label: "another method", over: { method: "BANK_TRANSFER" } },
    { label: "another description", over: { description: "paint" } },
    { label: "another narration", over: { category: "Others", narration: "fuel" } },
  ])("refuses the same key with $label, and saves nothing more", async ({ over }) => {
    const { store, a } = await build();
    const k = newKey();
    must(await createExpense(store, actorOf(a), body({ idempotencyKey: k })));
    expect(await createExpense(store, actorOf(a), body({ idempotencyKey: k, ...over }))).toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("tells Others requests apart by their narration", async () => {
    const { store, a } = await build();
    const k = newKey();
    must(await createExpense(store, actorOf(a), body({ idempotencyKey: k, category: "Others", narration: "fuel" })));
    expect(
      await createExpense(store, actorOf(a), body({ idempotencyKey: k, category: "Others", narration: "diesel" })),
    ).toEqual({ ok: false, reason: "idempotency_conflict" });
  });

  it("keeps keys apart per user", async () => {
    const { store, admin, a } = await build();
    const k = newKey();
    const ra = must(await createExpense(store, actorOf(a), body({ idempotencyKey: k })));
    const rb = await createExpense(store, actorOf(admin), body({ idempotencyKey: k }));
    expect(rb).toMatchObject({ ok: true, replayed: false });
    expect(must(rb).id).not.toBe(ra.id);
    expect(await store.expenses.list({})).toHaveLength(2);
  });

  it("does not use up the key when the request is refused", async () => {
    const { store, a } = await build();
    const k = newKey();
    expect(await createExpense(store, actorOf(a), body({ idempotencyKey: k, amount: "0" }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "amount_not_positive",
    });
    expect(await createExpense(store, actorOf(a), body({ idempotencyKey: k }))).toMatchObject({
      ok: true,
      replayed: false,
    });
  });

  it("does not use up the key when the audit write fails", async () => {
    const { store, a } = await build();
    const k = newKey();
    await expect(createExpense(failingInside(store, "audit"), actorOf(a), body({ idempotencyKey: k }))).rejects.toThrow(
      "audit down",
    );
    expect(await createExpense(store, actorOf(a), body({ idempotencyKey: k }))).toMatchObject({
      ok: true,
      replayed: false,
    });
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("handles a lost race: the key is saved between the lookup and the save", async () => {
    const { store, a } = await build();
    const b = body();
    const first = must(await createExpense(store, actorOf(a), b));
    let lookups = 0;
    const racing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            expenses: {
              ...tx.expenses,
              findByKey: async (userId, k) => {
                lookups += 1;
                return lookups === 1 ? null : tx.expenses.findByKey(userId, k);
              },
            },
          }),
        ),
    };
    const r = await createExpense(racing, actorOf(a), b);
    expect(r).toMatchObject({ ok: true, replayed: true });
    expect(must(r).id).toBe(first.id);
    expect(lookups).toBe(2);
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("tries only once more after a lost race", async () => {
    const { store, a } = await build();
    let saves = 0;
    const alwaysClash: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            expenses: {
              ...tx.expenses,
              create: async () => {
                saves += 1;
                throw new DuplicateExpenseKeyError();
              },
            },
          }),
        ),
    };
    await expect(createExpense(alwaysClash, actorOf(a), body())).rejects.toBeInstanceOf(DuplicateExpenseKeyError);
    expect(saves).toBe(2);
  });

  it("saves one expense when two identical requests arrive together", async () => {
    const { store, a } = await build();
    const b = body();
    const [r1, r2] = await Promise.all([createExpense(store, actorOf(a), b), createExpense(store, actorOf(a), b)]);
    expect(must(r1).id).toBe(must(r2).id);
    expect([r1, r2].filter((r) => r.ok && r.replayed)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("checks the permission before the key", async () => {
    const { store, viewOnly } = await build();
    expect(await createExpense(store, actorOf(viewOnly), body({ idempotencyKey: undefined }))).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("checks the key before the other input", async () => {
    const { store, a } = await build();
    expect(await createExpense(store, actorOf(a), { category: "Loan", amount: "x" })).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "missing_idempotency_key",
    });
  });

  it("refuses a missing key and saves nothing", async () => {
    const { store, a } = await build();
    expect(await createExpense(store, actorOf(a), body({ idempotencyKey: undefined }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "missing_idempotency_key",
    });
    expect(await store.expenses.list({})).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it.each([
    { label: "empty", value: "" },
    { label: "null", value: null },
    { label: "a number", value: 1234567890123456 },
    { label: "15 characters", value: "k".repeat(15) },
    { label: "65 characters", value: "k".repeat(65) },
    { label: "holding a space", value: "expense key 00001" },
  ])("refuses a key that is $label", async ({ value }) => {
    const { store, a } = await build();
    expect(await createExpense(store, actorOf(a), body({ idempotencyKey: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_idempotency_key",
    });
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("accepts keys of 16 and 64 characters, with dashes and underscores", async () => {
    const { store, a } = await build();
    for (const k of ["k".repeat(16), "k".repeat(64), "a-b_C-9".padEnd(20, "x")]) {
      expect(await createExpense(store, actorOf(a), body({ idempotencyKey: k }))).toMatchObject({
        ok: true,
        replayed: false,
      });
    }
  });

  it("never repeats the key in a refusal or in the audit entry", async () => {
    const { store, a } = await build();
    const k = newKey();
    must(await createExpense(store, actorOf(a), body({ idempotencyKey: k })));
    const r = await createExpense(store, actorOf(a), body({ idempotencyKey: k, amount: "1" }));
    expect(JSON.stringify(r)).not.toContain(k);
    expect(JSON.stringify(await store.audit.listByActor(a.id))).not.toContain(k);
  });
});

function failingInside(store: Store, part: "expenses" | "audit"): Store {
  return {
    ...store,
    transaction: (fn) =>
      store.transaction((tx) =>
        fn(
          part === "expenses"
            ? { ...tx, expenses: { ...tx.expenses, create: () => Promise.reject(new Error("expenses down")) } }
            : { ...tx, audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) } },
        ),
      ),
  };
}

describe("createExpense: one transaction (D-45)", () => {
  it("writes no audit entry when the expense write fails", async () => {
    const { store, a } = await build();
    await expect(createExpense(failingInside(store, "expenses"), actorOf(a), body())).rejects.toThrow("expenses down");
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("saves no expense when the audit write fails", async () => {
    const { store, a } = await build();
    await expect(createExpense(failingInside(store, "audit"), actorOf(a), body())).rejects.toThrow("audit down");
    expect(await store.expenses.list({})).toEqual([]);
  });
});

describe("createExpense on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("saves the expense and the audit entry", async () => {
    const { a } = await build(store);
    const r = must(await createExpense(store, actorOf(a), body({ category: "Others", narration: "fuel" })));
    expect(await store.expenses.findById(r.id)).toMatchObject({
      category: "Others",
      amount: 1_500_000n,
      narration: "fuel",
      loanId: null,
    });
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["expense.created"]);
  });

  it("saves no expense when the audit write fails", async () => {
    const { a } = await build(store);
    await expect(createExpense(failingInside(store, "audit"), actorOf(a), body())).rejects.toThrow("audit down");
    expect(await store.expenses.list({ createdById: a.id })).toEqual([]);
  });

  it("gives one expense and the same answer to five requests with one key at once", async () => {
    const { a } = await build(store);
    const b = body();
    const results = await Promise.all(Array.from({ length: 5 }, () => createExpense(store, actorOf(a), b)));
    const ids = results.map((r) => must(r).id);
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(await store.expenses.list({ createdById: a.id })).toHaveLength(1);
    expect((await store.audit.listByActor(a.id)).filter((e) => e.entityId === ids[0])).toHaveLength(1);
  });

  it("returns a repeat with the same view, read back from the database", async () => {
    const { a } = await build(store);
    const b = body({ category: "Others", narration: "fuel", description: "generator" });
    const first = must(await createExpense(store, actorOf(a), b));
    const again = await createExpense(store, actorOf(a), b);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again)).toEqual(first);
    expect(await createExpense(store, actorOf(a), { ...b, amount: "1" })).toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
  });
});

/** A Staff user who may record and view expenses. Fictional data only (D-08). */
const makeRecorder = (store: Store, name: string) =>
  store.users.create({
    email: `${name}-${Math.random().toString(36).slice(2)}@example.test`,
    passwordHash: "not-a-real-hash",
    displayName: name,
    role: "STAFF",
    permissions: ["expenses.create", "expenses.view"],
  });

/** Three expenses: two by Staff b (Others by bank, Allowances in cash), one by the Super Admin. */
async function buildList(store: Store = createMemoryStore()) {
  const base = await build(store);
  const b = await makeRecorder(store, "staff-b");
  const c = await makeRecorder(store, "staff-c");
  const b1 = must(
    await createExpense(store, actorOf(b), body({ category: "Others", narration: "fuel", amount: "0.10", method: "BANK_TRANSFER" })),
  );
  const b2 = must(await createExpense(store, actorOf(b), body({ category: "Allowances", amount: "0.20" })));
  const ad = must(await createExpense(store, actorOf(base.admin), body({ amount: "1000000.05" })));
  return { ...base, b, c, b1, b2, ad };
}

function mustList(r: Awaited<ReturnType<typeof listExpenses>>) {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason} ${r.code ?? ""}`);
  return r.value;
}

const ids = (list: { expenses: ExpenseView[] }) => list.expenses.map((e) => e.id).sort();

/** The list with its expenses sorted by id: expenses saved in the same millisecond have no fixed order. */
const sorted = (list: { expenses: ExpenseView[]; total: string }) => ({
  expenses: [...list.expenses].sort((x, y) => x.id.localeCompare(y.id)),
  total: list.total,
});
const sameAs = (expenses: ExpenseView[], total: string) => sorted({ expenses, total });

/** The store with a list that records every query it gets. */
function spying(store: Store): { store: Store; seen: ExpenseListQuery[] } {
  const seen: ExpenseListQuery[] = [];
  return {
    seen,
    store: {
      ...store,
      expenses: {
        ...store.expenses,
        list: (q) => {
          seen.push(q);
          return store.expenses.list(q);
        },
      },
    },
  };
}

describe("listExpenses: who sees what (DR-13)", () => {
  it("refuses Staff without expenses.view, before checking the query", async () => {
    const { store, a } = await buildList();
    expect(await listExpenses(store, actorOf(a), {})).toEqual({ ok: false, reason: "forbidden" });
    expect(await listExpenses(store, actorOf(a), { category: "Fuel", from: "x" })).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses an inactive Staff user", async () => {
    const { store, b } = await buildList();
    expect(await listExpenses(store, actorOf({ ...b, isActive: false }), {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it("gives Staff only the expenses they recorded, oldest first, with views and the total", async () => {
    const { store, b, b1, b2 } = await buildList();
    const list = mustList(await listExpenses(store, actorOf(b), {}));
    expect(sorted(list)).toEqual(sameAs([b1, b2], "0.30"));
    const times = list.expenses.map((e) => e.createdAt);
    expect(times).toEqual([...times].sort());
    expect(Object.keys(list)).toEqual(["expenses", "total"]);
  });

  it("ignores a Staff createdById filter, even for another user", async () => {
    const { store, admin, b } = await buildList();
    expect(ids(mustList(await listExpenses(store, actorOf(b), { createdById: admin.id })))).toEqual(
      ids(mustList(await listExpenses(store, actorOf(b), {}))),
    );
  });

  it("gives Staff who recorded nothing an empty list and a zero total", async () => {
    const { store, c, viewOnly } = await buildList();
    expect(mustList(await listExpenses(store, actorOf(c), {}))).toEqual({ expenses: [], total: "0.00" });
    expect(mustList(await listExpenses(store, actorOf(viewOnly), {}))).toEqual({ expenses: [], total: "0.00" });
  });

  it("gives the Super Admin every expense, or the ones of one creator", async () => {
    const { store, admin, b, b1, b2, ad } = await buildList();
    const all = mustList(await listExpenses(store, actorOf(admin), {}));
    expect(ids(all)).toEqual([b1.id, b2.id, ad.id].sort());
    expect(all.total).toBe("1000000.35");
    expect(sorted(mustList(await listExpenses(store, actorOf(admin), { createdById: b.id })))).toEqual(
      sameAs([b1, b2], "0.30"),
    );
    expect(mustList(await listExpenses(store, actorOf(admin), { createdById: "no-such-user" }))).toEqual({
      expenses: [],
      total: "0.00",
    });
  });

  it("keeps the store's order, oldest first, without sorting or reversing it", async () => {
    const { store, admin } = await buildList();
    const fromStore = (await store.expenses.list({})).map((e) => e.id);
    expect(fromStore).toHaveLength(3);
    expect(mustList(await listExpenses(store, actorOf(admin), {})).expenses.map((e) => e.id)).toEqual(fromStore);
  });

  it("leaves a soft-deleted expense out of the list and the total (DR-12)", async () => {
    const { store, admin, b, b2, ad } = await buildList();
    await store.expenses.softDelete(b2.id, admin.id);
    const all = mustList(await listExpenses(store, actorOf(admin), {}));
    expect(ids(all)).not.toContain(b2.id);
    expect(all.total).toBe("1000000.15");
    expect(mustList(await listExpenses(store, actorOf(b), { category: "Allowances" }))).toEqual({
      expenses: [],
      total: "0.00",
    });
    expect(sorted(mustList(await listExpenses(store, actorOf(admin), { createdById: admin.id })))).toEqual(
      sameAs([ad], "1000000.05"),
    );
  });

  it("writes no audit entry", async () => {
    const { store, admin, b } = await buildList();
    const before = (await store.audit.listByActor(b.id)).length;
    mustList(await listExpenses(store, actorOf(b), {}));
    mustList(await listExpenses(store, actorOf(admin), {}));
    expect(await store.audit.listByActor(b.id)).toHaveLength(before);
    expect((await store.audit.listByActor(admin.id)).map((e) => e.action)).toEqual(["expense.created"]);
  });
});

describe("listExpenses: filters (D-66)", () => {
  it("filters by category and by method, and both must hold", async () => {
    const { store, admin, b1, b2, ad } = await buildList();
    const as = (input: Parameters<typeof listExpenses>[2]) => listExpenses(store, actorOf(admin), input);
    expect(mustList(await as({ category: "Others" }))).toEqual({ expenses: [b1], total: "0.10" });
    expect(ids(mustList(await as({ method: "CASH" })))).toEqual([b2.id, ad.id].sort());
    expect(mustList(await as({ category: "Allowances", method: "CASH" }))).toEqual({ expenses: [b2], total: "0.20" });
    expect(mustList(await as({ category: "Allowances", method: "BANK_TRANSFER" }))).toEqual({ expenses: [], total: "0.00" });
  });

  it("accepts the system-only categories as a filter", async () => {
    const { store, admin } = await buildList();
    expect(mustList(await listExpenses(store, actorOf(admin), { category: "Loan" }))).toEqual({ expenses: [], total: "0.00" });
    expect(mustList(await listExpenses(store, actorOf(admin), { category: "Membership Withdrawal" })).total).toBe("0.00");
  });

  it("keeps the time range half-open: from is included, before is not", async () => {
    const { store, admin, b1 } = await buildList();
    const at = b1.createdAt;
    const as = (input: Parameters<typeof listExpenses>[2]) => listExpenses(store, actorOf(admin), input);
    expect(ids(mustList(await as({ from: at, before: at })))).toEqual([]);
    expect(ids(mustList(await as({ from: at, category: "Others" })))).toEqual([b1.id]);
    expect(ids(mustList(await as({ before: at, category: "Others" })))).toEqual([]);
    expect(mustList(await as({ from: "2000-01-01T00:00:00Z", before: "2100-01-01T00:00:00.000Z" })).total).toBe("1000000.35");
    expect(mustList(await as({ before: "2000-01-01T00:00:00Z" }))).toEqual({ expenses: [], total: "0.00" });
  });

  it("passes the checked filters to the store exactly", async () => {
    const { store: inner, admin, b } = await buildList();
    const { store, seen } = spying(inner);
    mustList(
      await listExpenses(store, actorOf(admin), {
        createdById: b.id,
        category: "Others",
        method: "BANK_TRANSFER",
        from: "2026-10-01T00:00:00Z",
        before: "2026-11-01T00:00:00.000Z",
      }),
    );
    mustList(await listExpenses(store, actorOf(b), { createdById: admin.id, method: "CASH" }));
    mustList(await listExpenses(store, actorOf(admin), {}));
    expect(seen).toEqual([
      {
        createdById: b.id,
        category: "Others",
        method: "BANK_TRANSFER",
        createdFrom: new Date("2026-10-01T00:00:00.000Z"),
        createdBefore: new Date("2026-11-01T00:00:00.000Z"),
      },
      { createdById: b.id, method: "CASH" },
      {},
    ]);
  });

  it("accepts a createdById of exactly 100 characters", async () => {
    const { store: inner, admin } = await buildList();
    const { store, seen } = spying(inner);
    const longest = "u".repeat(100);
    expect(mustList(await listExpenses(store, actorOf(admin), { createdById: longest }))).toEqual({
      expenses: [],
      total: "0.00",
    });
    expect(seen).toEqual([{ createdById: longest }]);
  });

  it.each([
    { label: "an empty createdById", input: { createdById: "" }, code: "invalid_created_by_id" },
    { label: "a createdById over 100 characters", input: { createdById: "u".repeat(101) }, code: "invalid_created_by_id" },
    { label: "a createdById that is not text", input: { createdById: ["a", "b"] }, code: "invalid_created_by_id" },
    { label: "an unknown category", input: { category: "Fuel" }, code: "invalid_category" },
    { label: "a category in the wrong case", input: { category: "others" }, code: "invalid_category" },
    { label: "a repeated category", input: { category: ["Others", "Loan"] }, code: "invalid_category" },
    { label: "a method in the wrong case", input: { method: "cash" }, code: "invalid_method" },
    { label: "an empty method", input: { method: "" }, code: "invalid_method" },
    { label: "a date without a time", input: { from: "2026-10-01" }, code: "invalid_from" },
    { label: "a time with an offset", input: { from: "2026-10-01T00:00:00+01:00" }, code: "invalid_from" },
    { label: "a day that does not exist", input: { from: "2026-02-30T00:00:00Z" }, code: "invalid_from" },
    { label: "a month that does not exist", input: { from: "2026-13-01T00:00:00Z" }, code: "invalid_from" },
    { label: "an hour that does not exist", input: { from: "2026-10-01T24:00:00Z" }, code: "invalid_from" },
    { label: "a time with 2 decimals", input: { from: "2026-10-01T00:00:00.00Z" }, code: "invalid_from" },
    { label: "a from that is a number", input: { from: 1_790_000_000_000 }, code: "invalid_from" },
    { label: "a bad before", input: { before: "yesterday" }, code: "invalid_before" },
    { label: "a before with a space", input: { before: " 2026-10-01T00:00:00Z" }, code: "invalid_before" },
    {
      label: "from after before",
      input: { from: "2026-10-02T00:00:00Z", before: "2026-10-01T23:59:59.999Z" },
      code: "invalid_range",
    },
  ])("refuses $label with its code, without reading the store", async ({ input, code }) => {
    const { store: inner, b } = await buildList();
    const { store, seen } = spying(inner);
    expect(await listExpenses(store, actorOf(b), input)).toEqual({ ok: false, reason: "invalid_input", code });
    expect(seen).toEqual([]);
  });

  it("checks the query in order: createdById, category, method, from, before", async () => {
    const { store, admin } = await buildList();
    const bad = { createdById: "", category: "x", method: "x", from: "x", before: "x" };
    const codes: string[] = [];
    let input: Record<string, unknown> = { ...bad };
    for (const field of Object.keys(bad)) {
      const r = await listExpenses(store, actorOf(admin), input);
      if (r.ok) throw new Error("expected a refusal");
      codes.push(r.code ?? "");
      input = Object.fromEntries(Object.entries(input).filter(([k]) => k !== field));
    }
    expect(codes).toEqual(["invalid_created_by_id", "invalid_category", "invalid_method", "invalid_from", "invalid_before"]);
  });
});

describe("listExpenses on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("gives the same scope, filters and totals as the memory store", async () => {
    const { admin, b, b1, b2, ad } = await buildList(store);
    expect(sorted(mustList(await listExpenses(store, actorOf(b), { createdById: admin.id })))).toEqual(
      sameAs([b1, b2], "0.30"),
    );
    expect(mustList(await listExpenses(store, actorOf(admin), { category: "Others", method: "BANK_TRANSFER" }))).toEqual({
      expenses: [b1],
      total: "0.10",
    });
    const range = { from: b1.createdAt, before: "2100-01-01T00:00:00Z" };
    const listed = mustList(await listExpenses(store, actorOf(admin), { ...range, createdById: admin.id }));
    expect(listed).toEqual({ expenses: [ad], total: "1000000.05" });
    expect(mustList(await listExpenses(store, actorOf(admin), { from: b1.createdAt, before: b1.createdAt }))).toEqual({
      expenses: [],
      total: "0.00",
    });
  });
});

/**
 * For deleteExpense (5.9b): Staff d may record and delete, Staff e may record and delete too.
 * d records one expense, e one, and the Super Admin gives a loan (its Loan expense) and saves a
 * pay-off expense straight in the store. Fictional data only (D-08).
 */
async function buildDelete(store: Store = createMemoryStore()) {
  const base = await build(store);
  const deleter = (name: string) =>
    store.users.create({
      email: `${name}-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role: "STAFF",
      permissions: ["expenses.create", "expenses.delete"],
    });
  const d = await deleter("staff-d");
  const e = await deleter("staff-e");
  const d1 = must(await createExpense(store, actorOf(d), body({ category: "Allowances", amount: "0.20" })));
  const e1 = must(await createExpense(store, actorOf(e), body({ amount: "0.30" })));
  const member = await store.members.create({
    fullName: "Delete Member",
    phone: "",
    address: "",
    occupation: "",
    createdById: base.admin.id,
  });
  const loan = await store.loans.create({ memberId: member.id, principal: 30_000_000n, createdById: base.admin.id });
  const loanExpense = await store.expenses.create({
    category: "Loan",
    amount: 30_000_000n,
    method: "CASH",
    loanId: loan.id,
    createdById: base.admin.id,
  });
  const payOff = await store.expenses.create({
    category: "Membership Withdrawal",
    amount: 2_500_000n,
    method: "CASH",
    createdById: base.admin.id,
  });
  return { ...base, d, e, d1, e1, loanExpense, payOff };
}

/** The store, with one part failing inside the transaction (softDelete or the audit write). */
function failingDelete(store: Store, part: "expenses" | "audit"): Store {
  return {
    ...store,
    transaction: (fn) =>
      store.transaction((tx) =>
        fn(
          part === "expenses"
            ? { ...tx, expenses: { ...tx.expenses, softDelete: () => Promise.reject(new Error("expenses down")) } }
            : { ...tx, audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) } },
        ),
      ),
  };
}

const deletedActions = async (store: Store, actorId: string) =>
  (await store.audit.listByActor(actorId)).filter((x) => x.action === "expense.deleted");

describe("deleteExpense: who may delete what (5.9b, DR-13)", () => {
  it("refuses Staff without expenses.delete, before checking the id, and changes nothing", async () => {
    const { store, a, d1 } = await buildDelete();
    expect(await deleteExpense(store, actorOf(a), d1.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await deleteExpense(store, actorOf(a), 42)).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedAt: null, deletedById: null });
    expect(await deletedActions(store, a.id)).toEqual([]);
  });

  it("refuses an inactive Staff user", async () => {
    const { store, d, d1 } = await buildDelete();
    expect(await deleteExpense(store, actorOf({ ...d, isActive: false }), d1.id)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedAt: null });
  });

  it("lets Staff delete an expense they recorded: deleted, left out of the list, one audit entry", async () => {
    const { store, d, d1 } = await buildDelete();
    expect(await deleteExpense(store, actorOf(d), d1.id)).toEqual({ ok: true });
    const saved = await store.expenses.findById(d1.id);
    expect(saved?.deletedAt).toBeInstanceOf(Date);
    expect(saved?.deletedById).toBe(d.id);
    expect((await store.expenses.list({})).map((x) => x.id)).not.toContain(d1.id);
    const entries = await deletedActions(store, d.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: d.id,
      action: "expense.deleted",
      entityType: "Expense",
      entityId: d1.id,
      detail: "category=Allowances amount_kobo=20",
    });
  });

  it("gives Staff not_found for an expense someone else recorded, and changes nothing", async () => {
    const { store, d, e1, loanExpense } = await buildDelete();
    expect(await deleteExpense(store, actorOf(d), e1.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteExpense(store, actorOf(d), loanExpense.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await store.expenses.findById(e1.id)).toMatchObject({ deletedAt: null, deletedById: null });
    expect(await deletedActions(store, d.id)).toEqual([]);
  });

  it("lets the Super Admin delete an expense Staff recorded", async () => {
    const { store, admin, e1 } = await buildDelete();
    expect(await deleteExpense(store, actorOf(admin), e1.id)).toEqual({ ok: true });
    expect(await store.expenses.findById(e1.id)).toMatchObject({ deletedById: admin.id });
    expect((await deletedActions(store, admin.id)).map((x) => x.entityId)).toEqual([e1.id]);
  });

  it.each([
    { label: "an unknown id", id: "no-such-expense" },
    { label: "an empty id", id: "" },
    { label: "an id that is not text", id: 42 },
    { label: "no id", id: undefined },
  ])("gives not_found for $label", async ({ id }) => {
    const { store, admin } = await buildDelete();
    expect(await deleteExpense(store, actorOf(admin), id)).toEqual({ ok: false, reason: "not_found" });
    expect(await deletedActions(store, admin.id)).toEqual([]);
  });

  it("gives not_found for an expense already deleted, keeping the first time and user, with no second entry", async () => {
    const { store, admin, d, d1 } = await buildDelete();
    expect(await deleteExpense(store, actorOf(d), d1.id)).toEqual({ ok: true });
    const first = await store.expenses.findById(d1.id);
    expect(await deleteExpense(store, actorOf(admin), d1.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await deleteExpense(store, actorOf(d), d1.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await store.expenses.findById(d1.id)).toEqual(first);
    expect(await deletedActions(store, d.id)).toHaveLength(1);
    expect(await deletedActions(store, admin.id)).toEqual([]);
  });
});

describe("deleteExpense: Loan-linked and pay-off expenses stay (DR-12)", () => {
  it("refuses a Loan-linked expense with loan_linked, even for the Super Admin", async () => {
    const { store, admin, loanExpense } = await buildDelete();
    expect(await deleteExpense(store, actorOf(admin), loanExpense.id)).toEqual({
      ok: false,
      reason: "not_deletable",
      code: "loan_linked",
    });
    expect(await store.expenses.findById(loanExpense.id)).toMatchObject({ deletedAt: null, deletedById: null });
    expect(await deletedActions(store, admin.id)).toEqual([]);
  });

  it("refuses a Loan expense without a loan link with loan_linked", async () => {
    const { store, admin } = await buildDelete();
    const unlinked = await store.expenses.create({
      category: "Loan",
      amount: 100n,
      method: "CASH",
      createdById: admin.id,
    });
    expect(await deleteExpense(store, actorOf(admin), unlinked.id)).toEqual({
      ok: false,
      reason: "not_deletable",
      code: "loan_linked",
    });
    expect(await store.expenses.findById(unlinked.id)).toMatchObject({ deletedAt: null });
  });

  it("refuses an expense of another category that names a loan with loan_linked", async () => {
    const { store, admin } = await buildDelete();
    const member = await store.members.create({
      fullName: "Second Member",
      phone: "",
      address: "",
      occupation: "",
      createdById: admin.id,
    });
    const loan = await store.loans.create({ memberId: member.id, principal: 100n, createdById: admin.id });
    const linked = await store.expenses.create({
      category: "Allowances",
      amount: 100n,
      method: "CASH",
      loanId: loan.id,
      createdById: admin.id,
    });
    expect(await deleteExpense(store, actorOf(admin), linked.id)).toEqual({
      ok: false,
      reason: "not_deletable",
      code: "loan_linked",
    });
  });

  it("refuses a pay-off expense (Membership Withdrawal) with pay_off", async () => {
    const { store, admin, payOff } = await buildDelete();
    expect(await deleteExpense(store, actorOf(admin), payOff.id)).toEqual({
      ok: false,
      reason: "not_deletable",
      code: "pay_off",
    });
    expect(await store.expenses.findById(payOff.id)).toMatchObject({ deletedAt: null, deletedById: null });
    expect(await deletedActions(store, admin.id)).toEqual([]);
  });

  it("keeps the Loan and pay-off expenses in the list total after the refusals", async () => {
    const { store, admin, loanExpense, payOff } = await buildDelete();
    await deleteExpense(store, actorOf(admin), loanExpense.id);
    await deleteExpense(store, actorOf(admin), payOff.id);
    const listed = mustList(await listExpenses(store, actorOf(admin), {}));
    expect(ids(listed)).toEqual(expect.arrayContaining([loanExpense.id, payOff.id]));
    expect(listed.total).toBe("325000.50");
  });
});

describe("deleteExpense: one transaction (D-45)", () => {
  it("writes no audit entry when the delete fails", async () => {
    const { store, d, d1 } = await buildDelete();
    await expect(deleteExpense(failingDelete(store, "expenses"), actorOf(d), d1.id)).rejects.toThrow("expenses down");
    expect(await deletedActions(store, d.id)).toEqual([]);
  });

  it("leaves the expense not deleted when the audit write fails", async () => {
    const { store, d, d1 } = await buildDelete();
    await expect(deleteExpense(failingDelete(store, "audit"), actorOf(d), d1.id)).rejects.toThrow("audit down");
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedAt: null, deletedById: null });
    expect((await store.expenses.list({})).map((x) => x.id)).toContain(d1.id);
  });

  it("gives not_found, with no audit entry, when another request deleted it after the lookup", async () => {
    const { store, d, d1 } = await buildDelete();
    const racing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) => fn({ ...tx, expenses: { ...tx.expenses, softDelete: () => Promise.resolve(null) } })),
    };
    expect(await deleteExpense(racing, actorOf(d), d1.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await deletedActions(store, d.id)).toEqual([]);
  });
});

describe("deleteExpense on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("deletes with one audit entry and refuses the Loan and pay-off expenses", async () => {
    const { admin, d, d1, loanExpense, payOff } = await buildDelete(store);
    expect(await deleteExpense(store, actorOf(d), d1.id)).toEqual({ ok: true });
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedById: d.id });
    expect((await deletedActions(store, d.id)).map((x) => x.entityId)).toEqual([d1.id]);
    expect(await deleteExpense(store, actorOf(admin), loanExpense.id)).toMatchObject({ code: "loan_linked" });
    expect(await deleteExpense(store, actorOf(admin), payOff.id)).toMatchObject({ code: "pay_off" });
  });

  it("leaves the expense not deleted when the audit write fails", async () => {
    const { d, d1 } = await buildDelete(store);
    await expect(deleteExpense(failingDelete(store, "audit"), actorOf(d), d1.id)).rejects.toThrow("audit down");
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedAt: null, deletedById: null });
  });

  it("gives one delete and one audit entry to five requests at once", async () => {
    const { admin, e1 } = await buildDelete(store);
    const results = await Promise.all(Array.from({ length: 5 }, () => deleteExpense(store, actorOf(admin), e1.id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "not_found")).toHaveLength(4);
    expect((await deletedActions(store, admin.id)).filter((x) => x.entityId === e1.id)).toHaveLength(1);
  });
});

/**
 * For updateExpense (5.9c): Staff f and g may record and edit. f records one expense with a known
 * key, g one. The Loan and pay-off expenses come from buildDelete. Fictional data only (D-08).
 */
async function buildEdit(store: Store = createMemoryStore()) {
  const base = await buildDelete(store);
  const editor = (name: string) =>
    store.users.create({
      email: `${name}-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role: "STAFF",
      permissions: ["expenses.create", "expenses.edit"],
    });
  const f = await editor("staff-f");
  const g = await editor("staff-g");
  const f1Body = body({ category: "Allowances", amount: "0.20" });
  const f1 = must(await createExpense(store, actorOf(f), f1Body));
  const g1 = must(await createExpense(store, actorOf(g), body({ amount: "0.40" })));
  return { ...base, f, g, f1, f1Body, g1 };
}

/** A full edit body (PUT): every field is sent. */
const edit = (over: Record<string, unknown> = {}) => ({
  category: "Asset Purchase",
  amount: "1500.75",
  method: "BANK_TRANSFER",
  description: "  chairs  ",
  ...over,
});

const EDIT_DETAIL =
  "old_category=Allowances old_amount_kobo=20 old_method=CASH " +
  "new_category=Asset Purchase new_amount_kobo=150075 new_method=BANK_TRANSFER " +
  "description_changed=true narration_changed=false";

const updatedActions = async (store: Store, actorId: string) =>
  (await store.audit.listByActor(actorId)).filter((x) => x.action === "expense.updated");

function mustEdit(r: Awaited<ReturnType<typeof updateExpense>>): ExpenseView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason} ${r.code ?? ""}`);
  return r.value;
}

describe("updateExpense: who may edit what (5.9c, DR-13)", () => {
  it("refuses Staff without expenses.edit, before checking the id and the body, and changes nothing", async () => {
    const { store, a, f1 } = await buildEdit();
    const before = await store.expenses.findById(f1.id);
    expect(await updateExpense(store, actorOf(a), f1.id, edit())).toEqual({ ok: false, reason: "forbidden" });
    expect(await updateExpense(store, actorOf(a), 42, {})).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.expenses.findById(f1.id)).toEqual(before);
    expect(await updateExpense(store, actorOf(a), "x", edit())).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses an inactive Staff user", async () => {
    const { store, f, f1 } = await buildEdit();
    expect(await updateExpense(store, actorOf({ ...f, isActive: false }), f1.id, edit())).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await store.expenses.findById(f1.id)).toMatchObject({ category: "Allowances", amount: 20n });
  });

  it("lets Staff edit an expense they recorded: new values, same creator, date and key, one audit entry", async () => {
    const { store, f, f1 } = await buildEdit();
    const before = await store.expenses.findById(f1.id);
    const r = mustEdit(await updateExpense(store, actorOf(f), f1.id, edit()));
    expect(r).toEqual({
      id: f1.id,
      category: "Asset Purchase",
      amount: "1500.75",
      method: "BANK_TRANSFER",
      description: "chairs",
      narration: "",
      createdById: f.id,
      createdAt: f1.createdAt,
    });
    const saved = await store.expenses.findById(f1.id);
    expect(saved).toEqual({
      ...before,
      category: "Asset Purchase",
      amount: 150075n,
      method: "BANK_TRANSFER",
      description: "chairs",
    });
    const entries = await updatedActions(store, f.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: f.id,
      action: "expense.updated",
      entityType: "Expense",
      entityId: f1.id,
      detail: EDIT_DETAIL,
    });
  });

  it("changes the list total to the edited amount", async () => {
    const { store, admin, f, f1 } = await buildEdit();
    expect(mustList(await listExpenses(store, actorOf(admin), {})).total).toBe("325001.10");
    mustEdit(await updateExpense(store, actorOf(f), f1.id, edit()));
    const listed = mustList(await listExpenses(store, actorOf(admin), {}));
    expect(listed.expenses.find((x) => x.id === f1.id)?.amount).toBe("1500.75");
    expect(listed.total).toBe("326501.65");
  });

  it("gives Staff not_found for an expense someone else recorded, and changes nothing", async () => {
    const { store, f, g1, loanExpense } = await buildEdit();
    const before = await store.expenses.findById(g1.id);
    expect(await updateExpense(store, actorOf(f), g1.id, edit())).toEqual({ ok: false, reason: "not_found" });
    expect(await updateExpense(store, actorOf(f), loanExpense.id, edit())).toEqual({ ok: false, reason: "not_found" });
    expect(await store.expenses.findById(g1.id)).toEqual(before);
    expect(await updatedActions(store, f.id)).toEqual([]);
  });

  it("lets the Super Admin edit an expense Staff recorded", async () => {
    const { store, admin, f, f1 } = await buildEdit();
    const r = mustEdit(await updateExpense(store, actorOf(admin), f1.id, edit()));
    expect(r.createdById).toBe(f.id);
    expect((await updatedActions(store, admin.id)).map((x) => [x.entityId, x.detail])).toEqual([[f1.id, EDIT_DETAIL]]);
    expect(await updatedActions(store, f.id)).toEqual([]);
  });

  it.each([
    { label: "an unknown id", id: "no-such-expense" },
    { label: "an empty id", id: "" },
    { label: "an id that is not text", id: 42 },
    { label: "no id", id: undefined },
  ])("gives not_found for $label", async ({ id }) => {
    const { store, admin } = await buildEdit();
    expect(await updateExpense(store, actorOf(admin), id, edit())).toEqual({ ok: false, reason: "not_found" });
    expect(await updatedActions(store, admin.id)).toEqual([]);
  });

  it("gives not_found for a deleted expense, and changes nothing", async () => {
    const { store, admin, d, d1 } = await buildEdit();
    expect(await deleteExpense(store, actorOf(d), d1.id)).toEqual({ ok: true });
    const before = await store.expenses.findById(d1.id);
    expect(await updateExpense(store, actorOf(admin), d1.id, edit())).toEqual({ ok: false, reason: "not_found" });
    expect(await store.expenses.findById(d1.id)).toEqual(before);
    expect(await updatedActions(store, admin.id)).toEqual([]);
  });
});

describe("updateExpense: Loan-linked and pay-off expenses stay as they are (DR-12, A-177)", () => {
  it("refuses a Loan-linked expense with loan_linked, even for the Super Admin", async () => {
    const { store, admin, loanExpense } = await buildEdit();
    const before = await store.expenses.findById(loanExpense.id);
    expect(await updateExpense(store, actorOf(admin), loanExpense.id, edit())).toEqual({
      ok: false,
      reason: "not_editable",
      code: "loan_linked",
    });
    expect(await store.expenses.findById(loanExpense.id)).toEqual(before);
    expect(await updatedActions(store, admin.id)).toEqual([]);
  });

  it("refuses a Loan expense without a loan link, and another category that names a loan, with loan_linked", async () => {
    const { store, admin } = await buildEdit();
    const unlinked = await store.expenses.create({ category: "Loan", amount: 100n, method: "CASH", createdById: admin.id });
    expect(await updateExpense(store, actorOf(admin), unlinked.id, edit())).toEqual({
      ok: false,
      reason: "not_editable",
      code: "loan_linked",
    });
    const member = await store.members.create({
      fullName: "Edit Member",
      phone: "",
      address: "",
      occupation: "",
      createdById: admin.id,
    });
    const loan = await store.loans.create({ memberId: member.id, principal: 100n, createdById: admin.id });
    const linked = await store.expenses.create({
      category: "Allowances",
      amount: 100n,
      method: "CASH",
      loanId: loan.id,
      createdById: admin.id,
    });
    expect(await updateExpense(store, actorOf(admin), linked.id, edit())).toEqual({
      ok: false,
      reason: "not_editable",
      code: "loan_linked",
    });
    expect(await store.expenses.findById(linked.id)).toMatchObject({ category: "Allowances", amount: 100n });
  });

  it("refuses a pay-off expense (Membership Withdrawal) with pay_off", async () => {
    const { store, admin, payOff } = await buildEdit();
    const before = await store.expenses.findById(payOff.id);
    expect(await updateExpense(store, actorOf(admin), payOff.id, edit())).toEqual({
      ok: false,
      reason: "not_editable",
      code: "pay_off",
    });
    expect(await store.expenses.findById(payOff.id)).toEqual(before);
  });
});

describe("updateExpense: the fields (PUT, as createExpense)", () => {
  it.each([
    { label: "a system-only category (Loan)", over: { category: "Loan" }, code: "system_only" },
    { label: "a system-only category (Membership Withdrawal)", over: { category: "Membership Withdrawal" }, code: "system_only" },
    { label: "an unknown category", over: { category: "Party" }, code: "unknown_category" },
    { label: "no category", over: { category: undefined }, code: "unknown_category" },
    { label: "an unknown method", over: { method: "CHEQUE" }, code: "invalid_method" },
    { label: "no method", over: { method: undefined }, code: "invalid_method" },
    { label: "an amount that is not a naira string", over: { amount: 1500 }, code: "invalid_amount" },
    { label: "no amount", over: { amount: undefined }, code: "invalid_amount" },
    { label: "a zero amount", over: { amount: "0" }, code: "amount_not_positive" },
    { label: "a description over 200 characters", over: { description: "x".repeat(EXPENSE_TEXT_MAX + 1) }, code: "invalid_description" },
    { label: "a narration that is not text", over: { narration: 5 }, code: "invalid_narration" },
    { label: "Others without a narration", over: { category: "Others" }, code: "missing_narration" },
    { label: "a narration for another category", over: { narration: "why" }, code: "narration_not_allowed" },
  ])("refuses $label with $code, and changes nothing", async ({ over, code }) => {
    const { store, f, f1 } = await buildEdit();
    const before = await store.expenses.findById(f1.id);
    expect(await updateExpense(store, actorOf(f), f1.id, edit(over))).toEqual({
      ok: false,
      reason: "invalid_input",
      code,
    });
    expect(await store.expenses.findById(f1.id)).toEqual(before);
    expect(await updatedActions(store, f.id)).toEqual([]);
  });

  it("checks the fields before looking the expense up", async () => {
    const { store, admin } = await buildEdit();
    expect(await updateExpense(store, actorOf(admin), "no-such-expense", edit({ method: "CHEQUE" }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_method",
    });
  });

  it("accepts Others with a trimmed narration, and records that the narration changed", async () => {
    const { store, f, f1 } = await buildEdit();
    const r = mustEdit(
      await updateExpense(store, actorOf(f), f1.id, edit({ category: "Others", narration: "  tent hire  ", description: undefined })),
    );
    expect(r).toMatchObject({ category: "Others", narration: "tent hire", description: "" });
    expect((await updatedActions(store, f.id))[0]?.detail).toBe(
      "old_category=Allowances old_amount_kobo=20 old_method=CASH " +
        "new_category=Others new_amount_kobo=150075 new_method=BANK_TRANSFER " +
        "description_changed=false narration_changed=true",
    );
  });

  it("records a change of description alone", async () => {
    const { store, f, f1 } = await buildEdit();
    mustEdit(
      await updateExpense(store, actorOf(f), f1.id, { category: "Allowances", amount: "0.20", method: "CASH", description: "x" }),
    );
    expect((await updatedActions(store, f.id))[0]?.detail).toBe(
      "old_category=Allowances old_amount_kobo=20 old_method=CASH " +
        "new_category=Allowances new_amount_kobo=20 new_method=CASH " +
        "description_changed=true narration_changed=false",
    );
  });

  it.each([
    { label: "the category", over: { category: "Expenses" } },
    { label: "the amount", over: { amount: "0.21" } },
    { label: "the method", over: { method: "BANK_TRANSFER" } },
  ])("saves a change of $label alone", async ({ over }) => {
    const { store, f, f1 } = await buildEdit();
    mustEdit(await updateExpense(store, actorOf(f), f1.id, { category: "Allowances", amount: "0.20", method: "CASH", ...over }));
    expect(await updatedActions(store, f.id)).toHaveLength(1);
  });

  it("writes nothing and returns the expense for an edit that changes nothing", async () => {
    const { store, f, f1 } = await buildEdit();
    const before = await store.expenses.findById(f1.id);
    const unchanged = { category: "Allowances", amount: "0.2", method: "CASH", description: "  ", narration: null };
    expect(await updateExpense(store, actorOf(f), f1.id, unchanged)).toEqual({ ok: true, value: f1 });
    expect(await store.expenses.findById(f1.id)).toEqual(before);
    expect(await updatedActions(store, f.id)).toEqual([]);
  });

  it("returns the edited expense to a repeat of the first request with the same key (A-175, A-177)", async () => {
    const { store, f, f1, f1Body } = await buildEdit();
    const edited = mustEdit(await updateExpense(store, actorOf(f), f1.id, edit()));
    const repeat = await createExpense(store, actorOf(f), f1Body);
    expect(repeat).toEqual({ ok: true, value: edited, replayed: true });
    expect((await store.expenses.list({ createdById: f.id })).map((x) => x.id)).toEqual([f1.id]);
  });
});

/** The store, with one part failing inside the transaction (update or the audit write). */
function failingEdit(store: Store, part: "expenses" | "audit"): Store {
  return {
    ...store,
    transaction: (fn) =>
      store.transaction((tx) =>
        fn(
          part === "expenses"
            ? { ...tx, expenses: { ...tx.expenses, update: () => Promise.reject(new Error("expenses down")) } }
            : { ...tx, audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) } },
        ),
      ),
  };
}

describe("updateExpense: one transaction (D-45)", () => {
  it("writes no audit entry when the change fails", async () => {
    const { store, f, f1 } = await buildEdit();
    await expect(updateExpense(failingEdit(store, "expenses"), actorOf(f), f1.id, edit())).rejects.toThrow(
      "expenses down",
    );
    expect(await updatedActions(store, f.id)).toEqual([]);
  });

  it("leaves the expense as it was when the audit write fails", async () => {
    const { store, f, f1 } = await buildEdit();
    const before = await store.expenses.findById(f1.id);
    await expect(updateExpense(failingEdit(store, "audit"), actorOf(f), f1.id, edit())).rejects.toThrow("audit down");
    expect(await store.expenses.findById(f1.id)).toEqual(before);
  });

  it("gives not_found, with no audit entry, when another request deleted it after the lookup", async () => {
    const { store, f, f1 } = await buildEdit();
    const racing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) => fn({ ...tx, expenses: { ...tx.expenses, update: () => Promise.resolve(null) } })),
    };
    expect(await updateExpense(racing, actorOf(f), f1.id, edit())).toEqual({ ok: false, reason: "not_found" });
    expect(await updatedActions(store, f.id)).toEqual([]);
  });
});

describe("updateExpense on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("edits with one audit entry, reads the change back and refuses the Loan and pay-off expenses", async () => {
    const { admin, f, f1, loanExpense, payOff } = await buildEdit(store);
    const r = mustEdit(await updateExpense(store, actorOf(f), f1.id, edit()));
    expect(await store.expenses.findById(f1.id)).toMatchObject({
      category: "Asset Purchase",
      amount: 150075n,
      method: "BANK_TRANSFER",
      description: "chairs",
      createdById: f.id,
    });
    expect(r.amount).toBe("1500.75");
    expect((await updatedActions(store, f.id)).map((x) => x.detail)).toEqual([EDIT_DETAIL]);
    expect(await updateExpense(store, actorOf(admin), loanExpense.id, edit())).toMatchObject({ code: "loan_linked" });
    expect(await updateExpense(store, actorOf(admin), payOff.id, edit())).toMatchObject({ code: "pay_off" });
  });

  it("leaves the expense as it was when the audit write fails", async () => {
    const { f, f1 } = await buildEdit(store);
    const before = await store.expenses.findById(f1.id);
    await expect(updateExpense(failingEdit(store, "audit"), actorOf(f), f1.id, edit())).rejects.toThrow("audit down");
    expect(await store.expenses.findById(f1.id)).toEqual(before);
  });

  it("gives not_found for a deleted expense", async () => {
    const { admin, d, d1 } = await buildEdit(store);
    expect(await deleteExpense(store, actorOf(d), d1.id)).toEqual({ ok: true });
    expect(await updateExpense(store, actorOf(admin), d1.id, edit())).toEqual({ ok: false, reason: "not_found" });
  });
});
