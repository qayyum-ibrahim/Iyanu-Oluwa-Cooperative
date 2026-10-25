import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import { lagosDay } from "../src/payments.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-dashboard-routes-0123";
const T0 = new Date("2026-10-21T10:00:00.000Z");

/** Staff a and b each record one member; the Super Admin records an expense of their own. */
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
  const a = await make("staff-a", "STAFF", ["dashboard"]);
  const b = await make("staff-b", "STAFF", ["dashboard"]);
  const noDash = await make("no-dashboard", "STAFF", ["expenses.view", "reports.view"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;

  const addMember = (createdById: string) =>
    store.members.create({ fullName: "Test Member", phone: "", address: "", occupation: "", createdById });
  const pay = (memberId: string, paidOn: string, amount: bigint, createdById: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      paidOn,
      total: amount,
      lines: [{ category: "Shares", amount }],
      createdById,
    });
  const spend = (category: string, amount: bigint, spentOn: string, createdById: string) =>
    store.expenses.create({ category, amount, method: "CASH", spentOn, createdById });

  const ma = await addMember(a.id);
  const mb = await addMember(b.id);
  await pay(ma.id, "2026-10-05", 1_000_000n, a.id);
  await pay(ma.id, "2026-09-30", 50n, a.id);
  await pay(mb.id, "2026-10-06", 200_000n, b.id);
  await spend("Allowances", 30_000n, "2026-10-07", a.id);
  await spend("Membership Withdrawal", 7_000n, "2026-10-08", b.id);
  await spend("Asset Purchase", 900_000n, "2026-10-09", admin.id);
  return { store, app, admin, a, b, noDash, bearer };
}

const ZERO = { month: "0.00", allTime: "0.00" };

describe("GET /dashboard (7.3b)", () => {
  it("answers 401 without a token, and with a bad token", async () => {
    const { app } = await build();
    for (const res of [
      await request(app).get("/dashboard"),
      await request(app).get("/dashboard").set("Authorization", "Bearer not.a.token"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "unauthorized" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("answers 403 to Staff without dashboard (reports.view is not enough), before checking the query", async () => {
    const { app, noDash, bearer } = await build();
    const res = await request(app).get("/dashboard?month=bad").set("Authorization", bearer(noDash));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("answers 200 for Staff: no-store, exact fields, own scope only", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).get("/dashboard?month=2026-10").set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object).sort()).toEqual([
      "activeMembers",
      "expenditure",
      "fromDay",
      "income",
      "membershipWithdrawal",
      "month",
      "outstandingLoans",
      "recentExpenses",
      "toDay",
      "totalOutflow",
    ]);
    expect(res.body).toMatchObject({
      month: "2026-10",
      fromDay: "2026-10-01",
      toDay: "2026-10-31",
      income: { month: "10000.00", allTime: "10000.50" },
      expenditure: { month: "300.00", allTime: "300.00" },
      membershipWithdrawal: ZERO,
      totalOutflow: { month: "300.00", allTime: "300.00" },
      outstandingLoans: "0.00",
      activeMembers: 1,
    });
    expect(res.body.recentExpenses).toEqual([
      expect.objectContaining({ category: "Allowances", amount: "300.00", spentOn: "2026-10-07", createdById: a.id }),
    ]);
  });

  it("ignores a createdById from Staff", async () => {
    const { app, a, b, bearer } = await build();
    const plain = await request(app).get("/dashboard?month=2026-10").set("Authorization", bearer(a));
    const res = await request(app).get(`/dashboard?month=2026-10&createdById=${b.id}`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(plain.body);
  });

  it("answers 200 for the Super Admin: everyone's figures, or one user's with createdById", async () => {
    const { app, admin, b, bearer } = await build();
    const all = await request(app).get("/dashboard?month=2026-10").set("Authorization", bearer(admin));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({
      income: { month: "12000.00", allTime: "12000.50" },
      expenditure: { month: "9300.00", allTime: "9300.00" },
      membershipWithdrawal: { month: "70.00", allTime: "70.00" },
      totalOutflow: { month: "9370.00", allTime: "9370.00" },
      activeMembers: 2,
    });
    expect((all.body.recentExpenses as { category: string }[]).map((e) => e.category)).toEqual([
      "Asset Purchase",
      "Allowances",
    ]);
    const one = await request(app).get(`/dashboard?month=2026-10&createdById=${b.id}`).set("Authorization", bearer(admin));
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({
      income: { month: "2000.00", allTime: "2000.00" },
      expenditure: ZERO,
      membershipWithdrawal: { month: "70.00", allTime: "70.00" },
      totalOutflow: { month: "70.00", allTime: "70.00" },
      activeMembers: 1,
      recentExpenses: [],
    });
  });

  it("takes the month from the query: September holds only the 0.50 payment", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).get("/dashboard?month=2026-09").set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fromDay: "2026-09-01",
      toDay: "2026-09-30",
      income: { month: "0.50", allTime: "10000.50" },
      expenditure: { month: "0.00", allTime: "300.00" },
      totalOutflow: { month: "0.00", allTime: "300.00" },
      recentExpenses: [],
    });
  });

  it("uses the month of today in Lagos when the query has none", async () => {
    const { app, a, bearer } = await build();
    const before = lagosDay(new Date()).slice(0, 7);
    const res = await request(app).get("/dashboard").set("Authorization", bearer(a));
    const after = lagosDay(new Date()).slice(0, 7);
    expect(res.status).toBe(200);
    expect([before, after]).toContain(res.body.month);
  });

  it.each([
    ["month=2026-13", "invalid_month"],
    ["month=", "invalid_month"],
    ["month=2026-10-01", "invalid_month"],
    ["month=2026-10&month=2026-11", "invalid_month"],
    ["month=2026-10&createdById=", "invalid_created_by_id"],
    [`month=2026-10&createdById=${"x".repeat(101)}`, "invalid_created_by_id"],
    ["month=2026-10&createdById=a&createdById=b", "invalid_created_by_id"],
  ])("answers 400 for ?%s", async (query, code) => {
    const { app, a, admin, bearer } = await build();
    for (const u of [a, admin]) {
      const res = await request(app).get(`/dashboard?${query}`).set("Authorization", bearer(u));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_input", code });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("writes nothing, not even an audit entry", async () => {
    const { app, store, admin, a, bearer } = await build();
    await request(app).get("/dashboard?month=2026-10").set("Authorization", bearer(admin));
    await request(app).get("/dashboard?month=2026-10").set("Authorization", bearer(a));
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });
});
