import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subjectOf } from "../src/guards.js";
import {
  disburseLoan,
  isLoanActive,
  listLoans,
  loanOutstanding,
  LOAN_TEXT_MAX,
  type LoanActor,
  type LoanListResult,
  type LoanListView,
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
  const a = await make("staff-a", "STAFF", ["loans.disburse", "loans.view"]);
  const b = await make("staff-b", "STAFF", ["loans.disburse", "loans.view"]);
  const createOnly = await make("create-only", "STAFF", ["loans.create", "members.view"]);
  const disburseOnly = await make("disburse-only", "STAFF", ["loans.disburse"]);
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
  return { store, admin, a, b, createOnly, disburseOnly, addMember, repay };
}

const actorOf = (u: UserRecord): LoanActor => ({ id: u.id, subject: subjectOf(u) });

let keyCount = 0;
/** A new idempotency key on every call, so separate calls are separate requests. */
const newKey = () => `loan-test-key-${String(++keyCount).padStart(6, "0")}`;

// The DR-08 example: a ₦300,000 loan.
const loanBody = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  idempotencyKey: newKey(),
  memberId,
  principal: "300000",
  method: "BANK_TRANSFER",
  ...over,
});

function must(r: LoanResult): LoanView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

function mustList(r: LoanListResult): LoanListView[] {
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
    idempotencyKey: null,
    requestHash: null,
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

describe("disburseLoan: idempotency key (D-60)", () => {
  it("a first request is saved and not marked as a replay", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toMatchObject({ ok: true, replayed: false });
  });

  it("a repeat returns the first loan and its expense: one loan, one expense, one audit entry", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id, { notes: "school fees" });
    const first = await disburseLoan(store, actorOf(a), body);
    const second = await disburseLoan(store, actorOf(a), body);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(must(second)).toEqual(must(first));
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("saves the key and the request hash on the loan", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id);
    const r = must(await disburseLoan(store, actorOf(a), body));
    const saved = await store.loans.findById(r.id);
    expect(saved?.idempotencyKey).toBe(body.idempotencyKey);
    expect(saved?.requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats the same amount and texts written differently as the same request", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const k = newKey();
    const first = must(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k, notes: "rent" })));
    const second = await disburseLoan(
      store,
      actorOf(a),
      loanBody(m.id, { idempotencyKey: k, principal: "300000.00", notes: "  rent ", interestNote: null }),
    );
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(must(second).id).toBe(first.id);
  });

  it.each([
    { label: "another principal", over: { principal: "300000.01" } },
    { label: "another method", over: { method: "CASH" } },
    { label: "another interest note", over: { interestNote: "5%" } },
    { label: "other notes", over: { notes: "x" } },
  ])("refuses the same key with $label, and saves nothing more", async ({ over }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const k = newKey();
    must(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k })));
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k, ...over }))).toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("refuses the same key for another member, and gives that member nothing", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    const k = newKey();
    must(await disburseLoan(store, actorOf(a), loanBody(m1.id, { idempotencyKey: k })));
    expect(await disburseLoan(store, actorOf(a), loanBody(m2.id, { idempotencyKey: k }))).toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
    expect(await store.loans.listByMember(m2.id)).toEqual([]);
  });

  it("keeps keys apart per user", async () => {
    const { store, admin, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    const k = newKey();
    const ra = must(await disburseLoan(store, actorOf(a), loanBody(m1.id, { idempotencyKey: k })));
    const rb = await disburseLoan(store, actorOf(admin), loanBody(m2.id, { idempotencyKey: k }));
    expect(rb).toMatchObject({ ok: true, replayed: false });
    expect(must(rb).id).not.toBe(ra.id);
  });

  it("a repeat returns its own loan's expense when the same user gave other loans (A-164)", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    const body1 = loanBody(m1.id);
    const body2 = loanBody(m2.id, { principal: "50000" });
    const first = must(await disburseLoan(store, actorOf(a), body1));
    const second = must(await disburseLoan(store, actorOf(a), body2));
    expect(second.expenseId).not.toBe(first.expenseId);
    // Both replays, so the check holds whatever order the expenses are listed in.
    expect(must(await disburseLoan(store, actorOf(a), body2))).toEqual(second);
    expect(must(await disburseLoan(store, actorOf(a), body1))).toEqual(first);
    expect(await store.expenses.list({})).toHaveLength(2);
  });

  it("does not use up the key when the request is refused", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const k = newKey();
    expect(await disburseLoan(store, actorOf(a), loanBody("no-such-id", { idempotencyKey: k }))).toEqual({
      ok: false,
      reason: "not_found",
    });
    await store.members.setStatus(m.id, "INACTIVE");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k }))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
    await store.members.setStatus(m.id, "ACTIVE");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k }))).toMatchObject({
      ok: true,
      replayed: false,
    });
  });

  it("does not use up the key when the audit write fails", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const k = newKey();
    await expect(
      disburseLoan(failingInside(store, "audit"), actorOf(a), loanBody(m.id, { idempotencyKey: k })),
    ).rejects.toThrow("audit down");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k }))).toMatchObject({
      ok: true,
      replayed: false,
    });
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
  });

  it("returns the first loan after the member became Inactive or the loan was repaid, but refuses a new key", async () => {
    const { store, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id);
    const first = must(await disburseLoan(store, actorOf(a), body));
    await store.members.setStatus(m.id, "INACTIVE");
    const again = await disburseLoan(store, actorOf(a), body);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again).id).toBe(first.id);
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id))).toEqual({ ok: false, reason: "member_inactive" });

    await store.members.setStatus(m.id, "ACTIVE");
    await repay(m.id, first.id, 30_000_000n, a.id);
    expect(must(await disburseLoan(store, actorOf(a), body)).id).toBe(first.id);
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
  });

  it("returns the first loan, not active_loan, when the Super Admin repeats a request for a Staff member", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id);
    const first = must(await disburseLoan(store, actorOf(admin), body));
    expect(must(await disburseLoan(store, actorOf(admin), body))).toEqual(first);
    expect((await store.expenses.list({}))[0]?.createdById).toBe(admin.id);
  });

  it("handles a lost race: the key is saved between the lookup and the save", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id);
    const first = must(await disburseLoan(store, actorOf(a), body));
    let lookups = 0;
    const racing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            loans: {
              ...tx.loans,
              findByKey: async (userId, k) => {
                lookups += 1;
                return lookups === 1 ? null : tx.loans.findByKey(userId, k);
              },
            },
          }),
        ),
    };
    // The first lookup misses, so the member check runs and finds the active loan: that is an
    // answer, not a lost race. Make the member look loan-free so the save is reached.
    const noLoans: Store = {
      ...racing,
      transaction: (fn) =>
        racing.transaction((tx) => fn({ ...tx, loans: { ...tx.loans, listByMember: async () => [] } })),
    };
    const r = await disburseLoan(noLoans, actorOf(a), body);
    expect(r).toMatchObject({ ok: true, replayed: true });
    expect(must(r).id).toBe(first.id);
    expect(lookups).toBe(2);
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("saves one loan when two identical requests arrive together", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id);
    const [r1, r2] = await Promise.all([
      disburseLoan(store, actorOf(a), body),
      disburseLoan(store, actorOf(a), body),
    ]);
    expect(must(r1).id).toBe(must(r2).id);
    expect([r1, r2].filter((r) => r.ok && r.replayed)).toHaveLength(1);
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
  });

  it("fails loudly when a saved loan has lost its member or its expense", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const body = loanBody(m.id);
    must(await disburseLoan(store, actorOf(a), body));
    const wrap = (over: (tx: Store) => Partial<Store>): Store => ({
      ...store,
      transaction: (fn) => store.transaction((tx) => fn({ ...tx, ...over(tx) })),
    });
    const noMember = wrap((tx) => ({ members: { ...tx.members, findById: async () => null } }));
    const noExpense = wrap((tx) => ({ expenses: { ...tx.expenses, list: async () => [] } }));
    await expect(disburseLoan(noMember, actorOf(a), body)).rejects.toThrow("member of a saved loan");
    await expect(disburseLoan(noExpense, actorOf(a), body)).rejects.toThrow("Loan expense of a saved loan");
  });

  it("checks the permission before the key", async () => {
    const { store, createOnly } = await build();
    expect(await disburseLoan(store, actorOf(createOnly), loanBody("x", { idempotencyKey: undefined }))).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("checks the key before the other input", async () => {
    const { store, a } = await build();
    expect(
      await disburseLoan(store, actorOf(a), loanBody(undefined, { idempotencyKey: undefined, principal: "x" })),
    ).toEqual({ ok: false, reason: "invalid_input", code: "missing_idempotency_key" });
  });

  it("refuses a missing key and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: undefined }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "missing_idempotency_key",
    });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "empty", value: "" },
    { label: "null", value: null },
    { label: "a number", value: 1234567890123456 },
    { label: "15 characters", value: "k".repeat(15) },
    { label: "65 characters", value: "k".repeat(65) },
    { label: "holding a space", value: "loan key 000000001" },
  ])("refuses a key that is $label", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_idempotency_key",
    });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
  });

  it("accepts keys of 16 and 64 characters, with dashes and underscores", async () => {
    const { store, a, addMember } = await build();
    const keys = ["k".repeat(16), "k".repeat(64), "a-b_C-9".padEnd(20, "x")];
    for (const [i, k] of keys.entries()) {
      const m = await addMember(a.id, `A ${i}`);
      expect(await disburseLoan(store, actorOf(a), loanBody(m.id, { idempotencyKey: k }))).toMatchObject({ ok: true });
    }
  });
});

describe("listLoans (step 5.6)", () => {
  it("refuses Staff without loans.view (loans.create or loans.disburse is not enough)", async () => {
    const { store, createOnly, disburseOnly, addMember } = await build();
    const m1 = await addMember(createOnly.id, "C One");
    const m2 = await addMember(disburseOnly.id, "D One");
    expect(await listLoans(store, actorOf(createOnly), { memberId: m1.id })).toEqual({ ok: false, reason: "forbidden" });
    expect(await listLoans(store, actorOf(disburseOnly), { memberId: m2.id })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("checks the permission before the input", async () => {
    const { store, createOnly } = await build();
    expect(await listLoans(store, actorOf(createOnly), {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses a missing or bad member id", async () => {
    const { store, a } = await build();
    expect(await listLoans(store, actorOf(a), {})).toEqual({ ok: false, reason: "invalid_input", code: "missing_member_id" });
    for (const memberId of ["", 5, null, ["x"]]) {
      expect(await listLoans(store, actorOf(a), { memberId })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_member_id",
      });
    }
  });

  it("answers not_found for an unknown member and for another user's member", async () => {
    const { store, a, b, addMember } = await build();
    const m = await addMember(a.id, "A One");
    must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    expect(await listLoans(store, actorOf(a), { memberId: "no-such-member" })).toEqual({ ok: false, reason: "not_found" });
    expect(await listLoans(store, actorOf(b), { memberId: m.id })).toEqual({ ok: false, reason: "not_found" });
  });

  it("gives an empty list for a member with no loans", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await listLoans(store, actorOf(a), { memberId: m.id })).toEqual({ ok: true, value: [] });
  });

  it("shows the DR-08 example: ₦300,000 loan, ₦20,000 repaid, ₦280,000 outstanding, Active", async () => {
    const { store, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const given = must(await disburseLoan(store, actorOf(a), loanBody(m.id, { interestNote: "5% flat", notes: "rent" })));
    await repay(m.id, given.id, 2_000_000n, a.id);
    expect(mustList(await listLoans(store, actorOf(a), { memberId: m.id }))).toEqual([
      { ...given, repaid: "20000.00", outstanding: "280000.00", status: "ACTIVE" },
    ]);
  });

  it("is Active at 1 kobo outstanding and Fully Repaid at ₦0", async () => {
    const { store, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const given = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await repay(m.id, given.id, 29_999_999n, a.id);
    expect(mustList(await listLoans(store, actorOf(a), { memberId: m.id }))[0]).toMatchObject({
      repaid: "299999.99",
      outstanding: "0.01",
      status: "ACTIVE",
    });
    await repay(m.id, given.id, 1n, a.id);
    expect(mustList(await listLoans(store, actorOf(a), { memberId: m.id }))[0]).toMatchObject({
      repaid: "300000.00",
      outstanding: "0.00",
      status: "FULLY_REPAID",
    });
  });

  it("keeps a Fully Repaid loan in history, oldest first, and counts each loan's own lines only", async () => {
    const { store, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await repay(m.id, first.id, 30_000_000n, a.id);
    const second = must(await disburseLoan(store, actorOf(a), loanBody(m.id, { principal: "50000" })));
    await repay(m.id, second.id, 1_000_000n, a.id);
    await store.payments.create({
      memberId: m.id,
      method: "CASH",
      total: 500_000n,
      lines: [{ category: "Loan Interest", amount: 500_000n }],
      createdById: a.id,
    });
    const list = mustList(await listLoans(store, actorOf(a), { memberId: m.id }));
    expect(list.map((l) => [l.id, l.expenseId, l.principal, l.repaid, l.outstanding, l.status])).toEqual([
      [first.id, first.expenseId, "300000.00", "300000.00", "0.00", "FULLY_REPAID"],
      [second.id, second.expenseId, "50000.00", "10000.00", "40000.00", "ACTIVE"],
    ]);
  });

  it("lets Staff see a loan the Super Admin gave to their member, with its expense", async () => {
    const { store, admin, a, addMember, repay } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await repay(m.id, first.id, 30_000_000n, a.id);
    const second = must(await disburseLoan(store, actorOf(admin), loanBody(m.id, { principal: "1000" })));
    const list = mustList(await listLoans(store, actorOf(a), { memberId: m.id }));
    expect(list.map((l) => [l.id, l.expenseId, l.createdById])).toEqual([
      [first.id, first.expenseId, a.id],
      [second.id, second.expenseId, admin.id],
    ]);
  });

  it("lets the Super Admin see the loans of a Staff member, and lists an Inactive member's loans", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const given = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await store.members.setStatus(m.id, "INACTIVE");
    expect(mustList(await listLoans(store, actorOf(admin), { memberId: m.id })).map((l) => l.id)).toEqual([given.id]);
    expect(mustList(await listLoans(store, actorOf(a), { memberId: m.id })).map((l) => l.id)).toEqual([given.id]);
  });

  it("does not show another member's loans", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    const given = must(await disburseLoan(store, actorOf(a), loanBody(m1.id)));
    must(await disburseLoan(store, actorOf(a), loanBody(m2.id)));
    expect(mustList(await listLoans(store, actorOf(a), { memberId: m1.id })).map((l) => l.id)).toEqual([given.id]);
  });

  it("writes nothing, not even an audit entry", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    mustList(await listLoans(store, actorOf(a), { memberId: m.id }));
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("fails loudly when a saved loan has no Loan expense", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.loans.create({ memberId: m.id, principal: 100n, createdById: a.id });
    await expect(listLoans(store, actorOf(a), { memberId: m.id })).rejects.toThrow(
      "The Loan expense of a saved loan is missing",
    );
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

  it("gives one loan and the same answer to five requests with one key at once", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P Four");
    const body = loanBody(m.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => disburseLoan(store, actorOf(a), body)));
    const ids = results.map((r) => must(r).id);
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({ createdById: a.id })).toHaveLength(1);
    expect((await store.audit.listByActor(a.id)).filter((e) => e.entityId === ids[0])).toHaveLength(1);
  });

  it("returns a repeat with the same view, read back from the database", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P Five");
    const body = loanBody(m.id, { notes: "rent" });
    const first = must(await disburseLoan(store, actorOf(a), body));
    const again = await disburseLoan(store, actorOf(a), body);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again)).toEqual(first);
  });

  it("lists a loan with repaid, outstanding and status, read back from the database", async () => {
    const { a, addMember, repay } = await build(store);
    const m = await addMember(a.id, "P Six");
    const given = must(await disburseLoan(store, actorOf(a), loanBody(m.id)));
    await repay(m.id, given.id, 2_000_000n, a.id);
    expect(mustList(await listLoans(store, actorOf(a), { memberId: m.id }))).toEqual([
      { ...given, repaid: "20000.00", outstanding: "280000.00", status: "ACTIVE" },
    ]);
  });
});
