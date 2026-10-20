import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { listPayments, type PaymentActor } from "../src/payments.js";
import type { Role, Store, UserRecord } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fictional data only (D-08). Fake values for tests only.
const SECRET = "test-only-secret-for-payments-list-0123456789";
const T0 = new Date("2026-10-20T10:00:00.000Z");

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
  const owner = await make("owner", "SUPER_ADMIN", []);
  const a = await make("staff-a", "STAFF", ["payments.view"]);
  const b = await make("staff-b", "STAFF", ["payments.view"]);
  const noView = await make("no-view", "STAFF", ["payments.create", "members.view"]);
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "08000000001", address: "", occupation: "", createdById });
  const addPayment = (s: Store, memberId: string, createdById: string, totalKobo: bigint) =>
    s.payments.create({
      memberId,
      method: "CASH",
      total: totalKobo,
      lines: [{ category: "Savings", amount: totalKobo }],
      createdById,
    });
  return { store, owner, a, b, noView, addMember, addPayment };
}

const actorOf = (u: UserRecord): PaymentActor => ({ id: u.id, subject: subjectOf(u) });

describe("listPayments", () => {
  it("lists a Staff user's member's payments, oldest first, as views", async () => {
    const { store, a, addMember, addPayment } = await build();
    const m = await addMember(a.id, "A One");
    const p1 = await addPayment(store, m.id, a.id, 2000050n);
    const p2 = await addPayment(store, m.id, a.id, 500000n);
    const r = await listPayments(store, actorOf(a), { memberId: m.id });
    expect(r).toEqual({
      ok: true,
      value: [
        {
          id: p1.id,
          memberId: m.id,
          membershipId: m.membershipId,
          method: "CASH",
          total: "20000.50",
          lines: [{ category: "Savings", amount: "20000.50" }],
          createdById: a.id,
          createdAt: p1.createdAt.toISOString(),
        },
        {
          id: p2.id,
          memberId: m.id,
          membershipId: m.membershipId,
          method: "CASH",
          total: "5000.00",
          lines: [{ category: "Savings", amount: "5000.00" }],
          createdById: a.id,
          createdAt: p2.createdAt.toISOString(),
        },
      ],
    });
  });

  it("lists only the asked member's payments", async () => {
    const { store, a, addMember, addPayment } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    await addPayment(store, m1.id, a.id, 100n);
    await addPayment(store, m2.id, a.id, 200n);
    const r = await listPayments(store, actorOf(a), { memberId: m2.id });
    expect(r.ok && r.value.map((p) => p.total)).toEqual(["2.00"]);
  });

  it("gives an empty list for a member with no payments", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await listPayments(store, actorOf(a), { memberId: m.id })).toEqual({
      ok: true,
      value: [],
    });
  });

  it("shows Staff a payment the Super Admin recorded for their member (A-133)", async () => {
    const { store, owner, a, addMember, addPayment } = await build();
    const m = await addMember(a.id, "A One");
    await addPayment(store, m.id, owner.id, 100n);
    const r = await listPayments(store, actorOf(a), { memberId: m.id });
    expect(r.ok && r.value.map((p) => p.createdById)).toEqual([owner.id]);
  });

  it("lets the Super Admin list any member's payments", async () => {
    const { store, owner, a, addMember, addPayment } = await build();
    const m = await addMember(a.id, "A One");
    await addPayment(store, m.id, a.id, 100n);
    const r = await listPayments(store, actorOf(owner), { memberId: m.id });
    expect(r.ok && r.value).toHaveLength(1);
  });

  it("lists an Inactive member's payments", async () => {
    const { store, a, addMember, addPayment } = await build();
    const m = await addMember(a.id, "A One");
    await addPayment(store, m.id, a.id, 100n);
    await store.members.setStatus(m.id, "INACTIVE");
    const r = await listPayments(store, actorOf(a), { memberId: m.id });
    expect(r.ok && r.value).toHaveLength(1);
  });

  it("answers not_found for another Staff user's member", async () => {
    const { store, a, b, addMember, addPayment } = await build();
    const m = await addMember(b.id, "B One");
    await addPayment(store, m.id, b.id, 100n);
    expect(await listPayments(store, actorOf(a), { memberId: m.id })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("answers not_found for an unknown member", async () => {
    const { store, a } = await build();
    expect(await listPayments(store, actorOf(a), { memberId: "no-such-id" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("refuses a user without payments.view before it reads anything", async () => {
    const { store, noView, addMember } = await build();
    const m = await addMember(noView.id, "N One");
    expect(await listPayments(store, actorOf(noView), { memberId: m.id })).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await listPayments(store, actorOf(noView), {})).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses an inactive Staff user", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const actor: PaymentActor = { id: a.id, subject: { ...subjectOf(a), isActive: false } };
    expect(await listPayments(store, actor, { memberId: m.id })).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("answers missing_member_id when the member id is missing", async () => {
    const { store, a } = await build();
    expect(await listPayments(store, actorOf(a), {})).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "missing_member_id",
    });
  });

  it.each([
    { label: "empty", value: "" },
    { label: "a number", value: 7 },
    { label: "a list", value: ["x", "y"] },
    { label: "null", value: null },
  ])("answers invalid_member_id for a member id that is $label", async ({ value }) => {
    const { store, a } = await build();
    expect(await listPayments(store, actorOf(a), { memberId: value })).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_member_id",
    });
  });
});

describe("GET /payments", () => {
  async function buildApp() {
    const ctx = await build();
    const app = createApp({ store: ctx.store, tokenSecret: SECRET, now: () => T0 });
    const bearer = (u: UserRecord) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
    return { ...ctx, app, bearer };
  }

  it("answers 200 with the payments, and no key or hash leaves the server", async () => {
    const { app, bearer, a, store, addMember } = await buildApp();
    const m = await addMember(a.id, "A One");
    await store.payments.create({
      memberId: m.id,
      method: "BANK_TRANSFER",
      total: 100n,
      lines: [{ category: "Shares", amount: 100n }],
      createdById: a.id,
      idempotencyKey: "list-test-key-0000001",
      requestHash: "not-a-real-hash",
    });
    const res = await request(app)
      .get("/payments")
      .query({ memberId: m.id })
      .set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object)).toEqual(["payments"]);
    expect(res.body.payments).toHaveLength(1);
    expect(Object.keys(res.body.payments[0] as object).sort()).toEqual([
      "createdAt",
      "createdById",
      "id",
      "lines",
      "memberId",
      "membershipId",
      "method",
      "total",
    ]);
    expect(res.body.payments[0].total).toBe("1.00");
  });

  it("answers 401 without a token", async () => {
    const { app, a, addMember } = await buildApp();
    const m = await addMember(a.id, "A One");
    const res = await request(app).get("/payments").query({ memberId: m.id });
    expect(res.status).toBe(401);
  });

  it("answers 403 without payments.view", async () => {
    const { app, bearer, noView, addMember } = await buildApp();
    const m = await addMember(noView.id, "N One");
    const res = await request(app)
      .get("/payments")
      .query({ memberId: m.id })
      .set("Authorization", bearer(noView));
    expect(res.status).toBe(403);
  });

  it("answers 400 missing_member_id without a memberId", async () => {
    const { app, bearer, a } = await buildApp();
    const res = await request(app).get("/payments").set("Authorization", bearer(a));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "missing_member_id" });
  });

  it("answers 400 invalid_member_id for a repeated memberId", async () => {
    const { app, bearer, a, addMember } = await buildApp();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .get(`/payments?memberId=${m.id}&memberId=${m.id}`)
      .set("Authorization", bearer(a));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_member_id" });
  });

  it("answers 404 for another Staff user's member", async () => {
    const { app, bearer, a, b, addMember } = await buildApp();
    const m = await addMember(b.id, "B One");
    const res = await request(app)
      .get("/payments")
      .query({ memberId: m.id })
      .set("Authorization", bearer(a));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
