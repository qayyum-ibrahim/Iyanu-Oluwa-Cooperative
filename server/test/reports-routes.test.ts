import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { PAYMENT_CATEGORY_TABLE } from "../src/categories.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-reports-routes-01234";
const T0 = new Date("2026-10-21T10:00:00.000Z");

/** Staff a and b each record one member; b's member is paid out (the store stamps today as createdAt). */
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
  const a = await make("staff-a", "STAFF", ["reports.view"]);
  const b = await make("staff-b", "STAFF", ["reports.view"]);
  const noReports = await make("no-reports", "STAFF", ["dashboard", "payments.view"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;

  const addMember = (createdById: string) =>
    store.members.create({ fullName: "Test Member", phone: "", address: "", occupation: "", createdById });
  const pay = (memberId: string, paidOn: string, lines: [string, bigint][], createdById: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      paidOn,
      total: lines.reduce((t, [, amount]) => t + amount, 0n),
      lines: lines.map(([category, amount]) => ({ category, amount })),
      createdById,
    });

  const ma = await addMember(a.id);
  const mb = await addMember(b.id);
  await pay(ma.id, "2026-10-05", [["Shares", 1_000_000n], ["Loan Interest", 500n]], a.id);
  await pay(ma.id, "2026-09-30", [["Savings", 50n]], a.id);
  await pay(mb.id, "2026-10-06", [["Shares", 200_000n]], b.id);
  await store.payOffs.create({
    memberId: mb.id,
    method: "CASH",
    total: 200_000n,
    lines: [{ category: "Shares", amount: 200_000n }],
    createdById: admin.id,
  });
  return { store, app, admin, a, b, noReports, bearer };
}

type Row = { category: string; refundable: boolean; paid: string; paidOut: string };

/** The rows that are not all zero, as [category, paid, paidOut]. */
const nonZero = (body: { categories: Row[] }) =>
  body.categories.filter((r) => r.paid !== "0.00" || r.paidOut !== "0.00").map((r) => [r.category, r.paid, r.paidOut]);

describe("GET /reports/categories (7.4c)", () => {
  it("answers 401 without a token, and with a bad token", async () => {
    const { app } = await build();
    for (const res of [
      await request(app).get("/reports/categories"),
      await request(app).get("/reports/categories").set("Authorization", "Bearer not.a.token"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("answers 403 to Staff without reports.view (dashboard is not enough), before checking the query", async () => {
    const { app, noReports, bearer } = await build();
    const res = await request(app).get("/reports/categories?fromDay=bad").set("Authorization", bearer(noReports));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 200 for Staff: no-store, exact fields, every category in DR-04 order, own scope only", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).get("/reports/categories").set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object).sort()).toEqual(["categories", "fromDay", "toDay", "totalPaid", "totalPaidOut"]);
    expect(res.body).toMatchObject({ fromDay: null, toDay: null, totalPaid: "10005.50", totalPaidOut: "0.00" });
    expect((res.body.categories as Row[]).map((r) => [r.category, r.refundable])).toEqual(
      PAYMENT_CATEGORY_TABLE.map((c) => [c.name, c.refundable]),
    );
    expect(Object.keys(res.body.categories[0] as object).sort()).toEqual(["category", "paid", "paidOut", "refundable"]);
    expect(nonZero(res.body)).toEqual([
      ["Shares", "10000.00", "0.00"],
      ["Savings", "0.50", "0.00"],
      ["Loan Interest", "5.00", "0.00"],
    ]);
  });

  it("takes the day range from the query, both days included", async () => {
    const { app, a, bearer } = await build();
    const oct = await request(app)
      .get("/reports/categories?fromDay=2026-10-01&toDay=2026-10-05")
      .set("Authorization", bearer(a));
    expect(oct.status).toBe(200);
    expect(oct.body).toMatchObject({ fromDay: "2026-10-01", toDay: "2026-10-05", totalPaid: "10005.00" });
    const sep = await request(app).get("/reports/categories?toDay=2026-09-30").set("Authorization", bearer(a));
    expect(sep.status).toBe(200);
    expect(sep.body).toMatchObject({ fromDay: null, toDay: "2026-09-30", totalPaid: "0.50" });
  });

  it("ignores a createdById from Staff", async () => {
    const { app, a, b, bearer } = await build();
    const plain = await request(app).get("/reports/categories").set("Authorization", bearer(a));
    const res = await request(app).get(`/reports/categories?createdById=${b.id}`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(plain.body);
  });

  it("answers 200 for the Super Admin: everyone's figures with pay-offs beside them, or one user's", async () => {
    const { app, admin, b, bearer } = await build();
    const all = await request(app).get("/reports/categories").set("Authorization", bearer(admin));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ totalPaid: "12005.50", totalPaidOut: "2000.00" });
    expect(nonZero(all.body)).toEqual([
      ["Shares", "12000.00", "2000.00"],
      ["Savings", "0.50", "0.00"],
      ["Loan Interest", "5.00", "0.00"],
    ]);
    const one = await request(app).get(`/reports/categories?createdById=${b.id}`).set("Authorization", bearer(admin));
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ totalPaid: "2000.00", totalPaidOut: "2000.00" });
    expect(nonZero(one.body)).toEqual([["Shares", "2000.00", "2000.00"]]);
  });

  it("leaves out a pay-off whose Lagos day is outside the range", async () => {
    const { app, admin, bearer } = await build();
    // The pay-off is stamped with the real clock, so it falls after 2026-10-10.
    const res = await request(app)
      .get("/reports/categories?fromDay=2026-10-01&toDay=2026-10-10")
      .set("Authorization", bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalPaid: "12005.00", totalPaidOut: "0.00" });
  });

  it.each([
    ["fromDay=2026-13-01", "invalid_from_day"],
    ["fromDay=", "invalid_from_day"],
    ["fromDay=2026-10-01&fromDay=2026-10-02", "invalid_from_day"],
    ["toDay=2026-02-30", "invalid_to_day"],
    ["toDay=2026-10", "invalid_to_day"],
    ["fromDay=2026-10-02&toDay=2026-10-01", "invalid_range"],
    ["createdById=", "invalid_created_by_id"],
    [`createdById=${"x".repeat(101)}`, "invalid_created_by_id"],
    ["createdById=a&createdById=b", "invalid_created_by_id"],
  ])("answers 400 for ?%s", async (query, code) => {
    const { app, a, admin, bearer } = await build();
    for (const u of [a, admin]) {
      const res = await request(app).get(`/reports/categories?${query}`).set("Authorization", bearer(u));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_input", code });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("answers 404 for other report paths", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app).get("/reports").set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
  });

  it("writes nothing, not even an audit entry", async () => {
    const { app, store, admin, a, bearer } = await build();
    await request(app).get("/reports/categories").set("Authorization", bearer(admin));
    await request(app).get("/reports/categories").set("Authorization", bearer(a));
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });
});
