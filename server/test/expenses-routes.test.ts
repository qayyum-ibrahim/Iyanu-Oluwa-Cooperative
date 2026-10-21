import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-expenses-routes-012345";
const T0 = new Date("2026-10-21T10:00:00.000Z");

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
  const a = await make("staff-a", "STAFF", ["expenses.create"]);
  const viewOnly = await make("view-only", "STAFF", ["expenses.view"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
  return { store, app, admin, a, viewOnly, bearer };
}

const expenseBody = (over: Record<string, unknown> = {}) => ({
  category: "Allowances",
  amount: "5000.50",
  method: "CASH",
  ...over,
});

describe("POST /expenses", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/expenses").send(expenseBody());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without expenses.create, and saves nothing", async () => {
    const { app, store, viewOnly, bearer } = await build();
    const res = await request(app).post("/expenses").set("Authorization", bearer(viewOnly)).send(expenseBody());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("answers 403, not 400, to a caller without the permission who sends malformed JSON", async () => {
    const { app, viewOnly, bearer } = await build();
    const res = await request(app)
      .post("/expenses")
      .set("Authorization", bearer(viewOnly))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 201 for Staff: no-store, exact fields, exact values", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses")
      .set("Authorization", bearer(a))
      .send(expenseBody({ description: "transport" }));
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object)).toEqual(["expense"]);
    expect(Object.keys(res.body.expense as object).sort()).toEqual([
      "amount",
      "category",
      "createdAt",
      "createdById",
      "description",
      "id",
      "method",
      "narration",
    ]);
    expect(res.body.expense).toMatchObject({
      category: "Allowances",
      amount: "5000.50",
      method: "CASH",
      description: "transport",
      narration: "",
      createdById: a.id,
    });
    expect(new Date(res.body.expense.createdAt as string).toISOString()).toBe(res.body.expense.createdAt);
  });

  it("saves one expense and one audit entry", async () => {
    const { app, store, a, bearer } = await build();
    const res = await request(app).post("/expenses").set("Authorization", bearer(a)).send(expenseBody());
    expect(await store.expenses.list({})).toEqual([
      expect.objectContaining({ id: res.body.expense.id, category: "Allowances", amount: 500_050n, loanId: null }),
    ]);
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["expense.created"]);
  });

  it("answers 201 for the Super Admin", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app)
      .post("/expenses")
      .set("Authorization", bearer(admin))
      .send(expenseBody({ category: "Others", narration: "fuel" }));
    expect(res.status).toBe(201);
    expect(res.body.expense).toMatchObject({ category: "Others", narration: "fuel", createdById: admin.id });
  });

  it.each([
    { label: "Loan", over: { category: "Loan" }, code: "system_only" },
    { label: "Membership Withdrawal", over: { category: "Membership Withdrawal" }, code: "system_only" },
    { label: "an unknown category", over: { category: "Fuel" }, code: "unknown_category" },
    { label: "an unknown method", over: { method: "cheque" }, code: "invalid_method" },
    { label: "a JSON number amount", over: { amount: 5000 }, code: "invalid_amount" },
    { label: "a zero amount", over: { amount: "0" }, code: "amount_not_positive" },
    { label: "a long description", over: { description: "d".repeat(201) }, code: "invalid_description" },
    { label: "a narration that is not text", over: { category: "Others", narration: 1 }, code: "invalid_narration" },
    { label: "Others without a narration", over: { category: "Others" }, code: "missing_narration" },
    { label: "a narration on another category", over: { narration: "fuel" }, code: "narration_not_allowed" },
  ])("answers 400 with the code for $label, and saves nothing", async ({ over, code }) => {
    const { app, store, a, bearer } = await build();
    const res = await request(app).post("/expenses").set("Authorization", bearer(a)).send(expenseBody(over));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code });
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).post("/expenses").set("Authorization", bearer(a)).send([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "unknown_category" });
  });

  it("answers 400 bad_request for malformed JSON from a permitted user", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses")
      .set("Authorization", bearer(a))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 413 too_large for a body over 10 kb", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses")
      .set("Authorization", bearer(a))
      .send(expenseBody({ extra: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("expense routes that do not exist yet", () => {
  it.each([
    { method: "get" as const, path: "/expenses" },
    { method: "get" as const, path: "/expenses/x" },
    { method: "put" as const, path: "/expenses/x" },
    { method: "delete" as const, path: "/expenses/x" },
  ])("answers 404 to $method $path (list at 5.8, edit and delete at 5.9)", async ({ method, path }) => {
    const { app, admin, bearer } = await build();
    const res = await request(app)[method](path).set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
  });
});
