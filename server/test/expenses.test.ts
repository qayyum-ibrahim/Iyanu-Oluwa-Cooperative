import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MANUAL_EXPENSE_CATEGORIES } from "../src/expense-categories.js";
import {
  createExpense,
  EXPENSE_TEXT_MAX,
  type ExpenseActor,
  type ExpenseResult,
  type ExpenseView,
} from "../src/expenses.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPrismaStore } from "../src/prisma-store.js";
import { DuplicateExpenseKeyError, type Role, type Store, type UserRecord } from "../src/store.js";
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
