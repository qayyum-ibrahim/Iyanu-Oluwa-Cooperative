import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PAYMENT_CATEGORIES, REFUNDABLE_CATEGORIES } from "../src/categories.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPrismaStore } from "../src/prisma-store.js";
import {
  getCategoryReport,
  type CategoryReportResult,
  type CategoryReportView,
  type CategoryRow,
  type ReportActor,
} from "../src/reports.js";
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
  const a = await make("staff-a", "STAFF", ["reports.view"]);
  const b = await make("staff-b", "STAFF", ["reports.view"]);
  const noReports = await make("no-reports", "STAFF", ["dashboard", "payments.view"]);
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  const pay = (memberId: string, paidOn: string, lines: [string, bigint][], createdById: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      paidOn,
      total: lines.reduce((t, [, amount]) => t + amount, 0n),
      lines: lines.map(([category, amount]) => ({ category, amount })),
      createdById,
    });
  const payOff = (memberId: string, lines: [string, bigint][], createdById: string) =>
    store.payOffs.create({
      memberId,
      method: "CASH",
      total: lines.reduce((t, [, amount]) => t + amount, 0n),
      lines: lines.map(([category, amount]) => ({ category, amount })),
      createdById,
    });
  return { store, admin, a, b, noReports, addMember, pay, payOff };
}

const actorOf = (u: UserRecord): ReportActor => ({ id: u.id, subject: subjectOf(u) });

function must(r: CategoryReportResult): CategoryReportView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

/** The rows that are not all zero, as [category, paid, paidOut]. */
function nonZero(v: CategoryReportView): [string, string, string][] {
  return v.categories
    .filter((c) => c.paid !== "0.00" || c.paidOut !== "0.00")
    .map((c) => [c.category, c.paid, c.paidOut]);
}

describe("getCategoryReport: refusals", () => {
  it("refuses Staff without reports.view (dashboard is not enough), before the input", async () => {
    const { store, noReports } = await build();
    expect(await getCategoryReport(store, actorOf(noReports), {})).toEqual({ ok: false, reason: "forbidden" });
    expect(await getCategoryReport(store, actorOf(noReports), { fromDay: "bad" })).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, admin } = await build();
    const inactive: ReportActor = { id: admin.id, subject: { ...subjectOf(admin), isActive: false } };
    expect(await getCategoryReport(store, inactive, {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it.each([[""], [5], ["x".repeat(101)], [["id"]], [null]])(
    "answers invalid_created_by_id for %j, Staff too",
    async (createdById) => {
      const { store, admin, a } = await build();
      for (const u of [admin, a]) {
        expect(await getCategoryReport(store, actorOf(u), { createdById })).toEqual({
          ok: false,
          reason: "invalid_input",
          code: "invalid_created_by_id",
        });
      }
    },
  );

  it("accepts a createdById of 100 characters", async () => {
    const { store, admin } = await build();
    expect((await getCategoryReport(store, actorOf(admin), { createdById: "x".repeat(100) })).ok).toBe(true);
  });

  it.each([["2026-02-30"], ["2026-10"], [""], [null], [20261001], [["2026-10-01"]]])(
    "answers invalid_from_day and invalid_to_day for %j",
    async (day) => {
      const { store, a } = await build();
      expect(await getCategoryReport(store, actorOf(a), { fromDay: day })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_from_day",
      });
      expect(await getCategoryReport(store, actorOf(a), { toDay: day })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_to_day",
      });
    },
  );

  it("answers invalid_range when fromDay is after toDay; one day is a range", async () => {
    const { store, a } = await build();
    expect(await getCategoryReport(store, actorOf(a), { fromDay: "2026-10-02", toDay: "2026-10-01" })).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_range",
    });
    expect((await getCategoryReport(store, actorOf(a), { fromDay: "2026-10-01", toDay: "2026-10-01" })).ok).toBe(true);
  });

  it("checks createdById, then fromDay, then toDay", async () => {
    const { store, a } = await build();
    expect(await getCategoryReport(store, actorOf(a), { createdById: "", fromDay: "x", toDay: "x" })).toMatchObject({
      code: "invalid_created_by_id",
    });
    expect(await getCategoryReport(store, actorOf(a), { fromDay: "x", toDay: "x" })).toMatchObject({
      code: "invalid_from_day",
    });
  });
});

describe("getCategoryReport: figures", () => {
  it("gives every DR-04 category in order, zeros, for an empty store", async () => {
    const { store, admin } = await build();
    const v = must(await getCategoryReport(store, actorOf(admin), {}));
    expect(v.fromDay).toBeNull();
    expect(v.toDay).toBeNull();
    expect(v.categories.map((c) => c.category)).toEqual(PAYMENT_CATEGORIES);
    expect(v.categories.filter((c) => c.refundable).map((c) => c.category)).toEqual(REFUNDABLE_CATEGORIES);
    expect(v.categories.every((c) => c.paid === "0.00" && c.paidOut === "0.00")).toBe(true);
    expect(v.totalPaid).toBe("0.00");
    expect(v.totalPaidOut).toBe("0.00");
    expect(Object.keys(v).sort()).toEqual(["categories", "fromDay", "toDay", "totalPaid", "totalPaidOut"]);
    const row: CategoryRow | undefined = v.categories[0];
    expect(row).toEqual({ category: "Shares", refundable: true, paid: "0.00", paidOut: "0.00" });
  });

  it("adds payment lines per category, exactly, and the total matches", async () => {
    const { store, a, addMember, pay } = await build();
    const m = await addMember(a.id, "A One");
    await pay(m.id, "2026-10-01", [["Savings", 1_000_000n], ["Development Levy", 50_001n]], a.id);
    await pay(m.id, "2026-10-05", [["Savings", 99n], ["Loan Interest", 7n], ["Building Funds", 3n]], a.id);
    const v = must(await getCategoryReport(store, actorOf(a), { fromDay: "2026-10-01", toDay: "2026-10-31" }));
    expect(v.fromDay).toBe("2026-10-01");
    expect(v.toDay).toBe("2026-10-31");
    expect(nonZero(v)).toEqual([
      ["Savings", "10000.99", "0.00"],
      ["Development Levy", "500.01", "0.00"],
      ["Loan Interest", "0.07", "0.00"],
      ["Building Funds", "0.03", "0.00"],
    ]);
    expect(v.totalPaid).toBe("10501.10");
  });

  it("keeps both days of the range and leaves out the days around it", async () => {
    const { store, a, addMember, pay } = await build();
    const m = await addMember(a.id, "A One");
    await pay(m.id, "2026-09-30", [["Shares", 1n]], a.id);
    await pay(m.id, "2026-10-01", [["Shares", 10n]], a.id);
    await pay(m.id, "2026-10-31", [["Shares", 100n]], a.id);
    await pay(m.id, "2026-11-01", [["Shares", 1000n]], a.id);
    const range = must(await getCategoryReport(store, actorOf(a), { fromDay: "2026-10-01", toDay: "2026-10-31" }));
    expect(range.totalPaid).toBe("1.10");
    expect(must(await getCategoryReport(store, actorOf(a), { fromDay: "2026-10-31" })).totalPaid).toBe("11.00");
    expect(must(await getCategoryReport(store, actorOf(a), { toDay: "2026-10-01" })).totalPaid).toBe("0.11");
    expect(must(await getCategoryReport(store, actorOf(a), {})).totalPaid).toBe("11.11");
  });

  it("shows pay-offs beside the payments, not taken off", async () => {
    const { store, a, addMember, pay, payOff } = await build();
    const m = await addMember(a.id, "A One");
    const today = new Date().toISOString().slice(0, 10);
    await pay(m.id, "2026-10-01", [["Shares", 500n], ["Savings", 300n], ["Entrance Fee", 20n]], a.id);
    await payOff(m.id, [["Shares", 500n], ["Savings", 300n]], a.id);
    const v = must(await getCategoryReport(store, actorOf(a), {}));
    expect(nonZero(v)).toEqual([
      ["Shares", "5.00", "5.00"],
      ["Savings", "3.00", "3.00"],
      ["Entrance Fee", "0.20", "0.00"],
    ]);
    expect(v.totalPaid).toBe("8.20");
    expect(v.totalPaidOut).toBe("8.00");
    // The pay-off is not in a range that ends before 2026-10-02 (it was saved today or later).
    expect(today >= "2026-10-02").toBe(true);
    expect(must(await getCategoryReport(store, actorOf(a), { toDay: "2026-10-01" })).totalPaidOut).toBe("0.00");
  });

  it("gives a stored category outside DR-04 a row of its own after the table", async () => {
    const { store, a, addMember, pay } = await build();
    const m = await addMember(a.id, "A One");
    await pay(m.id, "2026-10-01", [["Old Category", 5n], ["Shares", 1n]], a.id);
    const v = must(await getCategoryReport(store, actorOf(a), {}));
    expect(v.categories.map((c) => c.category)).toEqual([...PAYMENT_CATEGORIES, "Old Category"]);
    expect(v.categories.at(-1)).toEqual({ category: "Old Category", refundable: false, paid: "0.05", paidOut: "0.00" });
    expect(v.totalPaid).toBe("0.06");
  });

  it("writes nothing, not even an audit entry", async () => {
    const { store, admin, a, addMember, pay } = await build();
    const m = await addMember(a.id, "A One");
    await pay(m.id, "2026-10-01", [["Shares", 1n]], a.id);
    const before = await store.audit.list({ limit: 1000, offset: 0 });
    must(await getCategoryReport(store, actorOf(admin), {}));
    expect(await store.audit.list({ limit: 1000, offset: 0 })).toEqual(before);
  });
});

describe("getCategoryReport: scope (DR-13, D-99)", () => {
  async function buildScope() {
    const t = await build();
    const ma = await t.addMember(t.a.id, "A One");
    const mb = await t.addMember(t.b.id, "B One");
    // The Super Admin records for b's member: it counts for b (the member's recorder).
    await t.pay(ma.id, "2026-10-01", [["Shares", 3n]], t.a.id);
    await t.pay(mb.id, "2026-10-01", [["Shares", 4n]], t.admin.id);
    await t.payOff(ma.id, [["Shares", 1n]], t.a.id);
    await t.payOff(mb.id, [["Shares", 2n]], t.admin.id);
    return t;
  }

  it("gives Staff only the members they recorded", async () => {
    const { store, a, b } = await buildScope();
    const va = must(await getCategoryReport(store, actorOf(a), {}));
    expect([va.totalPaid, va.totalPaidOut]).toEqual(["0.03", "0.01"]);
    const vb = must(await getCategoryReport(store, actorOf(b), {}));
    expect([vb.totalPaid, vb.totalPaidOut]).toEqual(["0.04", "0.02"]);
  });

  it("ignores a Staff createdById filter", async () => {
    const { store, a, b } = await buildScope();
    const own = must(await getCategoryReport(store, actorOf(a), {}));
    expect(must(await getCategoryReport(store, actorOf(a), { createdById: b.id }))).toEqual(own);
  });

  it("gives the Super Admin everything, or one user's members with createdById", async () => {
    const { store, admin, b } = await buildScope();
    const all = must(await getCategoryReport(store, actorOf(admin), {}));
    expect([all.totalPaid, all.totalPaidOut]).toEqual(["0.07", "0.03"]);
    const one = must(await getCategoryReport(store, actorOf(admin), { createdById: b.id }));
    expect([one.totalPaid, one.totalPaidOut]).toEqual(["0.04", "0.02"]);
    const nobody = must(await getCategoryReport(store, actorOf(admin), { createdById: "no-such-user" }));
    expect([nobody.totalPaid, nobody.totalPaidOut]).toEqual(["0.00", "0.00"]);
  });
});

describe("getCategoryReport: a pay-off's day is its Lagos day (A-238 item 2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function payOffAt(iso: string) {
    const t = await build();
    const m = await t.addMember(t.a.id, "A One");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    await t.payOff(m.id, [["Savings", 50n]], t.a.id);
    vi.useRealTimers();
    return t;
  }

  it("counts a pay-off saved at 23:30 UTC on 31 October on 1 November", async () => {
    const { store, a } = await payOffAt("2026-10-31T23:30:00.000Z");
    const oct = { fromDay: "2026-10-01", toDay: "2026-10-31" };
    expect(must(await getCategoryReport(store, actorOf(a), oct)).totalPaidOut).toBe("0.00");
    const nov = { fromDay: "2026-11-01", toDay: "2026-11-01" };
    expect(must(await getCategoryReport(store, actorOf(a), nov)).totalPaidOut).toBe("0.50");
  });

  it("keeps a pay-off saved at 22:59 UTC on 31 October on 31 October", async () => {
    const { store, a } = await payOffAt("2026-10-31T22:59:00.000Z");
    const oct = { fromDay: "2026-10-31", toDay: "2026-10-31" };
    expect(must(await getCategoryReport(store, actorOf(a), oct)).totalPaidOut).toBe("0.50");
    expect(must(await getCategoryReport(store, actorOf(a), { fromDay: "2026-11-01" })).totalPaidOut).toBe("0.00");
  });
});

describe("getCategoryReport on the Prisma store (real PostgreSQL)", () => {
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
    const { admin, a, b, addMember, pay, payOff } = await build(store);
    const ma = await addMember(a.id, "P One");
    const mb = await addMember(b.id, "P Two");
    await pay(ma.id, "2026-10-01", [["Shares", 2_000_000n], ["Loan Repaid", 1n]], a.id);
    await pay(ma.id, "2026-11-01", [["Shares", 10n]], a.id);
    await pay(mb.id, "2026-10-02", [["Savings", 7n]], admin.id);
    await payOff(ma.id, [["Shares", 2_000_010n]], a.id);
    // The pay-off is saved today (the real clock, after 2026-10-02), so this range leaves it out.
    const v = must(await getCategoryReport(store, actorOf(a), { fromDay: "2026-10-01", toDay: "2026-10-02" }));
    expect(nonZero(v)).toEqual([
      ["Shares", "20000.00", "0.00"],
      ["Loan Repaid", "0.01", "0.00"],
    ]);
    const all = must(await getCategoryReport(store, actorOf(admin), {}));
    expect(nonZero(all)).toEqual([
      ["Shares", "20000.10", "20000.10"],
      ["Savings", "0.07", "0.00"],
      ["Loan Repaid", "0.01", "0.00"],
    ]);
  });
});
