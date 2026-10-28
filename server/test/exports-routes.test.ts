import ExcelJS from "exceljs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";
import { pdfPageCount, pdfTexts } from "./helpers/pdf-text.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-exports-routes-0123";
// 10:00 UTC is 11:00 in Lagos, so today's Lagos day is 2026-10-21.
const T0 = new Date("2026-10-21T10:00:00.000Z");
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const KINDS = ["members", "transactions", "expenses", "cashflow", "category", "member"] as const;

/** Staff a and b each record one member, payments and one expense. The clock is T0 unless given. */
async function build(now: Date = T0) {
  const store = createMemoryStore();
  const make = (name: string, role: Role, permissions: string[]) =>
    store.users.create({
      email: `${name}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role,
      permissions,
    });
  const admin = await make("admin", "SUPER_ADMIN", []);
  const a = await make("staff-a", "STAFF", ["reports.export"]);
  const b = await make("staff-b", "STAFF", ["reports.export"]);
  const noExport = await make("no-export", "STAFF", ["dashboard", "reports.view", "members.view"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => now });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, now)}`;

  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "08000000000", address: "", occupation: "Trader", createdById });
  const pay = (memberId: string, paidOn: string, lines: [string, bigint][], createdById: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      paidOn,
      total: lines.reduce((t, [, amount]) => t + amount, 0n),
      lines: lines.map(([category, amount]) => ({ category, amount })),
      createdById,
    });
  const spend = (createdById: string, spentOn: string, category: string, amount: bigint) =>
    store.expenses.create({
      category,
      amount,
      method: "CASH",
      spentOn,
      description: "Test expense",
      narration: "",
      createdById,
    });

  const ma = await addMember(a.id, "Member A");
  const mb = await addMember(b.id, "Member B");
  await pay(ma.id, "2026-10-05", [["Shares", 1_000_000n], ["Savings", 50n]], a.id);
  await pay(ma.id, "2026-09-30", [["Shares", 500n]], a.id);
  await pay(mb.id, "2026-10-06", [["Shares", 200_000n]], b.id);
  await spend(a.id, "2026-10-07", "Allowances", 30_000n);
  await spend(b.id, "2026-10-08", "Allowances", 70_000n);
  return { store, app, admin, a, b, noExport, bearer, ma, mb, pay };
}

/** Reads a reply body as raw bytes, whatever its content type. */
function binary(reply: unknown, done: (err: Error | null, body: Buffer) => void): void {
  const res = reply as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => done(null, Buffer.concat(chunks)));
}

/** GET as a file: the body is a Buffer. */
const download = (app: ReturnType<typeof createApp>, path: string, auth: string) =>
  request(app).get(path).set("Authorization", auth).buffer(true).parse(binary);

/** The sheet names and every row of the first sheet, header first, as exceljs reads them back. */
async function open(file: Buffer): Promise<{ names: string[]; rows: unknown[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("no sheet");
  const rows: unknown[][] = [];
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const cells: unknown[] = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) cells.push(row.getCell(c).value);
    rows.push(cells);
  }
  return { names: workbook.worksheets.map((w) => w.name), rows };
}

/** Every sheet's name and rows, header first, in the workbook's order. */
async function openAll(file: Buffer): Promise<[string, unknown[][]][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  return workbook.worksheets.map((sheet) => {
    const rows: unknown[][] = [];
    for (let r = 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const cells: unknown[] = [];
      for (let c = 1; c <= sheet.columnCount; c += 1) cells.push(row.getCell(c).value);
      rows.push(cells);
    }
    return [sheet.name, rows];
  });
}

/** The last row (Total) of the first sheet. */
const totalRow = async (file: Buffer) => (await open(file)).rows.at(-1);

describe("GET /exports/:kind (8.4)", () => {
  it("answers 401 without a token, and with a bad token, for every kind and an unknown one", async () => {
    const { app } = await build();
    for (const kind of [...KINDS, "nope"]) {
      for (const res of [
        await request(app).get(`/exports/${kind}`),
        await request(app).get(`/exports/${kind}`).set("Authorization", "Bearer not.a.token"),
      ]) {
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "unauthorized" });
        expect(res.headers["cache-control"]).toBe("no-store");
      }
    }
  });

  it("answers 403 to Staff without reports.export (reports.view is not enough), before the kind and the query", async () => {
    const { app, noExport, bearer } = await build();
    for (const path of [...KINDS.map((k) => `/exports/${k}?fromDay=bad`), "/exports/nope"]) {
      const res = await request(app).get(path).set("Authorization", bearer(noExport));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "forbidden" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("answers 404 as JSON for an unknown kind", async () => {
    const { app, store, admin, bearer } = await build();
    for (const kind of ["nope", "Members", "toString", "__proto__"]) {
      const res = await request(app).get(`/exports/${kind}`).set("Authorization", bearer(admin));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
  });

  it.each([
    ["members", "", "Members"],
    ["transactions", "", "Transactions"],
    ["expenses", "", "Expenses"],
    ["cashflow", "", "Cashflow"],
    ["category", "?category=Shares", "Shares"],
  ])("answers 200 with an .xlsx file for %s: type, attachment name, no-store", async (kind, query, sheet) => {
    const { app, admin, bearer } = await build();
    const res = await download(app, `/exports/${kind}${query}`, bearer(admin));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(XLSX_TYPE);
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="${kind}-2026-10-21.xlsx"`);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 2).toString("latin1")).toBe("PK");
    expect((await open(body)).names).toEqual([sheet]);
  });

  it("gives Staff their own rows only, and ignores a createdById from Staff", async () => {
    const { app, a, b, bearer } = await build();
    const own = await download(app, "/exports/transactions", bearer(a));
    const other = await download(app, `/exports/transactions?createdById=${b.id}`, bearer(a));
    expect(own.status).toBe(200);
    expect(other.status).toBe(200);
    expect(await totalRow(own.body as Buffer)).toEqual(["Total", null, null, null, 10005.5, null, null]);
    expect(await totalRow(other.body as Buffer)).toEqual(["Total", null, null, null, 10005.5, null, null]);
    const members = await open((await download(app, "/exports/members", bearer(a))).body as Buffer);
    expect(members.rows.map((r) => r[0])).toEqual(["Name", "Member A"]);
    const spent = await download(app, "/exports/expenses", bearer(b));
    expect(await totalRow(spent.body as Buffer)).toEqual(["Total", null, null, null, 700, null, null]);
  });

  it("gives the Super Admin everyone's rows, or one user's with createdById", async () => {
    const { app, admin, b, bearer } = await build();
    const all = await download(app, "/exports/transactions", bearer(admin));
    expect(await totalRow(all.body as Buffer)).toEqual(["Total", null, null, null, 12005.5, null, null]);
    const one = await download(app, `/exports/transactions?createdById=${b.id}`, bearer(admin));
    expect(await totalRow(one.body as Buffer)).toEqual(["Total", null, null, null, 2000, null, null]);
    const flow = await download(app, "/exports/cashflow", bearer(admin));
    const last = await totalRow(flow.body as Buffer);
    expect([last?.[0], last?.[7], last?.[8]]).toEqual(["Total", 12005.5, 1000]);
  });

  it("takes the day range from the query, both days included", async () => {
    const { app, admin, bearer } = await build();
    const oct = await download(app, "/exports/transactions?fromDay=2026-10-01&toDay=2026-10-05", bearer(admin));
    expect(await totalRow(oct.body as Buffer)).toEqual(["Total", null, null, null, 10000.5, null, null]);
    const sep = await download(app, "/exports/category?category=Shares&toDay=2026-09-30", bearer(admin));
    expect(await totalRow(sep.body as Buffer)).toEqual(["Total", null, null, null, 5, null, null]);
    const spent = await download(app, "/exports/expenses?fromDay=2026-10-08&toDay=2026-10-08", bearer(admin));
    expect(await totalRow(spent.body as Buffer)).toEqual(["Total", null, null, null, 700, null, null]);
  });

  it("gives an expense category its expenses", async () => {
    const { app, admin, bearer } = await build();
    const res = await download(app, "/exports/category?category=Allowances", bearer(admin));
    expect(res.status).toBe(200);
    const file = await open(res.body as Buffer);
    expect(file.names).toEqual(["Allowances"]);
    expect(file.rows.at(-1)).toEqual(["Total", null, null, null, 1000, null, null]);
  });

  it("leaves Loan and Membership Withdrawal out of the expenses file, not out of cashflow Outflow or their category (D-107)", async () => {
    const { app, store, admin, bearer } = await build();
    for (const [category, amount] of [
      ["Loan", 300_000n],
      ["Membership Withdrawal", 25_000n],
    ] as const) {
      await store.expenses.create({
        category,
        amount,
        method: "CASH",
        spentOn: "2026-10-09",
        description: "",
        narration: "",
        createdById: admin.id,
      });
    }
    const spent = await open((await download(app, "/exports/expenses", bearer(admin))).body as Buffer);
    expect(spent.rows.slice(1).map((r) => r[1] ?? r[0])).toEqual(["Allowances", "Allowances", "Total"]);
    expect(spent.rows.at(-1)?.[4]).toBe(1000);
    const flow = await open((await download(app, "/exports/cashflow", bearer(admin))).body as Buffer);
    expect(flow.rows[0]?.[8]).toBe("Outflow (₦)");
    expect([flow.rows.at(-1)?.[7], flow.rows.at(-1)?.[8]]).toEqual([12005.5, 4250]);
    const loan = await open((await download(app, "/exports/category?category=Loan", bearer(admin))).body as Buffer);
    expect(loan.rows.at(-1)?.[4]).toBe(3000);
    const withdrawal = await download(app, "/exports/category?category=Membership%20Withdrawal", bearer(admin));
    expect((await totalRow(withdrawal.body as Buffer))?.[4]).toBe(250);
  });

  it("ignores the days on members and the category on the four other kinds (A-253)", async () => {
    const { app, admin, bearer } = await build();
    const members = await download(app, "/exports/members?fromDay=bad&toDay=bad", bearer(admin));
    expect(members.status).toBe(200);
    for (const kind of ["members", "transactions", "expenses", "cashflow"]) {
      const res = await download(app, `/exports/${kind}?category=nope`, bearer(admin));
      expect(res.status).toBe(200);
    }
  });

  it("does not filter by, or write in the audit detail, a real category sent to the four other kinds (A-256)", async () => {
    const { app, store, admin, bearer } = await build();
    const rows = await download(app, "/exports/transactions?category=Shares", bearer(admin));
    expect(await totalRow(rows.body as Buffer)).toEqual(["Total", null, null, null, 12005.5, null, null]);
    const spent = await download(app, "/exports/expenses?category=Shares", bearer(admin));
    expect(await totalRow(spent.body as Buffer)).toEqual(["Total", null, null, null, 1000, null, null]);
    const flow = await download(app, "/exports/cashflow?category=Shares", bearer(admin));
    const last = await totalRow(flow.body as Buffer);
    expect([last?.[0], last?.[7], last?.[8]]).toEqual(["Total", 12005.5, 1000]);
    await download(app, "/exports/members?category=Shares", bearer(admin));
    expect((await store.audit.listByActor(admin.id)).map((e) => e.detail)).toEqual([
      "kind=transactions scope=all from_day=none to_day=none",
      "kind=expenses scope=all from_day=none to_day=none",
      "kind=cashflow scope=all from_day=none to_day=none",
      "kind=members scope=all",
    ]);
  });

  it.each([
    ["2026-10-21T22:59:59.999Z", "2026-10-21"],
    ["2026-10-21T23:00:00.000Z", "2026-10-22"],
    ["2026-10-21T23:59:59.999Z", "2026-10-22"],
  ])("names the file after the Lagos day, not the UTC day, at %s (A-256)", async (at, day) => {
    const { app, admin, bearer } = await build(new Date(at));
    const res = await download(app, "/exports/members", bearer(admin));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="members-${day}.xlsx"`);
  });

  it.each([
    ["fromDay=2026-13-01", "invalid_from_day"],
    ["fromDay=", "invalid_from_day"],
    ["fromDay=2026-10-01&fromDay=2026-10-02", "invalid_from_day"],
    ["toDay=2026-02-30", "invalid_to_day"],
    ["fromDay=2026-10-02&toDay=2026-10-01", "invalid_range"],
    ["createdById=", "invalid_created_by_id"],
    [`createdById=${"x".repeat(101)}`, "invalid_created_by_id"],
    ["createdById=a&createdById=b", "invalid_created_by_id"],
  ])("answers 400 as JSON for ?%s on every day kind", async (query, code) => {
    const { app, a, admin, bearer } = await build();
    for (const u of [a, admin]) {
      for (const path of ["transactions?", "expenses?", "cashflow?", "category?category=Shares&"]) {
        const res = await request(app).get(`/exports/${path}${query}`).set("Authorization", bearer(u));
        expect(res.status).toBe(400);
        expect(res.headers["content-type"]).toMatch(/^application\/json/);
        expect(res.body).toEqual({ error: "invalid_input", code });
        expect(res.headers["cache-control"]).toBe("no-store");
      }
    }
  });

  it.each([
    ["category", ""],
    ["category", "?category="],
    ["category", "?category=shares"],
    ["category", "?category=Shares&category=Savings"],
  ])("answers 400 invalid_category for /exports/%s%s", async (kind, query) => {
    const { app, admin, bearer } = await build();
    const res = await request(app).get(`/exports/${kind}${query}`).set("Authorization", bearer(admin));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_category" });
  });

  it("answers 400 invalid_created_by_id on members", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app).get("/exports/members?createdById=").set("Authorization", bearer(admin));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_created_by_id" });
  });

  it("writes one audit entry per file, and none for a refusal", async () => {
    const { app, store, admin, a, noExport, bearer } = await build();
    await download(app, "/exports/category?category=Special%20Savings&fromDay=2026-10-01", bearer(a));
    await download(app, "/exports/members", bearer(admin));
    await request(app).get("/exports/transactions?fromDay=bad").set("Authorization", bearer(a));
    await request(app).get("/exports/members").set("Authorization", bearer(noExport));
    const details = async (id: string) => (await store.audit.listByActor(id)).map((e) => [e.action, e.detail]);
    expect(await details(a.id)).toEqual([
      ["export.created", `kind=category scope=${a.id} from_day=2026-10-01 to_day=none category=Special Savings`],
    ]);
    expect(await details(admin.id)).toEqual([["export.created", "kind=members scope=all"]]);
    expect(await details(noExport.id)).toEqual([]);
  });

  it("answers 200 with a member file, named member-<day>.xlsx, and one audit entry (9.1i)", async () => {
    const { app, store, a, ma, bearer } = await build();
    const res = await download(app, `/exports/member?memberId=${ma.id}&fromDay=bad&category=nope`, bearer(a));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(XLSX_TYPE);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="member-2026-10-21.xlsx"');
    expect(res.headers["cache-control"]).toBe("no-store");
    const { names, rows } = await open(res.body as Buffer);
    expect(names).toEqual(["Member"]);
    expect(rows[1]?.slice(0, 3)).toEqual(["Details", "Name", "Member A"]);
    // Shares 10,000.00 + 5.00 and Savings 0.50 from the two payments.
    expect(rows.at(-1)?.slice(5, 7)).toEqual([10005.5, 10005.5]);
    expect((await store.audit.listByActor(a.id)).map((e) => e.detail)).toEqual([
      `kind=member scope=${a.id} membership_id=${ma.membershipId}`,
    ]);
  });

  it("answers 400 for a missing or empty memberId, and 404 for an unknown member or one Staff did not record (9.1i)", async () => {
    const { app, store, admin, a, mb, bearer } = await build();
    const get = (path: string, u: { id: string }) => request(app).get(path).set("Authorization", bearer(u));
    for (const [path, code] of [
      ["/exports/member", "missing_member_id"],
      ["/exports/member?memberId=", "invalid_member_id"],
      ["/exports/member?memberId=a&memberId=b", "invalid_member_id"],
    ] as const) {
      const res = await get(path, admin);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_input", code });
    }
    for (const [path, u] of [
      ["/exports/member?memberId=nope", admin],
      [`/exports/member?memberId=${mb.id}`, a],
    ] as const) {
      const res = await get(path, u);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
      expect(res.headers["content-disposition"]).toBeUndefined();
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("answers 500 as JSON, and writes no audit entry, when the file cannot be built", async () => {
    const { app, store, admin, a, ma, pay, bearer } = await build();
    await pay(ma.id, "2026-10-09", [["Shares", 10n ** 15n]], a.id);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await request(app).get("/exports/transactions").set("Authorization", bearer(admin));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "server_error" });
      expect(res.headers["content-disposition"]).toBeUndefined();
      // WorkbookError does not set its own name, so the log reads "Error" (no message, no data).
      expect(log).toHaveBeenCalledWith("request failed:", "Error");
    } finally {
      log.mockRestore();
    }
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
  });
});

describe("GET /exports?kinds= (9.1j)", () => {
  it("answers 401 without a token or with a bad token, and 403 to Staff without reports.export, before the query", async () => {
    const { app, store, noExport, bearer } = await build();
    for (const res of [
      await request(app).get("/exports?kinds=members"),
      await request(app).get("/exports").set("Authorization", "Bearer not.a.token"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
    }
    for (const path of ["/exports", "/exports?kinds=nope", "/exports?kinds=members&format=pdf"]) {
      const res = await request(app).get(path).set("Authorization", bearer(noExport));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "forbidden" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect(await store.audit.listByActor(noExport.id)).toEqual([]);
  });

  it("answers 200 with one .xlsx file named export-<day>.xlsx, one sheet per kind in the fixed order", async () => {
    const { app, admin, ma, bearer } = await build();
    const res = await download(
      app,
      `/exports?kinds=member,category,cashflow,expenses,transactions,members&category=Shares&memberId=${ma.id}&format=xlsx`,
      bearer(admin),
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(XLSX_TYPE);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="export-2026-10-21.xlsx"');
    expect(res.headers["cache-control"]).toBe("no-store");
    const sheets = await openAll(res.body as Buffer);
    expect(sheets.map(([name]) => name)).toEqual(["Members", "Transactions", "Expenses", "Cashflow", "Shares", "Member"]);
    const total = (name: string) => sheets.find(([n]) => n === name)?.[1].at(-1);
    expect(total("Transactions")).toEqual(["Total", null, null, null, 12005.5, null, null]);
    expect(total("Shares")).toEqual(["Total", null, null, null, 12005, null, null]);
    expect(total("Expenses")).toEqual(["Total", null, null, null, 1000, null, null]);
  });

  it("gives Staff their own rows on every sheet, and the days from the query", async () => {
    const { app, a, b, bearer } = await build();
    const res = await download(app, `/exports?kinds=transactions,members&createdById=${b.id}&fromDay=2026-10-01`, bearer(a));
    const sheets = await openAll(res.body as Buffer);
    expect(sheets[0]?.[1].map((r) => r[0])).toEqual(["Name", "Member A"]);
    expect(sheets[1]?.[1].at(-1)).toEqual(["Total", null, null, null, 10000.5, null, null]);
  });

  it.each([
    ["", "missing_kinds"],
    ["?kinds=", "invalid_kinds"],
    ["?kinds=nope", "invalid_kinds"],
    ["?kinds=members,members", "invalid_kinds"],
    ["?kinds=members&kinds=cashflow", "invalid_kinds"],
    ["?kinds=members&format=PDF", "invalid_format"],
    ["?kinds=members&format=pdf&format=pdf", "invalid_format"],
    ["?kinds=members&format=csv", "invalid_format"],
    ["?kinds=members&format=xlsx&format=xlsx", "invalid_format"],
    ["?kinds=cashflow&fromDay=bad", "invalid_from_day"],
    ["?kinds=category", "invalid_category"],
    ["?kinds=members,member", "missing_member_id"],
    ["?kinds=members&createdById=", "invalid_created_by_id"],
  ])("answers 400 as JSON for /exports%s, with no audit entry", async (query, code) => {
    const { app, store, admin, bearer } = await build();
    const res = await request(app).get(`/exports${query}`).set("Authorization", bearer(admin));
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.body).toEqual({ error: "invalid_input", code });
    expect(res.headers["content-disposition"]).toBeUndefined();
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
  });

  it("answers 404 for an unknown member or one Staff did not record, with no audit entry", async () => {
    const { app, store, admin, a, mb, bearer } = await build();
    for (const [path, u] of [
      ["/exports?kinds=members,member&memberId=nope", admin],
      [`/exports?kinds=member&memberId=${mb.id}`, a],
    ] as const) {
      const res = await request(app).get(path).set("Authorization", bearer(u));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
    }
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("writes one audit entry naming every kind", async () => {
    const { app, store, a, ma, bearer } = await build();
    await download(app, `/exports?kinds=cashflow,member,members&memberId=${ma.id}&toDay=2026-10-31`, bearer(a));
    expect((await store.audit.listByActor(a.id)).map((e) => [e.action, e.detail])).toEqual([
      ["export.created", `kind=members,cashflow,member scope=${a.id} from_day=none to_day=2026-10-31 membership_id=${ma.membershipId}`],
    ]);
  });

  it("answers 200 with a PDF for format=pdf, named export-<day>.pdf, and one audit entry (9.1l2)", async () => {
    const { app, store, admin, bearer } = await build();
    const res = await download(app, "/exports?kinds=transactions,members&format=pdf", bearer(admin));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="export-2026-10-21.pdf"');
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdfPageCount(body)).toBe(2);
    const texts = pdfTexts(body);
    expect(texts).toContain("Printed on 2026-10-21");
    expect(texts).toContain("Member A");
    expect(texts.slice(-2)).toEqual(["Total", "12,005.50"]);
    expect((await store.audit.listByActor(admin.id)).map((e) => e.detail)).toEqual([
      "kind=members,transactions scope=all from_day=none to_day=none format=pdf",
    ]);
  });

  it.each([
    ["2026-10-21T22:59:59.999Z", "2026-10-21"],
    ["2026-10-21T23:00:00.000Z", "2026-10-22"],
  ])("names the PDF and its Printed on after the Lagos day at %s", async (at, day) => {
    const { app, admin, bearer } = await build(new Date(at));
    const res = await download(app, "/exports?kinds=members&format=pdf", bearer(admin));
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="export-${day}.pdf"`);
    expect(pdfTexts(res.body as Buffer)).toContain(`Printed on ${day}`);
  });

  it("answers 500 as JSON, and writes no audit entry, when one sheet cannot be built", async () => {
    const { app, store, admin, a, ma, pay, bearer } = await build();
    await pay(ma.id, "2026-10-09", [["Shares", 10n ** 15n]], a.id);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await request(app).get("/exports?kinds=members,transactions").set("Authorization", bearer(admin));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "server_error" });
      expect(res.headers["content-disposition"]).toBeUndefined();
    } finally {
      log.mockRestore();
    }
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
  });
});
