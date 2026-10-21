import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subjectOf } from "../src/guards.js";
import {
  disburseLoan,
  isLoanActive,
  loanOutstanding,
  LOAN_TEXT_MAX,
  type LoanActor,
  type LoanResult,
  type LoanView,
} from "../src/loans.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPrismaStore } from "../src/prisma-store.js";
import type { LoanRecord, PaymentRecord, Role, Store, UserRecord } from "../src/store.js";
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
  const a = await make("staff-a", "STAFF", ["loans.disburse"]);
  const b = await make("staff-b", "STAFF", ["loans.disburse"]);
  const createOnly = await make("create-only", "STAFF", ["loans.create", "members.view"]);
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({
      fullName,
      phone: "08000000001",
      address: "1 Test Street",
      occupation: "Trader",
      createdById,
    });
  /** A payment with one line linked to a loan, saved straight through the store. */
  const repay = (memberId: string, loanId: string, amount: bigint, createdById: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      total: amount,
      lines: [{ category: "Loan Repaid", amount, loanId }],
      createdById,
    });
  return { store, admin, a, b, createOnly, addMember, repay };
}

const actorOf = (u: UserRecord): LoanActor => ({ id: u.id, subject: subjectOf(u) });

// The DR-08 example: a ₦300,000 loan.
const loanBody = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  memberId,
  principal: "300000",
  method: "BANK_TRANSFER",
  ...over,
});

function must(r: LoanResult): LoanView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

describe("disburseLoan: success", () => {
  it("saves the loan, one Loan expense and the view for Staff on their own member", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(
      await disburseLoan(
        store,
        actorOf(a),
        loanBody(m.id, { interestNote: "  5% flat, information only  ", notes: " first loan " }),
      ),
    );
    expect(r).toMatchObject({
      memberId: m.id,
      membershipId: "IO-001",
      principal: "300000.00",
      interestNote: "5% flat, information only",
      notes: "first loan",
      createdById: a.id,
    });
    expect(Object.keys(r).sort()).toEqual([
      "createdAt",
      "createdById",
      "expenseId",
      "id",
      "interestNote",
      "memberId",
      "membershipId",
      "notes",
      "principal",
    ]);
    expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);

    const loans = await store.loans.listByMember(m.id);
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ id: r.id, principal: 30_000_000n, createdById: a.id });

    const expenses = await store.expenses.list({});
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      id: r.expenseId,
      category: "Loan",
      amount: 30_000_000n,
      method: "BANK_TRANSFER",
      description: "",
      narration: "",
      loanId: r.id,
      createdById: a.id,
      deletedAt: null,
    });
  });

  it("saves empty notes when none are given, and accepts CASH", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await disburseLoan(store, actorOf(a), loanBody(m.id, { method: "CASH", notes: null })));
    expect(r.interestNote).toBe("");
    expect(r.notes).toBe("");
    expect((await store.expenses.list({}))[0]?.method).toBe("CASH");
  });

  it("keeps the largest allowed amount and the smallest (1 kobo) exact", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    expect(must(await disburseLoan(store, actorOf(a), loanBody(m1.id, { principal: "999999999999.99" }))).principal)
      .toBe("999999999999.99");
    expect(must(await disburseLoan(store, actorOf(a), loanBody(m2.id, { principal: "0.01" }))).principal)
      .toBe("0.01");
    expect((await store.loans.listByMember(m1.id))[0]?.principal).toBe(99_999_999_999_999n);
    expect((await store.loans.listByMember(m2.id))[0]?.principal).toBe(1n);
  });

  it("lets the Super Admin give a loan to a Staff member, and logs the caller", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await disburseLoan(store, actorOf(admin), loanBody(m.id)));
    expect(r.createdById).toBe(admin.id);
    expect((await store.expenses.list({}))[0]?.createdById).toBe(admin.id);
    expect((await store.audit.listByActor(admin.id)).map((e) => e.action)).toEqual(["loan.disbursed"]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("writes one loan.disbursed entry with ids and amounts only", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await disburseLoan(store, actorOf(a), loanBody(m.id, { notes: "private note" })));
    const entries = await store.audit.listByActor(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "loan.disbursed",
      entityType: "Loan",
      entityId: r.id,
      detail: `membership_id=IO-001 principal_kobo=30000000 expense_id=${r.expenseId}`,
    });
    const text = JSON.stringify(entries);
    expect(text).not.toContain("A One");
    expect(text).not.toContain("08000000001");
    expect(text).not.toContain("private note");
  });

  it("gives a new loan once the old one is fully repaid (DR-08)", async () => {
    const { store, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await repay(m.id, first.id, 2_000_000n, a.id);
    await repay(m.id, first.id, 28_000_000n, a.id);
    const second = must(await disburseLoan(store, actorOf(a), loanBody(m.id, { principal: "50000" })));
    expect(second.id).not.toBe(first.id);
    expect(await store.loans.listByMember(m.id)).toHaveLength(2);
    expect(await store.expenses.list({})).toHaveLength(2);
  });
});

describe("disburseLoan: one active loan (DR-08)", () => {
  it("refuses a second loan while the first is unpaid, and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toEqual({ ok: false, reason: "active_loan" });
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("refuses while 1 kobo is still outstanding (₦300,000 loan, ₦20,000 repaid gives ₦280,000)", async () => {
    const { store, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await repay(m.id, first.id, 2_000_000n, a.id);
    const [loan] = await store.loans.listByMember(m.id);
    if (loan === undefined) throw new Error("loan missing");
    expect(loanOutstanding(loan, await store.payments.listByMember(m.id))).toBe(28_000_000n);
    await repay(m.id, first.id, 27_999_999n, a.id);
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toEqual({ ok: false, reason: "active_loan" });
  });

  it("refuses a loan for the Super Admin too while the member has an active loan", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    expect(await disburseLoan(store, actorOf(admin), loanBody(m.id))).toEqual({ ok: false, reason: "active_loan" });
  });

  it("does not count another member's active loan", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    must(await disburseLoan(store, actorOf(a), loanBody(m1.id)));
    must(await disburseLoan(store, actorOf(a), loanBody(m2.id)));
  });

  it("does not count payment lines that are not linked to the loan", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await store.payments.create({
      memberId: m.id,
      method: "CASH",
      total: 30_000_000n,
      lines: [{ category: "Loan Repaid", amount: 30_000_000n }],
      createdById: a.id,
    });
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toEqual({ ok: false, reason: "active_loan" });
  });
});

describe("loanOutstanding and isLoanActive", () => {
  const loan: LoanRecord = {
    id: "loan-1",
    memberId: "m",
    principal: 30_000_000n,
    interestNote: "",
    notes: "",
    createdById: "u",
    createdAt: new Date(0),
  };
  const payment = (lines: PaymentRecord["lines"]): PaymentRecord => ({
    id: "p",
    memberId: "m",
    method: "CASH",
    total: 0n,
    lines,
    idempotencyKey: null,
    requestHash: null,
    createdById: "u",
    createdAt: new Date(0),
  });

  it("is the principal when nothing is repaid", () => {
    expect(loanOutstanding(loan, [])).toBe(30_000_000n);
    expect(isLoanActive(loan, [])).toBe(true);
  });

  it("subtracts only lines linked to this loan, across payments", () => {
    const payments = [
      payment([
        { id: "l1", category: "Loan Repaid", amount: 2_000_000n, loanId: "loan-1" },
        { id: "l2", category: "Savings", amount: 5_000_000n, loanId: null },
      ]),
      payment([
        { id: "l3", category: "Loan Repaid", amount: 1_000_000n, loanId: "loan-1" },
        { id: "l4", category: "Loan Repaid", amount: 9_000_000n, loanId: "loan-2" },
      ]),
    ];
    expect(loanOutstanding(loan, payments)).toBe(27_000_000n);
    expect(isLoanActive(loan, payments)).toBe(true);
  });

  it("is not active at ₦0 outstanding", () => {
    const payments = [payment([{ id: "l1", category: "Loan Repaid", amount: 30_000_000n, loanId: "loan-1" }])];
    expect(loanOutstanding(loan, payments)).toBe(0n);
    expect(isLoanActive(loan, payments)).toBe(false);
  });

  it("is active at 1 kobo outstanding", () => {
    const payments = [payment([{ id: "l1", category: "Loan Repaid", amount: 29_999_999n, loanId: "loan-1" }])];
    expect(isLoanActive(loan, payments)).toBe(true);
  });
});

describe("disburseLoan: refusals", () => {
  it("refuses Staff without loans.disburse (loans.create is not enough), and saves nothing", async () => {
    const { store, a, createOnly, addMember } = await build();
    const m = await addMember(createOnly.id, "C One");
    expect(await disburseLoan(store, actorOf(createOnly), loanBody(m.id))).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
    expect(await store.expenses.list({})).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const inactive: LoanActor = { id: admin.id, subject: { ...subjectOf(admin), isActive: false } };
    expect(await disburseLoan(store, inactive, loanBody(m.id))).toEqual({ ok: false, reason: "forbidden" });
  });

  it("checks the permission before the input", async () => {
    const { store, createOnly } = await build();
    expect(await disburseLoan(store, actorOf(createOnly), loanBody(undefined, { principal: "x" }))).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "a number", value: 5 },
  ])("refuses a member id that is $label", async ({ value }) => {
    const { store, a } = await build();
    expect(await disburseLoan(store, actorOf(a), loanBody(value))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_member_id",
    });
  });

  it.each([
    { label: "lower case", value: "cash" },
    { label: "unknown", value: "CARD" },
    { label: "missing", value: undefined },
  ])("refuses a method that is $label", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { method: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_method",
    });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "a JSON number", value: 300000, code: "invalid_principal" },
    { label: "missing", value: undefined, code: "invalid_principal" },
    { label: "negative", value: "-5", code: "invalid_principal" },
    { label: "3 decimals", value: "1.234", code: "invalid_principal" },
    { label: "with a comma", value: "300,000", code: "invalid_principal" },
    { label: "over 12 digits", value: "1000000000000", code: "invalid_principal" },
    { label: "zero", value: "0", code: "principal_not_positive" },
    { label: "zero with decimals", value: "0.00", code: "principal_not_positive" },
  ])("refuses a principal that is $label", async ({ value, code }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { principal: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code,
    });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("accepts notes of exactly the limit after trimming, and refuses one more", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    const atLimit = "n".repeat(LOAN_TEXT_MAX);
    expect(LOAN_TEXT_MAX).toBe(200);
    must(await disburseLoan(store, actorOf(a), loanBody(m1.id, { interestNote: ` ${atLimit} `, notes: atLimit })));
    expect(await disburseLoan(store, actorOf(a), loanBody(m2.id, { interestNote: `${atLimit}n` }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_interest_note",
    });
    expect(await disburseLoan(store, actorOf(a), loanBody(m2.id, { notes: `${atLimit}n` }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_notes",
    });
    expect(await store.loans.listByMember(m2.id)).toEqual([]);
  });

  it.each([
    { field: "interestNote", code: "invalid_interest_note" },
    { field: "notes", code: "invalid_notes" },
  ])("refuses $field that is not text", async ({ field, code }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { [field]: 5 }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code,
    });
  });

  it("answers not_found for an unknown member", async () => {
    const { store, a } = await build();
    expect(await disburseLoan(store, actorOf(a), loanBody("no-such-id"))).toEqual({ ok: false, reason: "not_found" });
  });

  it("answers not_found when Staff give a loan to another user's member, and saves nothing", async () => {
    const { store, a, b, addMember } = await build();
    const m = await addMember(b.id, "B One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toEqual({ ok: false, reason: "not_found" });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
  });

  it("answers member_inactive for an Inactive member, and saves nothing (A-147)", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.members.setStatus(m.id, "INACTIVE");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toEqual({ ok: false, reason: "member_inactive" });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("writes no audit entry when the loan is refused", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await disburseLoan(store, actorOf(a), loanBody(m.id, { principal: "0" }));
    await disburseLoan(store, actorOf(a), loanBody("no-such-id"));
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });
});

/** The store, but writes of one kind inside a transaction fail. */
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

describe("disburseLoan: one transaction (D-45)", () => {
  it("saves no loan when the expense write fails", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await expect(disburseLoan(failingInside(store, "expenses"), actorOf(a), loanBody(m.id))).rejects.toThrow(
      "expenses down",
    );
    expect(await store.loans.listByMember(m.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("saves no loan and no expense when the audit write fails", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await expect(disburseLoan(failingInside(store, "audit"), actorOf(a), loanBody(m.id))).rejects.toThrow(
      "audit down",
    );
    expect(await store.loans.listByMember(m.id)).toEqual([]);
    expect(await store.expenses.list({})).toEqual([]);
  });
});

describe("disburseLoan on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("saves the loan, its expense and the audit entry", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P One");
    const r = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    expect((await store.loans.findById(r.id))?.principal).toBe(30_000_000n);
    expect(await store.expenses.findById(r.expenseId)).toMatchObject({ category: "Loan", loanId: r.id, amount: 30_000_000n });
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["loan.disbursed"]);
  });

  it("saves no loan when the audit write fails", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P Two");
    await expect(disburseLoan(failingInside(store, "audit"), actorOf(a), loanBody(m.id))).rejects.toThrow(
      "audit down",
    );
    expect(await store.loans.listByMember(m.id)).toEqual([]);
    expect((await store.expenses.list({ createdById: a.id }))).toEqual([]);
  });

  it("gives exactly one loan when five requests for one member run at once", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P Three");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => disburseLoan(store, actorOf(a), loanBody(m.id))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.reason))).toEqual(Array(4).fill("active_loan"));
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({ createdById: a.id })).toHaveLength(1);
  });
});
