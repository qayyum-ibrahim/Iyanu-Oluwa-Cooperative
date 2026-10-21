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

let keyCount = 0;
/** A new idempotency key on every call. */
const newKey = () => `expense-route-key-${String(++keyCount).padStart(6, "0")}`;

const expenseBody = (over: Record<string, unknown> = {}) => ({
  category: "Allowances",
  amount: "5000.50",
  method: "CASH",
  ...over,
});

describe("POST /expenses", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/expenses").set("Idempotency-Key", newKey()).send(expenseBody());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without expenses.create, and saves nothing", async () => {
    const { app, store, viewOnly, bearer } = await build();
    const res = await request(app).post("/expenses").set("Idempotency-Key", newKey()).set("Authorization", bearer(viewOnly)).send(expenseBody());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("answers 403, not 400, to a caller without the permission who sends malformed JSON", async () => {
    const { app, viewOnly, bearer } = await build();
    const res = await request(app)
      .post("/expenses").set("Idempotency-Key", newKey())
      .set("Authorization", bearer(viewOnly))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 201 for Staff: no-store, exact fields, exact values", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses").set("Idempotency-Key", newKey())
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
    const res = await request(app).post("/expenses").set("Idempotency-Key", newKey()).set("Authorization", bearer(a)).send(expenseBody());
    expect(await store.expenses.list({})).toEqual([
      expect.objectContaining({ id: res.body.expense.id, category: "Allowances", amount: 500_050n, loanId: null }),
    ]);
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["expense.created"]);
  });

  it("answers 201 for the Super Admin", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app)
      .post("/expenses").set("Idempotency-Key", newKey())
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
    const res = await request(app).post("/expenses").set("Idempotency-Key", newKey()).set("Authorization", bearer(a)).send(expenseBody(over));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code });
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).post("/expenses").set("Idempotency-Key", newKey()).set("Authorization", bearer(a)).send([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "unknown_category" });
  });

  it("answers 400 bad_request for malformed JSON from a permitted user", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses").set("Idempotency-Key", newKey())
      .set("Authorization", bearer(a))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 413 too_large for a body over 10 kb", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses").set("Idempotency-Key", newKey())
      .set("Authorization", bearer(a))
      .send(expenseBody({ extra: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("POST /expenses: Idempotency-Key header (5.7c)", () => {
  it("answers 400 missing_idempotency_key without the header, and saves nothing", async () => {
    const { app, store, a, bearer } = await build();
    const res = await request(app).post("/expenses").set("Authorization", bearer(a)).send(expenseBody());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "missing_idempotency_key" });
    expect(await store.expenses.list({})).toEqual([]);
  });

  it("answers 400 invalid_idempotency_key for a short key", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/expenses")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", "short")
      .send(expenseBody());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_idempotency_key" });
  });

  it("answers a repeat with 201, the first expense and Idempotent-Replayed: true, saving nothing more", async () => {
    const { app, store, a, bearer } = await build();
    const k = newKey();
    const send = () =>
      request(app).post("/expenses").set("Authorization", bearer(a)).set("Idempotency-Key", k).send(expenseBody());
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.headers["cache-control"]).toBe("no-store");
    expect(second.body).toEqual(first.body);
    expect(await store.expenses.list({})).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("answers 409 idempotency_conflict for the same key with another amount", async () => {
    const { app, store, a, bearer } = await build();
    const k = newKey();
    const send = (over: Record<string, unknown>) =>
      request(app).post("/expenses").set("Authorization", bearer(a)).set("Idempotency-Key", k).send(expenseBody(over));
    await send({});
    const res = await send({ amount: "5000.51" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "idempotency_conflict" });
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("answers 401, not 400, without a token and without a key", async () => {
    const { app } = await build();
    const res = await request(app).post("/expenses").send(expenseBody());
    expect(res.status).toBe(401);
  });

  it("answers 403, not 400, to Staff without expenses.create and without a key", async () => {
    const { app, viewOnly, bearer } = await build();
    const res = await request(app).post("/expenses").set("Authorization", bearer(viewOnly)).send(expenseBody());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });
});

describe("expense routes that do not exist yet", () => {
  it.each([
    { method: "get" as const, path: "/expenses/x" },
    { method: "put" as const, path: "/expenses/x" },
  ])("answers 404 to $method $path (edit at 5.9c)", async ({ method, path }) => {
    const { app, admin, bearer } = await build();
    const res = await request(app)[method](path).set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
  });
});

describe("GET /expenses (5.8b)", () => {
  /** Staff b may record and view; b records two expenses, the Super Admin one. Fictional data only (D-08). */
  async function buildList() {
    const base = await build();
    const b = await base.store.users.create({
      email: "staff-b@example.test",
      passwordHash: "not-a-real-hash",
      displayName: "staff-b",
      role: "STAFF",
      permissions: ["expenses.create", "expenses.view"],
    });
    const post = async (u: { id: string }, over: Record<string, unknown>) => {
      const res = await request(base.app)
        .post("/expenses").set("Idempotency-Key", newKey())
        .set("Authorization", base.bearer(u))
        .send(expenseBody(over));
      expect(res.status).toBe(201);
      return res.body.expense as { id: string; createdAt: string };
    };
    const b1 = await post(b, { category: "Others", narration: "fuel", amount: "0.10", method: "BANK_TRANSFER" });
    const b2 = await post(b, { amount: "0.20" });
    const ad = await post(base.admin, { category: "Asset Purchase", amount: "250000" });
    return { ...base, b, b1, b2, ad };
  }

  const ids = (body: { expenses: { id: string }[] }) => body.expenses.map((e) => e.id).sort();

  it("answers 401 without a token", async () => {
    const { app } = await buildList();
    const res = await request(app).get("/expenses");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without expenses.view, before checking the query", async () => {
    const { app, a, bearer } = await buildList();
    const res = await request(app).get("/expenses?category=Fuel").set("Authorization", bearer(a));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 200 to Staff with expenses.view but not expenses.create", async () => {
    const { app, viewOnly, bearer } = await buildList();
    const res = await request(app).get("/expenses").set("Authorization", bearer(viewOnly));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expenses: [], total: "0.00" });
  });

  it("answers 200 for Staff with only their expenses, the total, no-store and exact fields", async () => {
    const { app, admin, b, b1, b2, bearer } = await buildList();
    const res = await request(app).get(`/expenses?createdById=${admin.id}`).set("Authorization", bearer(b));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object)).toEqual(["expenses", "total"]);
    expect(ids(res.body)).toEqual([b1.id, b2.id].sort());
    expect(res.body.total).toBe("0.30");
    expect(res.body.expenses).toContainEqual(b1);
    expect(Object.keys(res.body.expenses[0] as object).sort()).toEqual([
      "amount",
      "category",
      "createdAt",
      "createdById",
      "description",
      "id",
      "method",
      "narration",
    ]);
  });

  it("answers 200 for the Super Admin with every expense, or one creator's", async () => {
    const { app, admin, b, b1, b2, ad, bearer } = await buildList();
    const all = await request(app).get("/expenses").set("Authorization", bearer(admin));
    expect(all.status).toBe(200);
    expect(ids(all.body)).toEqual([b1.id, b2.id, ad.id].sort());
    expect(all.body.total).toBe("250000.30");
    const one = await request(app).get(`/expenses?createdById=${b.id}`).set("Authorization", bearer(admin));
    expect(ids(one.body)).toEqual([b1.id, b2.id].sort());
    expect(one.body.total).toBe("0.30");
  });

  it("passes category, method and the half-open time range from the query", async () => {
    const { app, admin, b1, b2, bearer } = await buildList();
    const get = (query: string) => request(app).get(`/expenses?${query}`).set("Authorization", bearer(admin));
    const others = await get("category=Others");
    expect(others.body).toEqual({ expenses: [b1], total: "0.10" });
    const cashAllowances = await get("category=Allowances&method=CASH");
    expect(cashAllowances.body).toEqual({ expenses: [b2], total: "0.20" });
    const spaced = await get("category=Asset%20Purchase");
    expect(spaced.body.total).toBe("250000.00");
    const from = await get(`category=Others&from=${b1.createdAt}`);
    expect(ids(from.body)).toEqual([b1.id]);
    const before = await get(`category=Others&before=${b1.createdAt}`);
    expect(before.body).toEqual({ expenses: [], total: "0.00" });
  });

  it.each([
    { label: "an unknown category", query: "category=Fuel", code: "invalid_category" },
    { label: "a repeated category", query: "category=Others&category=Loan", code: "invalid_category" },
    { label: "a method in the wrong case", query: "method=cash", code: "invalid_method" },
    { label: "an empty createdById", query: "createdById=", code: "invalid_created_by_id" },
    { label: "a date without a time", query: "from=2026-10-01", code: "invalid_from" },
    { label: "a time with an offset", query: "before=2026-10-01T00:00:00%2B01:00", code: "invalid_before" },
    { label: "from after before", query: "from=2026-10-02T00:00:00Z&before=2026-10-01T00:00:00Z", code: "invalid_range" },
  ])("answers 400 with the code for $label", async ({ query, code }) => {
    const { app, b, bearer } = await buildList();
    const res = await request(app).get(`/expenses?${query}`).set("Authorization", bearer(b));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code });
  });
});

describe("DELETE /expenses/:id (5.9b)", () => {
  /** Staff d may record and delete; d and the Super Admin each record one expense. Fictional data only (D-08). */
  async function buildDelete() {
    const base = await build();
    const d = await base.store.users.create({
      email: "staff-d@example.test",
      passwordHash: "not-a-real-hash",
      displayName: "staff-d",
      role: "STAFF",
      permissions: ["expenses.create", "expenses.delete"],
    });
    const post = async (u: { id: string }) => {
      const res = await request(base.app)
        .post("/expenses").set("Idempotency-Key", newKey())
        .set("Authorization", base.bearer(u))
        .send(expenseBody());
      expect(res.status).toBe(201);
      return res.body.expense as { id: string };
    };
    const d1 = await post(d);
    const ad = await post(base.admin);
    return { ...base, d, d1, ad };
  }

  it("answers 401 without a token", async () => {
    const { app, d1 } = await buildDelete();
    const res = await request(app).delete(`/expenses/${d1.id}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without expenses.delete, and deletes nothing", async () => {
    const { app, store, a, d1, bearer } = await buildDelete();
    const res = await request(app).delete(`/expenses/${d1.id}`).set("Authorization", bearer(a));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedAt: null });
  });

  it("answers 204 with no body and no-store for Staff deleting their own expense", async () => {
    const { app, store, d, d1, bearer } = await buildDelete();
    const res = await request(app).delete(`/expenses/${d1.id}`).set("Authorization", bearer(d));
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(await store.expenses.findById(d1.id)).toMatchObject({ deletedById: d.id });
    expect((await store.audit.listByActor(d.id)).map((x) => x.action)).toEqual(["expense.created", "expense.deleted"]);
  });

  it("leaves a deleted expense out of GET /expenses and its total", async () => {
    const { app, admin, d1, ad, bearer } = await buildDelete();
    const res = await request(app).delete(`/expenses/${d1.id}`).set("Authorization", bearer(admin));
    expect(res.status).toBe(204);
    const list = await request(app).get("/expenses").set("Authorization", bearer(admin));
    expect(list.body.expenses.map((e: { id: string }) => e.id)).toEqual([ad.id]);
    expect(list.body.total).toBe("5000.50");
  });

  it("answers 404 not_found to Staff for the Super Admin's expense, an unknown id and a second delete", async () => {
    const { app, store, d, d1, ad, bearer } = await buildDelete();
    const del = (id: string) => request(app).delete(`/expenses/${id}`).set("Authorization", bearer(d));
    const other = await del(ad.id);
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ error: "not_found" });
    expect(await store.expenses.findById(ad.id)).toMatchObject({ deletedAt: null });
    expect((await del("no-such-expense")).body).toEqual({ error: "not_found" });
    expect((await del(d1.id)).status).toBe(204);
    const again = await del(d1.id);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: "not_found" });
  });

  it("answers 409 not_deletable with the code for a Loan-linked and a pay-off expense", async () => {
    const { app, store, admin, bearer } = await buildDelete();
    const member = await store.members.create({
      fullName: "Route Member",
      phone: "",
      address: "",
      occupation: "",
      createdById: admin.id,
    });
    const loan = await store.loans.create({ memberId: member.id, principal: 100n, createdById: admin.id });
    const loanExpense = await store.expenses.create({
      category: "Loan",
      amount: 100n,
      method: "CASH",
      loanId: loan.id,
      createdById: admin.id,
    });
    const payOff = await store.expenses.create({
      category: "Membership Withdrawal",
      amount: 100n,
      method: "CASH",
      createdById: admin.id,
    });
    const loanRes = await request(app).delete(`/expenses/${loanExpense.id}`).set("Authorization", bearer(admin));
    expect(loanRes.status).toBe(409);
    expect(loanRes.body).toEqual({ error: "not_deletable", code: "loan_linked" });
    const payOffRes = await request(app).delete(`/expenses/${payOff.id}`).set("Authorization", bearer(admin));
    expect(payOffRes.status).toBe(409);
    expect(payOffRes.body).toEqual({ error: "not_deletable", code: "pay_off" });
    expect(await store.expenses.findById(loanExpense.id)).toMatchObject({ deletedAt: null });
    expect(await store.expenses.findById(payOff.id)).toMatchObject({ deletedAt: null });
  });
});
