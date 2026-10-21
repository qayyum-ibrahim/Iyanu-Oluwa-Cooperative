import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-loans-routes-0123456789";
const T0 = new Date("2026-10-21T10:00:00.000Z");
let keyCount = 0;
const newKey = () => `loan-route-key-${String(++keyCount).padStart(6, "0")}`;

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
  const a = await make("staff-a", "STAFF", ["loans.disburse"]);
  const b = await make("staff-b", "STAFF", ["loans.disburse"]);
  const createOnly = await make("create-only", "STAFF", ["loans.create"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  return { store, app, admin, a, b, createOnly, bearer, addMember };
}

const loanBody = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  memberId,
  principal: "300000",
  method: "CASH",
  ...over,
});

describe("POST /loans", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/loans").send(loanBody("x"));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff with loans.create but not loans.disburse, and saves nothing", async () => {
    const { app, store, createOnly, bearer, addMember } = await build();
    const m = await addMember(createOnly.id, "C One");
    const res = await request(app).post("/loans").set("Authorization", bearer(createOnly)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
  });

  it("answers 403, not 400, to a caller without the permission who sends malformed JSON", async () => {
    const { app, createOnly, bearer } = await build();
    const res = await request(app)
      .post("/loans")
      .set("Authorization", bearer(createOnly))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 201 for Staff: no-store, exact fields, exact values", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/loans")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(loanBody(m.id, { interestNote: "5% flat", notes: "school fees" }));
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
    expect(Object.keys(res.body as object)).toEqual(["loan"]);
    expect(Object.keys(res.body.loan as object).sort()).toEqual([
      "createdAt",
      "createdById",
      "expenseId",
      "id",
      "interestNote",
      "memberId",
      "membershipId",
      "notes",
      "principal",
    ]);
    expect(res.body.loan).toMatchObject({
      memberId: m.id,
      membershipId: "IO-001",
      principal: "300000.00",
      interestNote: "5% flat",
      notes: "school fees",
      createdById: a.id,
    });
    expect(new Date(res.body.loan.createdAt as string).toISOString()).toBe(res.body.loan.createdAt);
  });

  it("saves the loan, one Loan expense and one audit entry", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toEqual([
      expect.objectContaining({ id: res.body.loan.expenseId, category: "Loan", amount: 30_000_000n, loanId: res.body.loan.id }),
    ]);
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["loan.disbursed"]);
  });

  it("answers 201 for the Super Admin on another user's member", async () => {
    const { app, admin, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).post("/loans").set("Authorization", bearer(admin)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    expect(res.status).toBe(201);
    expect(res.body.loan.createdById).toBe(admin.id);
  });

  it("answers 409 active_loan for a second loan, and saves nothing more", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "active_loan" });
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("answers 409 member_inactive for an Inactive member", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.members.setStatus(m.id, "INACTIVE");
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "member_inactive" });
  });

  it("answers 404 when Staff give a loan to another user's member", async () => {
    const { app, a, b, bearer, addMember } = await build();
    const m = await addMember(b.id, "B One");
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody(m.id));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 404 for an unknown member", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody("no-such-id"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it.each([
    { label: "a JSON number principal", over: { principal: 300000 }, code: "invalid_principal" },
    { label: "a zero principal", over: { principal: "0" }, code: "principal_not_positive" },
    { label: "an unknown method", over: { method: "cash" }, code: "invalid_method" },
    { label: "a long interest note", over: { interestNote: "n".repeat(201) }, code: "invalid_interest_note" },
    { label: "notes that are not text", over: { notes: ["x"] }, code: "invalid_notes" },
  ])("answers 400 with the code for $label", async ({ over, code }) => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(loanBody(m.id, over));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code });
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_member_id" });
  });

  it("answers 400 bad_request for malformed JSON from a permitted user", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/loans")
      .set("Authorization", bearer(a))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 413 too_large for a body over 10 kb", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/loans")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(loanBody(m.id, { extra: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("POST /loans: Idempotency-Key header (D-60)", () => {
  it("answers 400 missing_idempotency_key without the header, and saves nothing", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).post("/loans").set("Authorization", bearer(a)).send(loanBody(m.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "missing_idempotency_key" });
    expect(await store.loans.listByMember(m.id)).toEqual([]);
  });

  it("answers 400 invalid_idempotency_key for a short key", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/loans")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", "short")
      .send(loanBody(m.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_idempotency_key" });
  });

  it("answers 201 with the first loan and the replay header on a repeat, not 409", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const k = newKey();
    const send = () =>
      request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", k).send(loanBody(m.id));
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.headers["cache-control"]).toBe("no-store");
    expect(second.body).toEqual(first.body);
    expect(await store.loans.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("answers 409 idempotency_conflict for the same key with another principal", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const k = newKey();
    const send = (over: Record<string, unknown>) =>
      request(app).post("/loans").set("Authorization", bearer(a)).set("Idempotency-Key", k).send(loanBody(m.id, over));
    await send({});
    const res = await send({ principal: "1000" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "idempotency_conflict" });
  });

  it("answers 403 before looking at the key", async () => {
    const { app, createOnly, bearer } = await build();
    const res = await request(app).post("/loans").set("Authorization", bearer(createOnly)).send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 401 without a token, whatever the key", async () => {
    const { app } = await build();
    const res = await request(app).post("/loans").set("Idempotency-Key", newKey()).send({});
    expect(res.status).toBe(401);
  });
});

describe("loan routes that do not exist yet", () => {
  it.each([
    { method: "get" as const, path: "/loans" },
    { method: "get" as const, path: "/loans/x" },
    { method: "put" as const, path: "/loans/x" },
    { method: "delete" as const, path: "/loans/x" },
  ])("answers 404 to $method $path (list is 5.6; no edit or delete, OQ-16)", async ({ method, path }) => {
    const { app, admin, bearer } = await build();
    const res = await request(app)[method](path).set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
  });
});
