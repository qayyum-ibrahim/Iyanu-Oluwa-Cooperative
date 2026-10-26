import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { listExpenses } from "../src/expenses.js";
import {
  exportCashflow,
  exportCategory,
  exportExpenses,
  exportMembers,
  exportTransactions,
  type CategoryExportInput,
  type DayExportInput,
  type ExportActor,
  type ExportResult,
} from "../src/exports.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPrismaStore } from "../src/prisma-store.js";
import { getCategoryReport } from "../src/reports.js";
import type { Role, Store, UserRecord } from "../src/store.js";
import { WorkbookError } from "../src/workbook.js";
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
  const admin = await make("Admin Test", "SUPER_ADMIN", []);
  const a = await make("Staff A", "STAFF", ["reports.export"]);
  const b = await make("Staff B", "STAFF", ["reports.export"]);
  const noExport = await make("No Export", "STAFF", [
    "dashboard",
    "members.view",
    "payments.view",
    "expenses.view",
    "reports.view",
  ]);
  const addMember = (createdById: string, fullName: string, phone = "08000000000") =>
    store.members.create({ fullName, phone, address: "", occupation: "Trader", createdById });
  const pay = (
    memberId: string,
    paidOn: string,
    lines: [string, bigint][],
    createdById: string,
    method: "CASH" | "BANK_TRANSFER" = "CASH",
  ) =>
    store.payments.create({
      memberId,
      method,
      paidOn,
      total: lines.reduce((t, [, amount]) => t + amount, 0n),
      lines: lines.map(([category, amount]) => ({ category, amount })),
      createdById,
    });
  const spend = (
    createdById: string,
    spentOn: string,
    category: string,
    amount: bigint,
    more: { description?: string; narration?: string; method?: "CASH" | "BANK_TRANSFER" } = {},
  ) =>
    store.expenses.create({
      category,
      amount,
      method: more.method ?? "CASH",
      spentOn,
      description: more.description ?? "",
      narration: more.narration ?? "",
      createdById,
    });
  return { store, admin, a, b, noExport, addMember, pay, spend };
}

const actorOf = (u: UserRecord): ExportActor => ({ id: u.id, subject: subjectOf(u) });

function must(r: ExportResult): Buffer {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason} ${r.code ?? ""}`);
  return r.value;
}

/** Every row of the one sheet, header first, each cell as exceljs reads it back. */
async function table(file: Buffer, name: string): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  expect(workbook.worksheets.map((w) => w.name)).toEqual([name]);
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`no sheet ${name}`);
  const rows: unknown[][] = [];
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: unknown[] = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) cells.push(row.getCell(c).value);
    rows.push(cells);
  }
  return rows;
}

const exportsAudit = async (store: Store) =>
  (await store.audit.list({ limit: 1000, offset: 0, action: "export.created" })).map((e) => ({
    actorId: e.actorId,
    entityType: e.entityType,
    entityId: e.entityId,
    detail: e.detail,
  }));

type Exporter = (store: Store, actor: ExportActor, input: DayExportInput) => Promise<ExportResult>;
// The category export with a valid category, so the shared checks can be run on it.
const shares: Exporter = (store, actor, input) => exportCategory(store, actor, { category: "Shares", ...input });
const allowances: Exporter = (store, actor, input) =>
  exportCategory(store, actor, { category: "Allowances", ...input });
const ALL: [string, Exporter][] = [
  ["exportMembers", exportMembers],
  ["exportTransactions", exportTransactions],
  ["exportExpenses", exportExpenses],
  ["exportCashflow", exportCashflow],
  ["exportCategory (Shares)", shares],
  ["exportCategory (Allowances)", allowances],
];
const WITH_DAYS: [string, Exporter][] = [
  ["exportTransactions", exportTransactions],
  ["exportExpenses", exportExpenses],
  ["exportCashflow", exportCashflow],
  ["exportCategory (Shares)", shares],
  ["exportCategory (Allowances)", allowances],
];

const MEMBER_HEADER = ["Name", "Membership ID", "Phone", "Occupation", "Status", "Date joined", "Recorded by"];
const TRANSACTION_HEADER = ["Date paid", "Membership ID", "Member", "Category", "Amount (₦)", "Method", "Recorded by"];
const EXPENSE_HEADER = ["Date spent", "Category", "Description", "Narration", "Amount (₦)", "Method", "Recorded by"];
const CASHFLOW_HEADER = [
  "Date",
  "Flow",
  "Category",
  "Membership ID",
  "Member",
  "Description",
  "Narration",
  "In (₦)",
  "Outflow (₦)",
  "Method",
  "Recorded by",
];

describe("exports: refusals", () => {
  it.each(ALL)("%s refuses Staff without reports.export (reports.view is not enough), before the input", async (_, run) => {
    const { store, noExport } = await build();
    expect(await run(store, actorOf(noExport), {})).toEqual({ ok: false, reason: "forbidden" });
    expect(await run(store, actorOf(noExport), { createdById: "" })).toEqual({ ok: false, reason: "forbidden" });
  });

  it.each(ALL)("%s refuses an inactive Super Admin", async (_, run) => {
    const { store, admin } = await build();
    const inactive: ExportActor = { id: admin.id, subject: { ...subjectOf(admin), isActive: false } };
    expect(await run(store, inactive, {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it.each(ALL)("%s answers invalid_created_by_id, Staff too", async (_, run) => {
    const { store, admin, a } = await build();
    for (const createdById of ["", 5, "x".repeat(101), ["id"], null]) {
      for (const u of [admin, a]) {
        expect(await run(store, actorOf(u), { createdById })).toEqual({
          ok: false,
          reason: "invalid_input",
          code: "invalid_created_by_id",
        });
      }
    }
  });

  it.each(ALL)("%s accepts a createdById of 100 characters", async (_, run) => {
    const { store, admin } = await build();
    expect((await run(store, actorOf(admin), { createdById: "x".repeat(100) })).ok).toBe(true);
  });

  it.each(WITH_DAYS)("%s answers invalid_from_day, invalid_to_day and invalid_range", async (_, run) => {
    const { store, a } = await build();
    for (const day of ["2026-02-30", "2026-10", "", null, 20261001, ["2026-10-01"], "2026-10-01T00:00:00Z"]) {
      expect(await run(store, actorOf(a), { fromDay: day })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_from_day",
      });
      expect(await run(store, actorOf(a), { toDay: day })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_to_day",
      });
    }
    expect(await run(store, actorOf(a), { fromDay: "2026-10-02", toDay: "2026-10-01" })).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_range",
    });
    expect((await run(store, actorOf(a), { fromDay: "2026-10-01", toDay: "2026-10-01" })).ok).toBe(true);
  });

  it.each(WITH_DAYS)("%s checks createdById, then fromDay, then toDay", async (_, run) => {
    const { store, a } = await build();
    expect(await run(store, actorOf(a), { createdById: "", fromDay: "x", toDay: "x" })).toMatchObject({
      code: "invalid_created_by_id",
    });
    expect(await run(store, actorOf(a), { fromDay: "x", toDay: "x" })).toMatchObject({ code: "invalid_from_day" });
  });

  it("exportMembers takes no days: they are not read", async () => {
    const { store, a } = await build();
    const input = { fromDay: "bad", toDay: "bad" } as unknown as DayExportInput;
    expect((await exportMembers(store, actorOf(a), input)).ok).toBe(true);
  });

  it("writes no audit entry for a refusal", async () => {
    const { store, a, noExport } = await build();
    for (const [, run] of ALL) {
      await run(store, actorOf(noExport), {});
      await run(store, actorOf(a), { createdById: "" });
    }
    await exportExpenses(store, actorOf(a), { fromDay: "2026-10-02", toDay: "2026-10-01" });
    await exportCategory(store, actorOf(a), {});
    expect(await exportsAudit(store)).toEqual([]);
  });

  it("exportCategory answers invalid_category for a missing or unknown category, Super Admin too", async () => {
    const { store, admin, a } = await build();
    for (const category of [undefined, "", "shares", " Shares", "Loans", "Total", 5, null, ["Shares"]]) {
      for (const u of [admin, a]) {
        expect(await exportCategory(store, actorOf(u), { category })).toEqual({
          ok: false,
          reason: "invalid_input",
          code: "invalid_category",
        });
      }
    }
  });

  it("exportCategory checks permission, then createdById, then category, then fromDay", async () => {
    const { store, a, noExport } = await build();
    expect(await exportCategory(store, actorOf(noExport), { category: "x" })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const bad: CategoryExportInput = { createdById: "", category: "x", fromDay: "x" };
    expect(await exportCategory(store, actorOf(a), bad)).toMatchObject({ code: "invalid_created_by_id" });
    expect(await exportCategory(store, actorOf(a), { category: "x", fromDay: "x" })).toMatchObject({
      code: "invalid_category",
    });
    expect(await exportCategory(store, actorOf(a), { category: "Shares", fromDay: "x" })).toMatchObject({
      code: "invalid_from_day",
    });
  });

  it("the other exports do not read a category", async () => {
    const { store, a } = await build();
    const input = { category: "bad" } as unknown as DayExportInput;
    for (const run of [exportMembers, exportTransactions, exportExpenses, exportCashflow]) {
      expect((await run(store, actorOf(a), input)).ok).toBe(true);
    }
  });
});

describe("exportMembers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists every member in scope, Active and Inactive, in Membership ID order, with no Total row", async () => {
    const { store, admin, a, addMember } = await build();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 23:30 UTC on 31 October is 1 November in Lagos.
    vi.setSystemTime(new Date("2026-10-31T23:30:00.000Z"));
    const m1 = await addMember(a.id, "Ada Test");
    vi.setSystemTime(new Date("2026-10-31T22:59:00.000Z"));
    const m2 = await addMember(admin.id, "Bola Test", "");
    vi.useRealTimers();
    await store.members.setStatus(m2.id, "INACTIVE");
    const rows = await table(must(await exportMembers(store, actorOf(admin), {})), "Members");
    expect(rows[0]).toEqual(MEMBER_HEADER);
    expect(rows.slice(1)).toEqual([
      ["Ada Test", m1.membershipId, "08000000000", "Trader", "Active", "2026-11-01", "Staff A"],
      ["Bola Test", m2.membershipId, rows[2]?.[2], "Trader", "Inactive", "2026-10-31", "Admin Test"],
    ]);
    // An empty phone stays empty.
    expect([null, ""]).toContain(rows[2]?.[2]);
  });

  it("gives Staff only the members they recorded and ignores a Staff createdById", async () => {
    const { store, a, b, addMember } = await build();
    await addMember(a.id, "Ada Test");
    await addMember(b.id, "Bola Test");
    const own = await table(must(await exportMembers(store, actorOf(a), {})), "Members");
    expect(own.slice(1).map((r) => r[0])).toEqual(["Ada Test"]);
    const ignored = await table(must(await exportMembers(store, actorOf(a), { createdById: b.id })), "Members");
    expect(ignored).toEqual(own);
  });

  it("gives the Super Admin everyone, or one user's members with createdById", async () => {
    const { store, admin, a, b, addMember } = await build();
    await addMember(a.id, "Ada Test");
    await addMember(b.id, "Bola Test");
    const all = await table(must(await exportMembers(store, actorOf(admin), {})), "Members");
    expect(all.slice(1).map((r) => r[0])).toEqual(["Ada Test", "Bola Test"]);
    const one = await table(must(await exportMembers(store, actorOf(admin), { createdById: b.id })), "Members");
    expect(one.slice(1).map((r) => r[0])).toEqual(["Bola Test"]);
    const nobody = await table(must(await exportMembers(store, actorOf(admin), { createdById: "no-such-user" })), "Members");
    expect(nobody).toEqual([MEMBER_HEADER]);
  });
});

describe("exportTransactions", () => {
  it("gives one row per payment line in the day range, both days included, and a Total in naira", async () => {
    const { store, a, addMember, pay } = await build();
    const m = await addMember(a.id, "Ada Test");
    await pay(m.id, "2026-09-30", [["Shares", 1n]], a.id);
    await pay(m.id, "2026-10-01", [["Savings", 1_000_000n], ["Development Levy", 50_001n]], a.id, "BANK_TRANSFER");
    await pay(m.id, "2026-10-31", [["Loan Interest", 7n]], a.id);
    await pay(m.id, "2026-11-01", [["Shares", 1000n]], a.id);
    const input = { fromDay: "2026-10-01", toDay: "2026-10-31" };
    const rows = await table(must(await exportTransactions(store, actorOf(a), input)), "Transactions");
    expect(rows).toEqual([
      TRANSACTION_HEADER,
      ["2026-10-01", m.membershipId, "Ada Test", "Savings", 10000, "Bank transfer", "Staff A"],
      ["2026-10-01", m.membershipId, "Ada Test", "Development Levy", 500.01, "Bank transfer", "Staff A"],
      ["2026-10-31", m.membershipId, "Ada Test", "Loan Interest", 0.07, "Cash", "Staff A"],
      ["Total", null, null, null, 10500.08, null, null],
    ]);
  });

  it("orders by day paid, not by time recorded, and a missing day is no bound", async () => {
    const { store, a, addMember, pay } = await build();
    const m = await addMember(a.id, "Ada Test");
    await pay(m.id, "2026-10-05", [["Shares", 100n]], a.id);
    await pay(m.id, "2026-10-01", [["Savings", 200n]], a.id);
    const all = await table(must(await exportTransactions(store, actorOf(a), {})), "Transactions");
    expect(all.slice(1).map((r) => [r[0], r[4]])).toEqual([
      ["2026-10-01", 2],
      ["2026-10-05", 1],
      ["Total", 3],
    ]);
    const from = await table(must(await exportTransactions(store, actorOf(a), { fromDay: "2026-10-02" })), "Transactions");
    expect(from.slice(1).map((r) => r[0])).toEqual(["2026-10-05", "Total"]);
  });

  it("leaves pay-offs out, so the Total equals the Categories report Total (Paid)", async () => {
    const { store, admin, a, addMember, pay } = await build();
    const m = await addMember(a.id, "Ada Test");
    await pay(m.id, "2026-10-01", [["Shares", 500n], ["Savings", 333n], ["Entrance Fee", 20n]], a.id);
    await store.payOffs.create({
      memberId: m.id,
      method: "CASH",
      total: 833n,
      lines: [
        { category: "Shares", amount: 500n },
        { category: "Savings", amount: 333n },
      ],
      createdById: admin.id,
    });
    const rows = await table(must(await exportTransactions(store, actorOf(admin), {})), "Transactions");
    expect(rows.slice(1).map((r) => r[3] ?? r[0])).toEqual(["Shares", "Savings", "Entrance Fee", "Total"]);
    const report = await getCategoryReport(store, { id: admin.id, subject: subjectOf(admin) }, {});
    if (!report.ok) throw new Error("report failed");
    expect(rows.at(-1)?.[4]).toBe(Number(report.value.totalPaid));
    expect(rows.at(-1)?.[4]).toBe(8.53);
  });

  it("scopes by the member's recorder; Recorded by is who recorded the payment", async () => {
    const { store, admin, a, b, addMember, pay } = await build();
    const ma = await addMember(a.id, "Ada Test");
    const mb = await addMember(b.id, "Bola Test");
    await pay(ma.id, "2026-10-01", [["Shares", 3n]], a.id);
    // The Super Admin records for b's member: it counts for b.
    await pay(mb.id, "2026-10-01", [["Shares", 4n]], admin.id);
    const forB = await table(must(await exportTransactions(store, actorOf(b), {})), "Transactions");
    expect(forB.slice(1)).toEqual([
      ["2026-10-01", mb.membershipId, "Bola Test", "Shares", 0.04, "Cash", "Admin Test"],
      ["Total", null, null, null, 0.04, null, null],
    ]);
    const ignored = await table(must(await exportTransactions(store, actorOf(b), { createdById: a.id })), "Transactions");
    expect(ignored).toEqual(forB);
    const all = await table(must(await exportTransactions(store, actorOf(admin), {})), "Transactions");
    expect(all.at(-1)?.[4]).toBe(0.07);
    const one = await table(must(await exportTransactions(store, actorOf(admin), { createdById: a.id })), "Transactions");
    expect(one.slice(1).map((r) => [r[2] ?? r[0], r[4]])).toEqual([
      ["Ada Test", 0.03],
      ["Total", 0.03],
    ]);
  });

  it("gives a header and a Total of 0 when nothing is in range", async () => {
    const { store, a } = await build();
    const rows = await table(must(await exportTransactions(store, actorOf(a), {})), "Transactions");
    expect(rows).toEqual([TRANSACTION_HEADER, ["Total", null, null, null, 0, null, null]]);
  });
});

describe("exportExpenses", () => {
  it("gives running costs not deleted in the day range, no Loan or Membership Withdrawal; the Total equals the Expenses page (D-107)", async () => {
    const { store, admin, addMember, spend } = await build();
    await spend(admin.id, "2026-09-30", "Allowances", 1n);
    const office = await spend(admin.id, "2026-10-01", "Office Maintenance", 1_500_000n, {
      description: "Fan repair",
      method: "BANK_TRANSFER",
    });
    await spend(admin.id, "2026-10-02", "Others", 25n, { narration: "Water for the meeting" });
    // A stored name outside DR-11 stays listed, as on the Expenses page (A-261 item 4).
    await spend(admin.id, "2026-10-02", "Old Category", 100n);
    const deleted = await spend(admin.id, "2026-10-02", "Allowances", 999n);
    await store.expenses.softDelete(deleted.id, admin.id);
    const m = await addMember(admin.id, "Ada Test");
    const loan = await store.loans.create({ memberId: m.id, principal: 30_000_000n, givenOn: "2026-10-03", createdById: admin.id });
    await store.expenses.create({
      category: "Loan",
      amount: 30_000_000n,
      method: "CASH",
      spentOn: "2026-10-03",
      loanId: loan.id,
      createdById: admin.id,
    });
    await spend(admin.id, "2026-10-31", "Membership Withdrawal", 2_500_000n);
    await spend(admin.id, "2026-11-01", "Allowances", 1000n);
    const input = { fromDay: "2026-10-01", toDay: "2026-10-31" };
    const rows = await table(must(await exportExpenses(store, actorOf(admin), input)), "Expenses");
    const empty = rows[1]?.[3];
    expect([null, ""]).toContain(empty);
    expect(rows).toEqual([
      EXPENSE_HEADER,
      ["2026-10-01", "Office Maintenance", "Fan repair", empty, 15000, "Bank transfer", "Admin Test"],
      ["2026-10-02", "Others", empty, "Water for the meeting", 0.25, "Cash", "Admin Test"],
      ["2026-10-02", "Old Category", empty, empty, 1, "Cash", "Admin Test"],
      ["Total", null, null, null, 15001.25, null, null],
    ]);
    const page = await listExpenses(store, { id: admin.id, subject: subjectOf(admin) }, input);
    if (!page.ok) throw new Error("list failed");
    expect(page.value.total).toBe("15001.25");
    expect(rows.at(-1)?.[4]).toBe(Number(page.value.total));
    // The Loan and Membership Withdrawal rows are still in the cashflow Out side (Total Outflow).
    const flow = await table(must(await exportCashflow(store, actorOf(admin), input)), "Cashflow");
    expect(flow.at(-1)?.[8]).toBe(15001.25 + 300000 + 25000);
    expect(office.id).toBeTruthy();
  });

  it("gives Staff only the expenses they recorded; the Super Admin all or one user's", async () => {
    const { store, admin, a, b, spend } = await build();
    await spend(a.id, "2026-10-01", "Allowances", 10n);
    await spend(b.id, "2026-10-01", "Allowances", 20n);
    await spend(admin.id, "2026-10-01", "Allowances", 40n);
    const total = async (u: UserRecord, input: DayExportInput) =>
      (await table(must(await exportExpenses(store, actorOf(u), input)), "Expenses")).at(-1)?.[4];
    expect(await total(a, {})).toBe(0.1);
    expect(await total(a, { createdById: b.id })).toBe(0.1);
    expect(await total(b, {})).toBe(0.2);
    expect(await total(admin, {})).toBe(0.7);
    expect(await total(admin, { createdById: b.id })).toBe(0.2);
    expect(await total(admin, { createdById: "no-such-user" })).toBe(0);
  });
});

describe("exportCashflow", () => {
  it("gives payment lines as In and expenses as Out by day, In first on a day, with both totals", async () => {
    const { store, admin, a, addMember, pay, spend } = await build();
    const m = await addMember(a.id, "Ada Test");
    await spend(a.id, "2026-10-01", "Allowances", 300n, { description: "Transport" });
    await pay(m.id, "2026-10-02", [["Shares", 1_000_000n]], a.id);
    await pay(m.id, "2026-10-01", [["Savings", 500n], ["Entrance Fee", 20n]], a.id, "BANK_TRANSFER");
    await spend(a.id, "2026-10-03", "Others", 7n, { narration: "Water" });
    await spend(a.id, "2026-09-30", "Allowances", 1n);
    await pay(m.id, "2026-11-01", [["Shares", 1n]], a.id);
    const input = { fromDay: "2026-10-01", toDay: "2026-10-31" };
    const rows = await table(must(await exportCashflow(store, actorOf(a), input)), "Cashflow");
    const empty = rows[3]?.[6];
    expect([null, ""]).toContain(empty);
    const id = m.membershipId;
    expect(rows).toEqual([
      CASHFLOW_HEADER,
      ["2026-10-01", "In", "Savings", id, "Ada Test", null, null, 5, null, "Bank transfer", "Staff A"],
      ["2026-10-01", "In", "Entrance Fee", id, "Ada Test", null, null, 0.2, null, "Bank transfer", "Staff A"],
      ["2026-10-01", "Out", "Allowances", null, null, "Transport", empty, null, 3, "Cash", "Staff A"],
      ["2026-10-02", "In", "Shares", id, "Ada Test", null, null, 10000, null, "Cash", "Staff A"],
      ["2026-10-03", "Out", "Others", null, null, empty, "Water", null, 0.07, "Cash", "Staff A"],
      ["Total", null, null, null, null, null, null, 10005.2, 3.07, null, null],
    ]);
    expect(admin.id).toBeTruthy();
  });

  it("In equals the transactions Total and the Categories report; Out is every outflow, the Expenses page none of these (D-107)", async () => {
    const { store, admin, a, addMember, pay, spend } = await build();
    const m = await addMember(a.id, "Ada Test");
    await pay(m.id, "2026-10-01", [["Shares", 500n], ["Savings", 333n]], a.id);
    await store.payOffs.create({
      memberId: m.id,
      method: "CASH",
      total: 833n,
      lines: [
        { category: "Shares", amount: 500n },
        { category: "Savings", amount: 333n },
      ],
      createdById: admin.id,
    });
    await spend(admin.id, "2026-10-01", "Membership Withdrawal", 833n);
    await spend(admin.id, "2026-10-02", "Loan", 10_000n);
    const deleted = await spend(admin.id, "2026-10-02", "Allowances", 999n);
    await store.expenses.softDelete(deleted.id, admin.id);
    const rows = await table(must(await exportCashflow(store, actorOf(admin), {})), "Cashflow");
    expect(rows.slice(1).map((r) => r[1] ?? r[0])).toEqual(["In", "In", "Out", "Out", "Total"]);
    const report = await getCategoryReport(store, { id: admin.id, subject: subjectOf(admin) }, {});
    if (!report.ok) throw new Error("report failed");
    const page = await listExpenses(store, { id: admin.id, subject: subjectOf(admin) }, {});
    if (!page.ok) throw new Error("list failed");
    const tx = await table(must(await exportTransactions(store, actorOf(admin), {})), "Transactions");
    const spent = await table(must(await exportExpenses(store, actorOf(admin), {})), "Expenses");
    expect(rows.at(-1)?.slice(7, 9)).toEqual([8.33, 108.33]);
    expect(rows.at(-1)?.[7]).toBe(Number(report.value.totalPaid));
    expect(rows.at(-1)?.[7]).toBe(tx.at(-1)?.[4]);
    expect(page.value.total).toBe("0.00");
    expect(spent).toEqual([EXPENSE_HEADER, ["Total", null, null, null, 0, null, null]]);
    expect(rows.at(-1)?.[8]).toBe(8.33 + 100);
  });

  it("scopes In by the member's recorder and Out by the expense's recorder", async () => {
    const { store, admin, a, b, addMember, pay, spend } = await build();
    const ma = await addMember(a.id, "Ada Test");
    const mb = await addMember(b.id, "Bola Test");
    await pay(ma.id, "2026-10-01", [["Shares", 1n]], a.id);
    await pay(mb.id, "2026-10-01", [["Shares", 2n]], admin.id);
    await spend(a.id, "2026-10-01", "Allowances", 10n);
    await spend(b.id, "2026-10-01", "Allowances", 20n);
    const totals = async (u: UserRecord, input: DayExportInput) =>
      (await table(must(await exportCashflow(store, actorOf(u), input)), "Cashflow")).at(-1)?.slice(7, 9);
    expect(await totals(a, {})).toEqual([0.01, 0.1]);
    expect(await totals(a, { createdById: b.id })).toEqual([0.01, 0.1]);
    expect(await totals(b, {})).toEqual([0.02, 0.2]);
    expect(await totals(admin, {})).toEqual([0.03, 0.3]);
    expect(await totals(admin, { createdById: b.id })).toEqual([0.02, 0.2]);
  });

  it("gives a header and two Totals of 0 when nothing is in range", async () => {
    const { store, a } = await build();
    const rows = await table(must(await exportCashflow(store, actorOf(a), {})), "Cashflow");
    expect(rows).toEqual([CASHFLOW_HEADER, ["Total", null, null, null, null, null, null, 0, 0, null, null]]);
  });
});

describe("exportCategory", () => {
  it("a payment category gives its payment lines; the Total equals its Paid in the Categories report", async () => {
    const { store, admin, a, addMember, pay, spend } = await build();
    const m = await addMember(a.id, "Ada Test");
    await pay(m.id, "2026-10-01", [["Shares", 500n], ["Savings", 333n]], a.id);
    await pay(m.id, "2026-10-05", [["Special Savings", 9n], ["Shares", 1_000_000n]], a.id, "BANK_TRANSFER");
    await pay(m.id, "2026-11-01", [["Shares", 1n]], a.id);
    await spend(admin.id, "2026-10-01", "Allowances", 50n);
    const input = { category: "Shares", fromDay: "2026-10-01", toDay: "2026-10-31" };
    const rows = await table(must(await exportCategory(store, actorOf(a), input)), "Shares");
    expect(rows).toEqual([
      TRANSACTION_HEADER,
      ["2026-10-01", m.membershipId, "Ada Test", "Shares", 5, "Cash", "Staff A"],
      ["2026-10-05", m.membershipId, "Ada Test", "Shares", 10000, "Bank transfer", "Staff A"],
      ["Total", null, null, null, 10005, null, null],
    ]);
    // Staff A has no reports.view; the Super Admin sees the same lines here.
    const report = await getCategoryReport(store, { id: admin.id, subject: subjectOf(admin) }, {
      fromDay: input.fromDay,
      toDay: input.toDay,
    });
    if (!report.ok) throw new Error("report failed");
    const row = report.value.categories.find((c) => c.category === "Shares");
    expect(rows.at(-1)?.[4]).toBe(Number(row?.paid));
    // Special Savings is its own category: Savings does not match it.
    const savings = await table(must(await exportCategory(store, actorOf(a), { category: "Savings" })), "Savings");
    expect(savings.slice(1).map((r) => r[4])).toEqual([3.33, 3.33]);
  });

  it("an expense category gives its expenses; the Total equals the Expenses page with that filter", async () => {
    const { store, admin, spend } = await build();
    await spend(admin.id, "2026-10-01", "Others", 25n, { narration: "Water" });
    await spend(admin.id, "2026-10-02", "Allowances", 70n);
    await spend(admin.id, "2026-10-03", "Others", 5n, { description: "Chairs" });
    const deleted = await spend(admin.id, "2026-10-03", "Others", 999n);
    await store.expenses.softDelete(deleted.id, admin.id);
    const rows = await table(must(await exportCategory(store, actorOf(admin), { category: "Others" })), "Others");
    const empty = rows[1]?.[2];
    expect([null, ""]).toContain(empty);
    expect(rows).toEqual([
      EXPENSE_HEADER,
      ["2026-10-01", "Others", empty, "Water", 0.25, "Cash", "Admin Test"],
      ["2026-10-03", "Others", "Chairs", empty, 0.05, "Cash", "Admin Test"],
      ["Total", null, null, null, 0.3, null, null],
    ]);
    const page = await listExpenses(store, { id: admin.id, subject: subjectOf(admin) }, { category: "Others" });
    if (!page.ok) throw new Error("list failed");
    expect(rows.at(-1)?.[4]).toBe(Number(page.value.total));
  });

  it("Membership Withdrawal and Loan give their outflow rows (not payment lines), though the expenses file leaves them out", async () => {
    const { store, admin, addMember, pay, spend } = await build();
    const m = await addMember(admin.id, "Ada Test");
    await pay(m.id, "2026-10-01", [["Loan Repaid", 4n]], admin.id);
    await spend(admin.id, "2026-10-01", "Membership Withdrawal", 8n);
    await spend(admin.id, "2026-10-01", "Loan", 30n);
    const withdrawal = await table(
      must(await exportCategory(store, actorOf(admin), { category: "Membership Withdrawal" })),
      "Membership Withdrawal",
    );
    expect(withdrawal[0]).toEqual(EXPENSE_HEADER);
    expect(withdrawal.slice(1).map((r) => [r[1] ?? r[0], r[4]])).toEqual([
      ["Membership Withdrawal", 0.08],
      ["Total", 0.08],
    ]);
    const loan = await table(must(await exportCategory(store, actorOf(admin), { category: "Loan" })), "Loan");
    expect(loan.slice(1).map((r) => [r[1] ?? r[0], r[4]])).toEqual([
      ["Loan", 0.3],
      ["Total", 0.3],
    ]);
    const repaid = await table(
      must(await exportCategory(store, actorOf(admin), { category: "Loan Repaid" })),
      "Loan Repaid",
    );
    expect(repaid[0]).toEqual(TRANSACTION_HEADER);
    expect(repaid.at(-1)?.[4]).toBe(0.04);
  });

  it("scopes as the file it comes from; a Staff createdById is ignored", async () => {
    const { store, admin, a, b, addMember, pay, spend } = await build();
    const ma = await addMember(a.id, "Ada Test");
    const mb = await addMember(b.id, "Bola Test");
    await pay(ma.id, "2026-10-01", [["Shares", 1n]], a.id);
    await pay(mb.id, "2026-10-01", [["Shares", 2n]], admin.id);
    await spend(a.id, "2026-10-01", "Allowances", 10n);
    await spend(b.id, "2026-10-01", "Allowances", 20n);
    const total = async (u: UserRecord, input: CategoryExportInput) => {
      const name = input.category as string;
      return (await table(must(await exportCategory(store, actorOf(u), input)), name)).at(-1)?.[4];
    };
    expect(await total(a, { category: "Shares" })).toBe(0.01);
    expect(await total(a, { category: "Shares", createdById: b.id })).toBe(0.01);
    expect(await total(b, { category: "Shares" })).toBe(0.02);
    expect(await total(admin, { category: "Shares" })).toBe(0.03);
    expect(await total(a, { category: "Allowances" })).toBe(0.1);
    expect(await total(admin, { category: "Allowances", createdById: b.id })).toBe(0.2);
    expect(await total(admin, { category: "Allowances" })).toBe(0.3);
  });
});

describe("exports: the audit entry", () => {
  it("writes one entry per export with the kind, the scope and the days, and no name", async () => {
    const { store, admin, a, addMember } = await build();
    await addMember(a.id, "Ada Test");
    must(await exportMembers(store, actorOf(a), { createdById: admin.id }));
    must(await exportTransactions(store, actorOf(admin), { fromDay: "2026-10-01", toDay: "2026-10-31" }));
    must(await exportExpenses(store, actorOf(admin), { createdById: a.id, toDay: "2026-10-31" }));
    must(await exportMembers(store, actorOf(admin), {}));
    must(await exportCashflow(store, actorOf(a), { fromDay: "2026-10-01" }));
    must(await exportCategory(store, actorOf(admin), { category: "Special Savings", toDay: "2026-10-31" }));
    must(await exportCategory(store, actorOf(a), { category: "Membership Withdrawal" }));
    const entry = (actorId: string, detail: string) => ({ actorId, entityType: "Export", entityId: null, detail });
    expect((await exportsAudit(store)).reverse()).toEqual([
      entry(a.id, `kind=members scope=${a.id}`),
      entry(admin.id, "kind=transactions scope=all from_day=2026-10-01 to_day=2026-10-31"),
      entry(admin.id, `kind=expenses scope=${a.id} from_day=none to_day=2026-10-31`),
      entry(admin.id, "kind=members scope=all"),
      entry(a.id, `kind=cashflow scope=${a.id} from_day=2026-10-01 to_day=none`),
      entry(admin.id, "kind=category scope=all from_day=none to_day=2026-10-31 category=Special Savings"),
      entry(a.id, `kind=category scope=${a.id} from_day=none to_day=none category=Membership Withdrawal`),
    ]);
    const details = (await exportsAudit(store)).map((e) => e.detail ?? "").join(" ");
    expect(details).not.toContain("Ada");
  });

  it("writes no entry when the file cannot be built (an amount too large for a cell)", async () => {
    const { store, admin, spend } = await build();
    await spend(admin.id, "2026-10-01", "Allowances", 10n ** 15n);
    await expect(exportExpenses(store, actorOf(admin), {})).rejects.toThrow(WorkbookError);
    expect(await exportsAudit(store)).toEqual([]);
  });

  it("gives no file when the audit write fails", async () => {
    const { store, admin } = await build();
    const failing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({ ...tx, audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) } }),
        ),
    };
    for (const [, run] of ALL) {
      await expect(run(failing, actorOf(admin), {})).rejects.toThrow("audit down");
    }
  });
});

describe("exports on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("gives the same files and audit entries read back from the database", async () => {
    const { admin, a, b, addMember, pay, spend } = await build(store);
    const ma = await addMember(a.id, "Ada Test");
    const mb = await addMember(b.id, "Bola Test");
    await pay(ma.id, "2026-10-01", [["Shares", 2_000_000n], ["Loan Repaid", 1n]], a.id);
    await pay(mb.id, "2026-10-02", [["Savings", 7n]], admin.id);
    await pay(ma.id, "2026-11-01", [["Shares", 10n]], a.id);
    await spend(a.id, "2026-10-01", "Allowances", 50n);
    await spend(b.id, "2026-10-02", "Allowances", 70n);

    const members = await table(must(await exportMembers(store, actorOf(admin), {})), "Members");
    expect(members.slice(1).map((r) => [r[0], r[1], r[6]])).toEqual([
      ["Ada Test", ma.membershipId, "Staff A"],
      ["Bola Test", mb.membershipId, "Staff B"],
    ]);
    const october = { fromDay: "2026-10-01", toDay: "2026-10-31" };
    const tx = await table(must(await exportTransactions(store, actorOf(a), october)), "Transactions");
    expect(tx.slice(1).map((r) => [r[0], r[3] ?? null, r[4]])).toEqual([
      ["2026-10-01", "Shares", 20000],
      ["2026-10-01", "Loan Repaid", 0.01],
      ["Total", null, 20000.01],
    ]);
    const all = await table(must(await exportTransactions(store, actorOf(admin), october)), "Transactions");
    expect(all.at(-1)?.[4]).toBe(20000.08);
    const ex = await table(must(await exportExpenses(store, actorOf(admin), { createdById: b.id })), "Expenses");
    expect(ex.slice(1).map((r) => [r[0], r[4]])).toEqual([
      ["2026-10-02", 0.7],
      ["Total", 0.7],
    ]);
    const flow = await table(must(await exportCashflow(store, actorOf(admin), october)), "Cashflow");
    expect(flow.slice(1).map((r) => [r[0], r[1] ?? null, r[7] ?? null, r[8] ?? null])).toEqual([
      ["2026-10-01", "In", 20000, null],
      ["2026-10-01", "In", 0.01, null],
      ["2026-10-01", "Out", null, 0.5],
      ["2026-10-02", "In", 0.07, null],
      ["2026-10-02", "Out", null, 0.7],
      ["Total", null, 20000.08, 1.2],
    ]);
    const one = await table(must(await exportCategory(store, actorOf(b), { category: "Savings" })), "Savings");
    expect(one.slice(1).map((r) => [r[0], r[4]])).toEqual([
      ["2026-10-02", 0.07],
      ["Total", 0.07],
    ]);
    expect((await exportsAudit(store)).map((e) => e.detail).sort()).toEqual(
      [
        "kind=cashflow scope=all from_day=2026-10-01 to_day=2026-10-31",
        `kind=category scope=${b.id} from_day=none to_day=none category=Savings`,
        "kind=members scope=all",
        `kind=transactions scope=${a.id} from_day=2026-10-01 to_day=2026-10-31`,
        "kind=transactions scope=all from_day=2026-10-01 to_day=2026-10-31",
        `kind=expenses scope=${b.id} from_day=none to_day=none`,
      ].sort(),
    );
  });
});
