import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getDashboard,
  monthDays,
  RECENT_EXPENSES,
  type DashboardActor,
  type DashboardResult,
  type DashboardView,
} from "../src/dashboard.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPayment, lagosDay } from "../src/payments.js";
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
  const a = await make("staff-a", "STAFF", ["dashboard", "payments.create"]);
  const b = await make("staff-b", "STAFF", ["dashboard"]);
  const noDash = await make("no-dashboard", "STAFF", ["expenses.view", "reports.view"]);
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  const pay = (memberId: string, paidOn: string, lines: [string, bigint, string?][], createdById: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      paidOn,
      total: lines.reduce((t, [, amount]) => t + amount, 0n),
      lines: lines.map(([category, amount, loanId]) => ({ category, amount, ...(loanId ? { loanId } : {}) })),
      createdById,
    });
  const spend = (category: string, amount: bigint, spentOn: string, createdById: string, loanId?: string) =>
    store.expenses.create({
      category,
      amount,
      method: "CASH",
      spentOn,
      createdById,
      ...(category === "Others" ? { narration: "fuel" } : {}),
      ...(loanId !== undefined ? { loanId } : {}),
    });
  const lend = async (memberId: string, principal: bigint, givenOn: string, createdById: string) => {
    const loan = await store.loans.create({ memberId, principal, givenOn, createdById });
    await spend("Loan", principal, givenOn, createdById, loan.id);
    return loan;
  };
  return { store, admin, a, b, noDash, addMember, pay, spend, lend };
}

const actorOf = (u: UserRecord): DashboardActor => ({ id: u.id, subject: subjectOf(u) });

function must(r: DashboardResult): DashboardView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

const ZERO = { month: "0.00", allTime: "0.00" };

describe("monthDays", () => {
  it.each([
    { month: "2026-10", toDay: "2026-10-31" },
    { month: "2026-09", toDay: "2026-09-30" },
    { month: "2026-02", toDay: "2026-02-28" },
    { month: "2028-02", toDay: "2028-02-29" },
    { month: "2100-02", toDay: "2100-02-28" },
    { month: "2000-02", toDay: "2000-02-29" },
    { month: "2026-12", toDay: "2026-12-31" },
  ])("gives the first and last day of $month", ({ month, toDay }) => {
    expect(monthDays(month)).toEqual({ fromDay: `${month}-01`, toDay });
  });

  it.each(["2026-13", "2026-00", "2026-1", "26-10", "2026-10-01", "2026/10", " 2026-10", "", 202610, null])(
    "refuses %j",
    (month) => {
      expect(monthDays(month)).toBeNull();
    },
  );
});

describe("getDashboard: refusals", () => {
  it("refuses Staff without dashboard (reports.view is not enough), before the input", async () => {
    const { store, noDash } = await build();
    expect(await getDashboard(store, actorOf(noDash), {})).toEqual({ ok: false, reason: "forbidden" });
    expect(await getDashboard(store, actorOf(noDash), { month: "bad" })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, admin } = await build();
    const inactive: DashboardActor = { id: admin.id, subject: { ...subjectOf(admin), isActive: false } };
    expect(await getDashboard(store, inactive, {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it.each([["2026-13"], ["2026-10-01"], [""], [null], [202610], [["2026-10"]]])(
    "answers invalid_month for %j",
    async (month) => {
      const { store, a } = await build();
      expect(await getDashboard(store, actorOf(a), { month })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_month",
      });
    },
  );

  it.each([[""], [5], ["x".repeat(101)], [["id"]]])("answers invalid_created_by_id for %j, Staff too", async (createdById) => {
    const { store, admin, a } = await build();
    for (const u of [admin, a]) {
      expect(await getDashboard(store, actorOf(u), { month: "2026-10", createdById })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_created_by_id",
      });
    }
  });

  it("accepts a createdById of 100 characters", async () => {
    const { store, admin } = await build();
    expect((await getDashboard(store, actorOf(admin), { month: "2026-10", createdById: "x".repeat(100) })).ok).toBe(true);
  });

  it("checks the month before createdById", async () => {
    const { store, a } = await build();
    expect(await getDashboard(store, actorOf(a), { month: "x", createdById: "" })).toMatchObject({ code: "invalid_month" });
  });
});

describe("getDashboard: figures", () => {
  it("gives zeros and exact fields for an empty store", async () => {
    const { store, admin } = await build();
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(v).toEqual({
      month: "2026-10",
      fromDay: "2026-10-01",
      toDay: "2026-10-31",
      income: ZERO,
      expenditure: ZERO,
      membershipWithdrawal: ZERO,
      outstandingLoans: "0.00",
      activeMembers: 0,
      recentExpenses: [],
    });
  });

  it("uses the month of today in Lagos when none is sent", async () => {
    const { store, admin } = await build();
    const before = lagosDay(new Date()).slice(0, 7);
    const v = must(await getDashboard(store, actorOf(admin), {}));
    const after = lagosDay(new Date()).slice(0, 7);
    expect([before, after]).toContain(v.month);
    expect(v.fromDay).toBe(`${v.month}-01`);
  });

  it("counts every payment line as income, Loan Repaid and Loan Interest included (D-101)", async () => {
    const { store, admin, a, addMember, pay, lend } = await build();
    const m = await addMember(a.id, "A One");
    const loan = await lend(m.id, 30_000_000n, "2026-09-01", admin.id);
    await pay(m.id, "2026-10-05", [["Shares", 500_000n], ["Savings", 1_000_000n], ["Development Levy", 1n]], a.id);
    await pay(m.id, "2026-10-06", [["Loan Repaid", 2_000_000n, loan.id], ["Loan Interest", 100_050n]], a.id);
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(v.income).toEqual({ month: "36000.51", allTime: "36000.51" });
  });

  it("counts only days inside the month, both ends included, and all time apart", async () => {
    const { store, admin, a, addMember, pay, spend } = await build();
    const m = await addMember(a.id, "A One");
    for (const [paidOn, amount] of [
      ["2026-09-30", 1n],
      ["2026-10-01", 10n],
      ["2026-10-31", 100n],
      ["2026-11-01", 1000n],
    ] as const) {
      await pay(m.id, paidOn, [["Savings", amount]], a.id);
      await spend("Allowances", amount * 2n, paidOn, admin.id);
    }
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(v.income).toEqual({ month: "1.10", allTime: "11.11" });
    expect(v.expenditure).toEqual({ month: "2.20", allTime: "22.22" });
    expect(v.recentExpenses.map((e) => e.spentOn)).toEqual(["2026-10-31", "2026-10-01"]);
  });

  it("leaves Loan and Membership Withdrawal out of expenditure, and shows Membership Withdrawal alone (D-100, D-102)", async () => {
    const { store, admin, a, addMember, spend, lend } = await build();
    const m = await addMember(a.id, "A One");
    await lend(m.id, 30_000_000n, "2026-10-02", admin.id);
    await spend("Membership Withdrawal", 2_500_000n, "2026-10-03", admin.id);
    await spend("Membership Withdrawal", 7n, "2026-08-03", admin.id);
    await spend("Expenses", 1_000n, "2026-10-04", admin.id);
    await spend("Others", 50n, "2026-10-04", admin.id);
    await spend("Payment to Union", 3n, "2026-07-01", admin.id);
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(v.expenditure).toEqual({ month: "10.50", allTime: "10.53" });
    expect(v.membershipWithdrawal).toEqual({ month: "25000.00", allTime: "25000.07" });
  });

  it("leaves soft-deleted expenses out of every figure and the recent list", async () => {
    const { store, admin, spend } = await build();
    const kept = await spend("Allowances", 100n, "2026-10-04", admin.id);
    const gone = await spend("Allowances", 900n, "2026-10-05", admin.id);
    await store.expenses.softDelete(gone.id, admin.id);
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(v.expenditure).toEqual({ month: "1.00", allTime: "1.00" });
    expect(v.recentExpenses.map((e) => e.id)).toEqual([kept.id]);
  });

  it("sums what is outstanding on Active loans only, all time (₦300,000 less ₦20,000 gives ₦280,000)", async () => {
    const { store, admin, a, addMember, pay, lend } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    const m3 = await addMember(a.id, "A Three");
    const l1 = await lend(m1.id, 30_000_000n, "2025-01-10", admin.id);
    await pay(m1.id, "2025-02-01", [["Loan Repaid", 2_000_000n, l1.id]], a.id);
    const l2 = await lend(m2.id, 5_000_000n, "2026-10-01", admin.id);
    await pay(m2.id, "2026-10-02", [["Loan Repaid", 5_000_000n, l2.id]], a.id);
    const l3 = await lend(m3.id, 1_000n, "2026-10-01", admin.id);
    await pay(m3.id, "2026-10-02", [["Loan Repaid", 999n, l3.id]], a.id);
    // A Loan Repaid line with no loan link pays back nothing (DR-09, A-145).
    await pay(m1.id, "2026-10-03", [["Loan Repaid", 1_000_000n]], a.id);
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(v.outstandingLoans).toBe("280000.01");
  });

  it("counts Active members only", async () => {
    const { store, admin, a, addMember } = await build();
    await addMember(a.id, "A One");
    await addMember(admin.id, "Admin One");
    const out = await addMember(a.id, "A Two");
    await store.members.setStatus(out.id, "INACTIVE");
    expect(must(await getDashboard(store, actorOf(admin), { month: "2026-10" })).activeMembers).toBe(2);
  });

  it("shows the 10 newest expenses of the month, newest first, by day then time recorded, every category", async () => {
    const { store, admin, a, addMember, spend, lend } = await build();
    const m = await addMember(a.id, "A One");
    const saved = [];
    for (let day = 1; day <= 11; day += 1) {
      saved.push(await spend("Allowances", BigInt(day), `2026-10-${String(day).padStart(2, "0")}`, admin.id));
    }
    const sameDay = await spend("Expenses", 12n, "2026-10-11", admin.id);
    const loan = await lend(m.id, 13n, "2026-10-11", admin.id);
    await spend("Allowances", 14n, "2026-11-01", admin.id);
    const v = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(RECENT_EXPENSES).toBe(10);
    expect(v.recentExpenses).toHaveLength(10);
    expect(v.recentExpenses[0]).toMatchObject({ category: "Loan", amount: "0.13", spentOn: "2026-10-11" });
    expect(v.recentExpenses[1]?.id).toBe(sameDay.id);
    expect(v.recentExpenses.slice(2).map((e) => e.id)).toEqual(saved.slice(3).reverse().map((e) => e.id));
    expect(loan.id).toBeTruthy();
    expect(Object.keys(v.recentExpenses[0] as object).sort()).toEqual([
      "amount",
      "category",
      "createdAt",
      "createdById",
      "description",
      "id",
      "method",
      "narration",
      "spentOn",
    ]);
  });

  it("writes nothing, not even an audit entry", async () => {
    const { store, admin, a, addMember, pay } = await build();
    const m = await addMember(a.id, "A One");
    await pay(m.id, "2026-10-05", [["Savings", 1n]], a.id);
    must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(await store.audit.list({ limit: 100, offset: 0 })).toEqual([]);
  });
});

describe("getDashboard: scope (DR-13, D-99)", () => {
  /** a and b each record a member; the Super Admin pays into, lends to and spends for a's member. */
  async function buildScope() {
    const base = await build();
    const { admin, a, b, addMember, pay, spend, lend } = base;
    const ma = await addMember(a.id, "A One");
    const mb = await addMember(b.id, "B One");
    await pay(ma.id, "2026-10-05", [["Savings", 100n]], a.id);
    await pay(ma.id, "2026-10-06", [["Shares", 200n]], admin.id);
    await pay(mb.id, "2026-10-05", [["Savings", 400n]], b.id);
    await lend(ma.id, 1_000n, "2026-10-07", admin.id);
    await lend(mb.id, 2_000n, "2026-10-07", b.id);
    await spend("Allowances", 10n, "2026-10-08", a.id);
    await spend("Allowances", 20n, "2026-10-08", b.id);
    await spend("Allowances", 40n, "2026-10-08", admin.id);
    return { ...base, ma, mb };
  }

  it("gives Staff the payments and loans of their members, whoever recorded them, and their own expenses", async () => {
    const { store, a } = await buildScope();
    const v = must(await getDashboard(store, actorOf(a), { month: "2026-10" }));
    expect(v.income).toEqual({ month: "3.00", allTime: "3.00" });
    expect(v.outstandingLoans).toBe("10.00");
    expect(v.expenditure).toEqual({ month: "0.10", allTime: "0.10" });
    expect(v.recentExpenses.map((e) => e.amount)).toEqual(["0.10"]);
    expect(v.activeMembers).toBe(1);
  });

  it("ignores a Staff createdById filter", async () => {
    const { store, a, b } = await buildScope();
    const own = must(await getDashboard(store, actorOf(a), { month: "2026-10" }));
    expect(must(await getDashboard(store, actorOf(a), { month: "2026-10", createdById: b.id }))).toEqual(own);
  });

  it("gives the Super Admin everything, or one user's with createdById", async () => {
    const { store, admin, b } = await buildScope();
    const all = must(await getDashboard(store, actorOf(admin), { month: "2026-10" }));
    expect(all.income.month).toBe("7.00");
    expect(all.outstandingLoans).toBe("30.00");
    expect(all.expenditure.month).toBe("0.70");
    expect(all.activeMembers).toBe(2);
    const one = must(await getDashboard(store, actorOf(admin), { month: "2026-10", createdById: b.id }));
    expect(one.income.month).toBe("4.00");
    expect(one.outstandingLoans).toBe("20.00");
    expect(one.expenditure.month).toBe("0.20");
    expect(one.activeMembers).toBe(1);
    const nobody = must(await getDashboard(store, actorOf(admin), { month: "2026-10", createdById: "no-such-user" }));
    expect(nobody.income).toEqual(ZERO);
    expect(nobody.activeMembers).toBe(0);
  });
});

describe("getDashboard: Lagos month end (A-233 item 2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts a payment saved without a day at 23:30 UTC on 31 October in November", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T23:30:00.000Z"));
    const r = await createPayment(store, { id: a.id, subject: subjectOf(a) }, {
      idempotencyKey: "dashboard-month-end-0001",
      memberId: m.id,
      method: "CASH",
      total: "50",
      lines: [{ category: "Savings", amount: "50" }],
    });
    expect(r).toMatchObject({ ok: true, value: { paidOn: "2026-11-01" } });
    expect(must(await getDashboard(store, actorOf(a), {})).month).toBe("2026-11");
    vi.useRealTimers();
    expect(must(await getDashboard(store, actorOf(a), { month: "2026-10" })).income.month).toBe("0.00");
    expect(must(await getDashboard(store, actorOf(a), { month: "2026-11" })).income.month).toBe("50.00");
  });

  it("keeps a payment saved at 22:59 UTC on 31 October in October", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T22:59:00.000Z"));
    const r = await createPayment(store, { id: a.id, subject: subjectOf(a) }, {
      idempotencyKey: "dashboard-month-end-0002",
      memberId: m.id,
      method: "CASH",
      total: "50",
      lines: [{ category: "Savings", amount: "50" }],
    });
    expect(r).toMatchObject({ ok: true, value: { paidOn: "2026-10-31" } });
    vi.useRealTimers();
    expect(must(await getDashboard(store, actorOf(a), { month: "2026-10" })).income.month).toBe("50.00");
  });
});

describe("getDashboard on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("gives the same figures read back from the database", async () => {
    const { admin, a, addMember, pay, spend, lend } = await build(store);
    const m = await addMember(a.id, "P One");
    const loan = await lend(m.id, 30_000_000n, "2026-10-02", admin.id);
    await pay(m.id, "2026-10-31", [["Loan Repaid", 2_000_000n, loan.id], ["Savings", 1n]], a.id);
    await pay(m.id, "2026-11-01", [["Savings", 10n]], a.id);
    await spend("Membership Withdrawal", 5n, "2026-10-03", admin.id);
    await spend("Allowances", 7n, "2026-10-01", a.id);
    const v = must(await getDashboard(store, actorOf(a), { month: "2026-10" }));
    expect(v.income).toEqual({ month: "20000.01", allTime: "20000.11" });
    expect(v.expenditure).toEqual({ month: "0.07", allTime: "0.07" });
    expect(v.membershipWithdrawal).toEqual(ZERO);
    expect(v.outstandingLoans).toBe("280000.00");
    expect(v.activeMembers).toBe(1);
    expect(v.recentExpenses.map((e) => e.amount)).toEqual(["0.07"]);
  });
});
