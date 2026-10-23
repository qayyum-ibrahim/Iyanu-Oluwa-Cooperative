import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08). Amounts are made up.
const SECRET = "test-only-secret-for-payoffs-routes-0123456789";
const T0 = new Date("2026-10-22T10:00:00.000Z");
let keyCount = 0;
const newKey = () => `payoff-route-key-${String(++keyCount).padStart(6, "0")}`;

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
  const a = await make("staff-a", "STAFF", ["payoff.process"]);
  const b = await make("staff-b", "STAFF", ["payoff.process"]);
  const noRight = await make("no-right", "STAFF", ["members.edit", "loans.disburse", "expenses.create"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  /** The DR-05 worked example, saved straight through the store: payout ₦25,000; ₦3,000 stays. */
  const payExample = (memberId: string, createdById: string) => {
    const lines = [
      { category: "Shares", amount: 1_200_000n },
      { category: "Savings", amount: 800_000n },
      { category: "Special Savings", amount: 500_000n },
      { category: "Development Levy", amount: 100_000n },
      { category: "Entrance Fee", amount: 200_000n },
    ];
    return store.payments.create({
      memberId,
      method: "CASH",
      paidOn: "2026-10-20",
      total: 2_800_000n,
      lines,
      createdById,
    });
  };
  return { store, app, admin, a, b, noRight, bearer, addMember, payExample };
}

const payOffBody = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  memberId,
  method: "BANK_TRANSFER",
  total: "25000",
  ...over,
});

describe("POST /payoffs", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/payoffs").set("Idempotency-Key", newKey()).send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without payoff.process, and saves nothing", async () => {
    const { app, store, a, noRight, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(noRight))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.payOffs.listByMember(m.id)).toEqual([]);
  });

  it("answers 403, not 400, to a caller without the permission who sends malformed JSON", async () => {
    const { app, noRight, bearer } = await build();
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(noRight))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 201 for Staff: no-store, exact fields, exact values (DR-05 example)", async () => {
    const { app, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id));
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
    expect(Object.keys(res.body as object)).toEqual(["payOff"]);
    expect(Object.keys(res.body.payOff as object).sort()).toEqual([
      "createdAt",
      "createdById",
      "expenseId",
      "id",
      "lines",
      "memberId",
      "membershipId",
      "method",
      "total",
    ]);
    expect(res.body.payOff).toMatchObject({
      memberId: m.id,
      membershipId: "IO-001",
      method: "BANK_TRANSFER",
      total: "25000.00",
      lines: [
        { category: "Shares", amount: "12000.00" },
        { category: "Savings", amount: "8000.00" },
        { category: "Special Savings", amount: "5000.00" },
      ],
      createdById: a.id,
    });
    expect(new Date(res.body.payOff.createdAt as string).toISOString()).toBe(res.body.payOff.createdAt);
  });

  it("saves the pay-off, one Membership Withdrawal expense, the Inactive status and one audit entry", async () => {
    const { app, store, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id));
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toEqual([
      expect.objectContaining({
        id: res.body.payOff.expenseId,
        category: "Membership Withdrawal",
        amount: 2_500_000n,
        method: "BANK_TRANSFER",
        payOffId: res.body.payOff.id,
      }),
    ]);
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["payoff.processed"]);
  });

  it("answers 201 for the Super Admin on another user's member", async () => {
    const { app, admin, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(admin))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id));
    expect(res.status).toBe(201);
    expect(res.body.payOff.createdById).toBe(admin.id);
  });

  it("answers 409 member_inactive for a second pay-off with a new key, and saves nothing more", async () => {
    const { app, store, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const send = () =>
      request(app).post("/payoffs").set("Authorization", bearer(a)).set("Idempotency-Key", newKey()).send(payOffBody(m.id));
    await send();
    const res = await send();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "member_inactive" });
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
  });

  it("answers 409 active_loan while the member has an active loan (DR-06), and saves nothing", async () => {
    const { app, store, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    await store.loans.create({ memberId: m.id, principal: 30_000_000n, createdById: a.id });
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "active_loan" });
    expect(await store.payOffs.listByMember(m.id)).toEqual([]);
    expect((await store.members.findById(m.id))?.status).toBe("ACTIVE");
  });

  it("answers 409 nothing_to_pay_off for a member with no refundable balance", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id, { total: "0" }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "nothing_to_pay_off" });
  });

  it("answers 409 payout_changed when the total is not the payout, and saves nothing", async () => {
    const { app, store, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id, { total: "24999.99" }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "payout_changed" });
    expect(await store.payOffs.listByMember(m.id)).toEqual([]);
    expect((await store.members.findById(m.id))?.status).toBe("ACTIVE");
  });

  it("answers 404 when Staff pay out another user's member", async () => {
    const { app, a, b, bearer, addMember, payExample } = await build();
    const m = await addMember(b.id, "B One");
    await payExample(m.id, b.id);
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 404 for an unknown member", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody("no-such-id"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it.each([
    { label: "a JSON number total", over: { total: 25000 }, code: "invalid_total" },
    { label: "a total with three decimals", over: { total: "25000.001" }, code: "invalid_total" },
    { label: "an unknown method", over: { method: "cash" }, code: "invalid_method" },
    { label: "an empty member id", over: { memberId: "" }, code: "invalid_member_id" },
  ])("answers 400 with the code for $label", async ({ over, code }) => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id, over));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code });
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_member_id" });
  });

  it("answers 400 bad_request for malformed JSON from a permitted user", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/payoffs")
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
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", newKey())
      .send(payOffBody(m.id, { extra: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("POST /payoffs: Idempotency-Key header (as D-48)", () => {
  it("answers 400 missing_idempotency_key without the header, and saves nothing", async () => {
    const { app, store, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const res = await request(app).post("/payoffs").set("Authorization", bearer(a)).send(payOffBody(m.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "missing_idempotency_key" });
    expect(await store.payOffs.listByMember(m.id)).toEqual([]);
  });

  it("answers 400 invalid_idempotency_key for a short key", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payoffs")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", "short")
      .send(payOffBody(m.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_idempotency_key" });
  });

  it("answers 201 with the first pay-off and the replay header on a repeat, not 409", async () => {
    const { app, store, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const k = newKey();
    const send = () =>
      request(app).post("/payoffs").set("Authorization", bearer(a)).set("Idempotency-Key", k).send(payOffBody(m.id));
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.headers["cache-control"]).toBe("no-store");
    expect(second.body).toEqual(first.body);
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({})).toHaveLength(1);
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["payoff.processed"]);
  });

  it("answers 409 idempotency_conflict for the same key with another method", async () => {
    const { app, a, bearer, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const k = newKey();
    const send = (over: Record<string, unknown>) =>
      request(app).post("/payoffs").set("Authorization", bearer(a)).set("Idempotency-Key", k).send(payOffBody(m.id, over));
    await send({});
    const res = await send({ method: "CASH" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "idempotency_conflict" });
  });

  it("answers 403 before looking at the key", async () => {
    const { app, noRight, bearer } = await build();
    const res = await request(app).post("/payoffs").set("Authorization", bearer(noRight)).send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });
});

describe("pay-off routes that do not exist yet", () => {
  it.each([
    { method: "get" as const, path: "/payoffs" },
    { method: "get" as const, path: "/payoffs/x" },
    { method: "put" as const, path: "/payoffs/x" },
    { method: "delete" as const, path: "/payoffs/x" },
  ])("answers 404 to $method $path", async ({ method, path }) => {
    const { app, admin, bearer } = await build();
    const res = await request(app)[method](path).set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
  });
});
