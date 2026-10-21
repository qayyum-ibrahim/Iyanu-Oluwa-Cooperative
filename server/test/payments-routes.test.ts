import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-payments-routes-0123456789";
const T0 = new Date("2026-10-20T10:00:00.000Z");
let keyCounter = 0;
const key = () => `route-test-key-${String(++keyCounter).padStart(8, "0")}`;

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
  const a = await make("staff-a", "STAFF", ["payments.create"]);
  const b = await make("staff-b", "STAFF", ["payments.create"]);
  const noPay = await make("no-pay", "STAFF", ["members.view"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  return { store, app, admin, a, b, noPay, bearer, addMember };
}

const payBody = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  memberId,
  method: "CASH",
  total: "20000",
  lines: [
    { category: "Shares", amount: "5000" },
    { category: "Savings", amount: "10000" },
    { category: "Special Savings", amount: "5000" },
  ],
  ...over,
});

describe("POST /payments", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/payments").set("Idempotency-Key", key()).send(payBody("x"));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without payments.create, and saves nothing", async () => {
    const { app, noPay, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(noPay))
      .send(payBody(m.id));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("answers 403, not 400, to a caller without the permission who sends malformed JSON", async () => {
    const { app, noPay, bearer } = await build();
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(noPay))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 201 for Staff: no-store, exact fields, exact values", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id));
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body.payment as object).sort()).toEqual([
      "createdAt",
      "createdById",
      "id",
      "lines",
      "memberId",
      "membershipId",
      "method",
      "total",
    ]);
    expect(res.body.payment).toMatchObject({
      memberId: m.id,
      membershipId: "IO-001",
      method: "CASH",
      total: "20000.00",
      createdById: a.id,
      lines: [
        { category: "Shares", amount: "5000.00" },
        { category: "Savings", amount: "10000.00" },
        { category: "Special Savings", amount: "5000.00" },
      ],
    });
  });

  it("answers 201 for the Super Admin on another user's member", async () => {
    const { app, admin, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(admin))
      .send(payBody(m.id));
    expect(res.status).toBe(201);
    expect(res.body.payment.createdById).toBe(admin.id);
  });

  it("saves the payment and one audit entry", async () => {
    const { app, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    await request(app).post("/payments").set("Idempotency-Key", key()).set("Authorization", bearer(a)).send(payBody(m.id));
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    const actions = (await store.audit.listByActor(a.id)).map((e) => e.action);
    expect(actions).toEqual(["payment.created"]);
  });

  it("answers 404 when Staff pay into another user's member", async () => {
    const { app, a, b, bearer, addMember } = await build();
    const m = await addMember(b.id, "B One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 404 for an unknown member", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody("no-such-id"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 409 member_inactive for an Inactive member", async () => {
    const { app, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    await store.members.setStatus(m.id, "INACTIVE");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "member_inactive" });
  });

  it("answers 409 no_active_loan for Loan Repaid without an active loan, and saves nothing", async () => {
    const { app, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id, { total: "20000", lines: [{ category: "Loan Repaid", amount: "20000" }] }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "no_active_loan" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("answers 409 loan_overpayment above the outstanding amount, and 201 at it", async () => {
    const { app, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    await store.loans.create({ memberId: m.id, principal: 30_000_000n, createdById: a.id });
    const send = (amount: string) =>
      request(app)
        .post("/payments").set("Idempotency-Key", key())
        .set("Authorization", bearer(a))
        .send(payBody(m.id, { total: amount, lines: [{ category: "Loan Repaid", amount }] }));
    const over = await send("300000.01");
    expect(over.status).toBe(409);
    expect(over.body).toEqual({ error: "loan_overpayment" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
    const exact = await send("300000");
    expect(exact.status).toBe(201);
    expect(exact.body.payment.lines).toEqual([{ category: "Loan Repaid", amount: "300000.00" }]);
  });

  it("answers 400 with the code when the lines do not add up", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id, { total: "19999" }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "mismatch" });
  });

  it("answers 400 with the code and the line position for a bad line", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(
        payBody(m.id, {
          lines: [
            { category: "Shares", amount: "5000" },
            { category: "Membership Withdrawal", amount: "15000" },
          ],
        }),
      );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "system_only", lineIndex: 1 });
  });

  it("answers 400 when the total is sent as a JSON number", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id, { total: 20000 }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_total" });
  });

  it("answers 400 for an unknown method", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id, { method: "cash" }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_method" });
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_input");
  });

  it("answers 400 bad_request for malformed JSON from a permitted user", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 401, not 400, for malformed JSON without a token", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(401);
  });

  it("answers 413 too_large for a body over 10 kb", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments").set("Idempotency-Key", key())
      .set("Authorization", bearer(a))
      .send(payBody(m.id, { note: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("routes that do not exist", () => {
  it.each([
    { method: "get" as const, path: "/payments/x" },
    { method: "put" as const, path: "/payments/x" },
    { method: "delete" as const, path: "/payments/x" },
  ])("answers 404 to $method $path: payments cannot be read one by one, changed or deleted here", async ({ method, path }) => {
    const { app, admin, bearer } = await build();
    const res = await request(app)[method](path).set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
  });
});