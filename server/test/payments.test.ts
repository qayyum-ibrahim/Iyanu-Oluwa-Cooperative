import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { subjectOf } from "../src/guards.js";
import { isLoanActive, loanOutstanding } from "../src/loans.js";
import { createMemoryStore } from "../src/memory-store.js";
import {
  createPayment,
  isCalendarDay,
  koboToNairaString,
  lagosDay,
  LOAN_REPAID_CATEGORY,
  type PaymentActor,
  type PaymentResult,
  type PaymentView,
} from "../src/payments.js";
import { createPrismaStore } from "../src/prisma-store.js";
import type { Role, Store, UserRecord } from "../src/store.js";
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
  const a = await make("staff-a", "STAFF", ["payments.create"]);
  const b = await make("staff-b", "STAFF", ["payments.create"]);
  const noPay = await make("no-pay", "STAFF", ["members.view"]);
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({
      fullName,
      phone: "08000000001",
      address: "1 Test Street",
      occupation: "Trader",
      createdById,
    });
  return { store, admin, a, b, noPay, addMember };
}

const actorOf = (u: UserRecord): PaymentActor => ({ id: u.id, subject: subjectOf(u) });

// The DR-02 example: 20,000 = 5,000 + 10,000 + 5,000.
let keyCounter = 0;
const nextKey = () => `logic-test-key-${String(++keyCounter).padStart(8, "0")}`;
const pay = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  idempotencyKey: nextKey(),
  memberId,
  method: "CASH",
  total: "20000",
  lines: [
    { category: "Shares", amount: "5000" },
    { category: "Savings", amount: "10000" },
    { category: "Special Savings", amount: "5000" },
  ],
  ...over,
});

function must(r: PaymentResult): PaymentView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

describe("createPayment: success", () => {
  it("records a payment for Staff on their own member, with exact amounts and the actor", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(a), pay(m.id)));
    expect(r).toMatchObject({
      memberId: m.id,
      membershipId: "IO-001",
      method: "CASH",
      total: "20000.00",
      createdById: a.id,
    });
    expect(r.lines).toEqual([
      { category: "Shares", amount: "5000.00" },
      { category: "Savings", amount: "10000.00" },
      { category: "Special Savings", amount: "5000.00" },
    ]);
    expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);
    const saved = await store.payments.listByMember(m.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.total).toBe(2_000_000n);
    expect(saved[0]?.lines.map((l) => l.amount)).toEqual([500_000n, 1_000_000n, 500_000n]);
  });

  it("saves and shows the payment date sent (U.4b)", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A Date");
    const r = must(await createPayment(store, actorOf(a), pay(m.id, { paidOn: "2019-03-07" })));
    expect(r.paidOn).toBe("2019-03-07");
    const saved = await store.payments.findById(r.id);
    expect(saved?.paidOn).toBe("2019-03-07");
  });

  it("accepts today in Lagos as the payment date", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A Today");
    const today = lagosDay(new Date());
    const r = must(await createPayment(store, actorOf(a), pay(m.id, { paidOn: today })));
    expect(r.paidOn).toBe(today);
  });

  it("saves the day in Lagos as the payment date when none is sent (U.4a)", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A Day");
    const before = lagosDay(new Date());
    const r = must(await createPayment(store, actorOf(a), pay(m.id)));
    const after = lagosDay(new Date());
    const saved = await store.payments.findById(r.id);
    expect([before, after]).toContain(saved?.paidOn);
    expect(r.paidOn).toBe(saved?.paidOn);
  });

  it("keeps the largest allowed amount exact", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(
      await createPayment(
        store,
        actorOf(a),
        pay(m.id, {
          total: "999999999999.99",
          lines: [{ category: "Shares", amount: "999999999999.99" }],
        }),
      ),
    );
    expect(r.total).toBe("999999999999.99");
    const saved = await store.payments.listByMember(m.id);
    expect(saved[0]?.total).toBe(99_999_999_999_999n);
  });

  it("accepts a bank transfer and the same category on two lines", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(
      await createPayment(
        store,
        actorOf(a),
        pay(m.id, {
          method: "BANK_TRANSFER",
          total: "3000.50",
          lines: [
            { category: "Savings", amount: "1000.25" },
            { category: "Savings", amount: "2000.25" },
          ],
        }),
      ),
    );
    expect(r.method).toBe("BANK_TRANSFER");
    expect(r.lines.map((l) => l.amount)).toEqual(["1000.25", "2000.25"]);
  });

  it("lets the Super Admin pay into any member", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(admin), pay(m.id)));
    expect(r.createdById).toBe(admin.id);
  });

  it("saves two payments with different ids", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const one = must(await createPayment(store, actorOf(a), pay(m.id)));
    const two = must(await createPayment(store, actorOf(a), pay(m.id)));
    expect(one.id).not.toBe(two.id);
    expect(await store.payments.listByMember(m.id)).toHaveLength(2);
  });
});

describe("lagosDay (U.4a)", () => {
  it("gives the day in Lagos (UTC+1) at each moment", () => {
    expect(lagosDay(new Date("2026-10-31T22:59:59.999Z"))).toBe("2026-10-31");
    expect(lagosDay(new Date("2026-10-31T23:00:00.000Z"))).toBe("2026-11-01");
    expect(lagosDay(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
    expect(lagosDay(new Date("2026-06-30T23:30:00.000Z"))).toBe("2026-07-01");
  });

  it("gives the day in Lagos when the machine runs in another time zone", async () => {
    // The day format is made when the module loads, so load it again under UTC (A-206, L2).
    const before = process.env["TZ"];
    process.env["TZ"] = "UTC";
    try {
      vi.resetModules();
      const fresh = await import("../src/payments.js");
      expect(fresh.lagosDay(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11-01");
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
      vi.resetModules();
    }
  });
});

describe("isCalendarDay (U.4b)", () => {
  it.each(["2026-10-23", "2028-02-29", "2000-02-29", "1999-12-31", "2026-01-01", "2026-04-30"])(
    "accepts %s",
    (value) => {
      expect(isCalendarDay(value)).toBe(true);
    },
  );

  it.each([
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-10-32",
    "2026-1-05",
    "26-10-23",
    "12026-10-01",
    "02026-10-01",
    "2026/10/23",
    " 2026-10-23",
    "2026-10-23T00:00:00Z",
    "",
  ])("refuses %j", (value) => {
    expect(isCalendarDay(value)).toBe(false);
  });

  it.each([20261023, null, undefined, {}, ["2026-10-23"]])("refuses the non-text %j", (value) => {
    expect(isCalendarDay(value)).toBe(false);
  });
});

describe("createPayment: refusals", () => {
  it("refuses Staff without payments.create, and saves nothing", async () => {
    const { store, noPay, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = await createPayment(store, actorOf(noPay), pay(m.id));
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("checks the permission before the input", async () => {
    const { store, noPay } = await build();
    const r = await createPayment(store, actorOf(noPay), pay(undefined, { method: "x" }));
    expect(r).toEqual({ ok: false, reason: "forbidden" });
  });

  it("answers not_found for an unknown member", async () => {
    const { store, a } = await build();
    expect(await createPayment(store, actorOf(a), pay("no-such-id"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("answers not_found when Staff pay into another user's member, and saves nothing", async () => {
    const { store, a, b, addMember } = await build();
    const m = await addMember(b.id, "B One");
    expect(await createPayment(store, actorOf(a), pay(m.id))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("answers member_inactive for an Inactive member, and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.members.setStatus(m.id, "INACTIVE");
    expect(await createPayment(store, actorOf(a), pay(m.id))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "a number", value: 5 },
  ])("refuses a member id that is $label", async ({ value }) => {
    const { store, a } = await build();
    expect(await createPayment(store, actorOf(a), pay(value))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_member_id",
    });
  });

  it.each([
    { label: "lower case", value: "cash" },
    { label: "unknown", value: "CARD" },
    { label: "missing", value: undefined },
    { label: "a number", value: 5 },
  ])("refuses a method that is $label", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), pay(m.id, { method: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_method",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "not a real day", value: "2026-02-30" },
    { label: "not YYYY-MM-DD", value: "23/10/2026" },
    { label: "a date with a time", value: "2026-10-01T10:00:00Z" },
    { label: "a five-digit year", value: "12026-10-01" },
    { label: "empty", value: "" },
    { label: "null", value: null },
    { label: "a number", value: 20261001 },
  ])("refuses a payment date that is $label, and saves nothing", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), pay(m.id, { paidOn: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_paid_on",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("refuses a payment date after today in Lagos, and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const tomorrow = lagosDay(new Date(Date.now() + 24 * 60 * 60 * 1000));
    for (const paidOn of [tomorrow, "2999-01-01"]) {
      expect(await createPayment(store, actorOf(a), pay(m.id, { paidOn }))).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "future_paid_on",
      });
    }
    expect(await store.payments.listByMember(m.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("checks the payment date after the method and before the breakdown", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(
      await createPayment(store, actorOf(a), pay(m.id, { method: "x", paidOn: "bad" })),
    ).toMatchObject({ code: "invalid_method" });
    expect(
      await createPayment(store, actorOf(a), pay(m.id, { paidOn: "bad", total: "x" })),
    ).toMatchObject({ code: "invalid_paid_on" });
  });

  it.each([
    { label: "lines that do not add up", over: { total: "19999" }, expected: { code: "mismatch" } },
    {
      label: "Membership Withdrawal on a line",
      over: {
        lines: [
          { category: "Shares", amount: "5000" },
          { category: "Membership Withdrawal", amount: "15000" },
        ],
      },
      expected: { code: "system_only", lineIndex: 1 },
    },
    { label: "no lines", over: { lines: [] }, expected: { code: "no_lines" } },
    { label: "a missing total", over: { total: undefined }, expected: { code: "invalid_total" } },
    { label: "a zero total", over: { total: "0" }, expected: { code: "total_not_positive" } },
    {
      label: "an amount sent as a number",
      over: { lines: [{ category: "Shares", amount: 20000 }] },
      expected: { code: "invalid_amount", lineIndex: 0 },
    },
  ])("refuses $label, with the code and no payment saved", async ({ over, expected }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = await createPayment(store, actorOf(a), pay(m.id, over));
    expect(r).toEqual({ ok: false, reason: "invalid_input", ...expected });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("accepts exactly 20 lines", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const lines = Array.from({ length: 20 }, () => ({ category: "Shares", amount: "1" }));
    const r = must(await createPayment(store, actorOf(a), pay(m.id, { total: "20", lines })));
    expect(r.lines).toHaveLength(20);
  });

  it("refuses 21 lines", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const lines = Array.from({ length: 21 }, () => ({ category: "Shares", amount: "1" }));
    const r = await createPayment(store, actorOf(a), pay(m.id, { total: "21", lines }));
    expect(r).toEqual({ ok: false, reason: "invalid_input", code: "too_many_lines" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });
});

describe("createPayment: audit and transaction", () => {
  it("writes one payment.created entry with the actor, ids and totals only", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(a), pay(m.id, { paidOn: "2026-10-01" })));
    const entries = await store.audit.listByActor(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "payment.created",
      entityType: "Payment",
      entityId: r.id,
      detail: "membership_id=IO-001 total_kobo=2000000 lines=3 paid_on=2026-10-01",
    });
    const text = JSON.stringify(entries);
    expect(text).not.toContain("A One");
    expect(text).not.toContain("08000000001");
  });

  it("logs the caller, not the member's recorder, when the Super Admin pays into a Staff member", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(admin), pay(m.id)));
    const adminEntries = await store.audit.listByActor(admin.id);
    expect(adminEntries).toHaveLength(1);
    expect(adminEntries[0]).toMatchObject({ action: "payment.created", entityId: r.id });
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("writes no audit entry when the payment is refused", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await createPayment(store, actorOf(a), pay(m.id, { total: "19999" }));
    await createPayment(store, actorOf(a), pay("no-such-id"));
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("saves no payment when the audit write fails", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const failing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) },
          }),
        ),
    };
    await expect(createPayment(failing, actorOf(a), pay(m.id))).rejects.toThrow("audit down");
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });
});

// A payment of one Loan Repaid line, or of the given lines.
const repay = (memberId: string, amount: string, lines = [{ category: "Loan Repaid", amount }]) =>
  pay(memberId, { total: amount, lines });

// A ₦300,000 loan saved straight into the store (DR-08 example).
const addLoan = (store: Store, memberId: string, createdById: string, principal = 30_000_000n) =>
  store.loans.create({ givenOn: "2026-10-20", memberId, principal, createdById });

describe("createPayment: Loan Repaid (DR-08, DR-09, A-145)", () => {
  it("links a Loan Repaid line to the active loan: ₦300,000 less ₦20,000 leaves ₦280,000", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const loan = await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), repay(m.id, "20000")));
    const saved = await store.payments.listByMember(m.id);
    expect(saved[0]?.lines.map((l) => [l.category, l.amount, l.loanId])).toEqual([
      ["Loan Repaid", 2_000_000n, loan.id],
    ]);
    expect(loanOutstanding(loan, saved)).toBe(28_000_000n);
  });

  it("links only the Loan Repaid lines; other lines, Loan Interest too, name no loan", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const loan = await addLoan(store, m.id, a.id);
    const lines = [
      { category: "Savings", amount: "1000" },
      { category: "Loan Repaid", amount: "5000" },
      { category: "Loan Interest", amount: "500" },
      { category: "Loan Repaid", amount: "2500" },
    ];
    must(await createPayment(store, actorOf(a), repay(m.id, "9000", lines)));
    const saved = await store.payments.listByMember(m.id);
    expect(saved[0]?.lines.map((l) => [l.category, l.loanId])).toEqual([
      ["Savings", null],
      ["Loan Repaid", loan.id],
      ["Loan Interest", null],
      ["Loan Repaid", loan.id],
    ]);
    expect(loanOutstanding(loan, saved)).toBe(30_000_000n - 750_000n);
  });

  it("leaves the loan alone when a payment has no Loan Repaid line", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const loan = await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), pay(m.id)));
    const saved = await store.payments.listByMember(m.id);
    expect(saved[0]?.lines.every((l) => l.loanId === null)).toBe(true);
    expect(loanOutstanding(loan, saved)).toBe(30_000_000n);
  });

  it("accepts Loan Interest without any loan, and links nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const lines = [{ category: "Loan Interest", amount: "500" }];
    must(await createPayment(store, actorOf(a), repay(m.id, "500", lines)));
    expect((await store.payments.listByMember(m.id))[0]?.lines[0]?.loanId).toBeNull();
  });

  it("accepts exactly the outstanding amount; the loan is then Fully Repaid", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const loan = await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), repay(m.id, "100000")));
    must(await createPayment(store, actorOf(a), repay(m.id, "200000")));
    const saved = await store.payments.listByMember(m.id);
    expect(loanOutstanding(loan, saved)).toBe(0n);
    expect(isLoanActive(loan, saved)).toBe(false);
  });

  it("answers no_active_loan for a member with no loan, and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), repay(m.id, "20000"))).toEqual({
      ok: false,
      reason: "no_active_loan",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("answers no_active_loan once the loan is Fully Repaid", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), repay(m.id, "300000")));
    expect(await createPayment(store, actorOf(a), repay(m.id, "0.01"))).toEqual({
      ok: false,
      reason: "no_active_loan",
    });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("does not use another member's loan", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const other = await addMember(a.id, "A Two");
    await addLoan(store, other.id, a.id);
    expect(await createPayment(store, actorOf(a), repay(m.id, "20000"))).toEqual({
      ok: false,
      reason: "no_active_loan",
    });
  });

  it("links to the new active loan, not to an old Fully Repaid one", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const first = await addLoan(store, m.id, a.id, 1_000_000n);
    must(await createPayment(store, actorOf(a), repay(m.id, "10000")));
    const second = await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), repay(m.id, "20000")));
    const saved = await store.payments.listByMember(m.id);
    expect(saved.map((p) => p.lines[0]?.loanId)).toEqual([first.id, second.id]);
    expect(loanOutstanding(second, saved)).toBe(28_000_000n);
  });

  it("answers loan_overpayment for 1 kobo above the outstanding amount, and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), repay(m.id, "20000")));
    expect(await createPayment(store, actorOf(a), repay(m.id, "280000.01"))).toEqual({
      ok: false,
      reason: "loan_overpayment",
    });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("adds up every Loan Repaid line before comparing with the outstanding amount", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await addLoan(store, m.id, a.id);
    const lines = [
      { category: "Loan Repaid", amount: "200000" },
      { category: "Savings", amount: "50000" },
      { category: "Loan Repaid", amount: "100000.01" },
    ];
    expect(await createPayment(store, actorOf(a), repay(m.id, "350000.01", lines))).toEqual({
      ok: false,
      reason: "loan_overpayment",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("does not count other lines against the outstanding amount", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await addLoan(store, m.id, a.id);
    const lines = [
      { category: "Loan Repaid", amount: "300000" },
      { category: "Savings", amount: "50000" },
    ];
    must(await createPayment(store, actorOf(a), repay(m.id, "350000", lines)));
  });

  it("checks who may see the member and that it is Active before the loan", async () => {
    const { store, a, b, addMember } = await build();
    const theirs = await addMember(b.id, "B One");
    expect(await createPayment(store, actorOf(a), repay(theirs.id, "20000"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    const m = await addMember(a.id, "A One");
    await store.members.setStatus(m.id, "INACTIVE");
    expect(await createPayment(store, actorOf(a), repay(m.id, "20000"))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
  });

  it("returns the first payment on a repeat, even after the loan is Fully Repaid", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await addLoan(store, m.id, a.id);
    const body = repay(m.id, "300000");
    const first = must(await createPayment(store, actorOf(a), body));
    const again = await createPayment(store, actorOf(a), body);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again)).toEqual(first);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("uses the category name of the table", () => {
    expect(LOAN_REPAID_CATEGORY).toBe("Loan Repaid");
  });
});

describe("createPayment with Loan Repaid on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("saves the loan link, read back from the database", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P One");
    const loan = await addLoan(store, m.id, a.id);
    must(await createPayment(store, actorOf(a), repay(m.id, "20000")));
    const saved = await store.payments.listByMember(m.id);
    expect(saved[0]?.lines[0]?.loanId).toBe(loan.id);
    expect(loanOutstanding(loan, saved)).toBe(28_000_000n);
  });

  it("never repays more than the loan when five full repayments run at once", async () => {
    const { a, addMember } = await build(store);
    const m = await addMember(a.id, "P Two");
    const loan = await addLoan(store, m.id, a.id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createPayment(store, actorOf(a), repay(m.id, "300000"))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.reason))).toEqual(
      Array(4).fill("no_active_loan"),
    );
    const saved = await store.payments.listByMember(m.id);
    expect(saved).toHaveLength(1);
    expect(loanOutstanding(loan, saved)).toBe(0n);
  });
});

describe("koboToNairaString", () => {
  it.each([
    { kobo: 0n, text: "0.00" },
    { kobo: 5n, text: "0.05" },
    { kobo: 100n, text: "1.00" },
    { kobo: 2_000_050n, text: "20000.50" },
    { kobo: 99_999_999_999_999n, text: "999999999999.99" },
  ])("shows $kobo kobo as $text", ({ kobo, text }) => {
    expect(koboToNairaString(kobo)).toBe(text);
  });

  it("refuses a negative amount", () => {
    expect(() => koboToNairaString(-1n)).toThrow(RangeError);
  });
});