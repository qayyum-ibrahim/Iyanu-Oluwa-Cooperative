import ExcelJS from "exceljs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-exports-routes-0123";
// 10:00 UTC is 11:00 in Lagos, so today's Lagos day is 2026-10-21.
const T0 = new Date("2026-10-21T10:00:00.000Z");
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const KINDS = ["members", "transactions", "expenses", "cashflow", "category"] as const;

/** Staff a and b each record one member, payments and one expense. */
async function build() {
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
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;

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
  return { store, app, admin, a, b, noExport, bearer, ma, pay };
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

  it("answers 404 as JSON for an unknown kind, and for /exports alone", async () => {
    const { app, store, admin, bearer } = await build();
    for (const kind of ["nope", "Members", "toString", "__proto__"]) {
      const res = await request(app).get(`/exports/${kind}`).set("Authorization", bearer(admin));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect((await request(app).get("/exports").set("Authorization", bearer(admin))).status).toBe(404);
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

  it("ignores the days on members and the category on the four other kinds (A-253)", async () => {
    const { app, admin, bearer } = await build();
    const members = await download(app, "/exports/members?fromDay=bad&toDay=bad", bearer(admin));
    expect(members.status).toBe(200);
    for (const kind of ["members", "transactions", "expenses", "cashflow"]) {
      const res = await download(app, `/exports/${kind}?category=nope`, bearer(admin));
      expect(res.status).toBe(200);
    }
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
