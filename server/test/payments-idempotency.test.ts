import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import {
  createPayment,
  type PaymentActor,
  type PaymentResult,
  type PaymentView,
} from "../src/payments.js";
import type { Role, Store, UserRecord } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-idempotency-0123456789";
const T0 = new Date("2026-10-20T10:00:00.000Z");
const key = (n: number) => `idem-test-key-${String(n).padStart(6, "0")}`;

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
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
  return { store, app, admin, a, b, noPay, addMember, bearer };
}

const actorOf = (u: UserRecord): PaymentActor => ({ id: u.id, subject: subjectOf(u) });

const LINES = [
  { category: "Shares", amount: "5000" },
  { category: "Savings", amount: "10000" },
  { category: "Special Savings", amount: "5000" },
];
const pay = (memberId: unknown, k: unknown, over: Record<string, unknown> = {}) => ({
  idempotencyKey: k,
  memberId,
  method: "CASH",
  total: "20000",
  lines: LINES,
  ...over,
});

function must(r: PaymentResult): PaymentView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

describe("createPayment: idempotency key and payment date (U.4b)", () => {
  it("a repeat with the same payment date returns the first payment", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await createPayment(store, actorOf(a), pay(m.id, key(901), { paidOn: "2026-10-01" })));
    const second = await createPayment(store, actorOf(a), pay(m.id, key(901), { paidOn: "2026-10-01" }));
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(must(second)).toEqual(first);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("refuses the same key with another payment date, and saves nothing more", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await createPayment(store, actorOf(a), pay(m.id, key(902), { paidOn: "2026-10-01" }));
    for (const paidOn of ["2026-10-02", undefined]) {
      const r = await createPayment(store, actorOf(a), pay(m.id, key(902), { paidOn }));
      expect(r).toEqual({ ok: false, reason: "idempotency_conflict" });
    }
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });
});

describe("createPayment: idempotency key", () => {
  it("a first request is saved and not marked as a replay", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = await createPayment(store, actorOf(a), pay(m.id, key(1)));
    expect(r).toMatchObject({ ok: true, replayed: false });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("a repeat returns the first payment: one payment, one audit entry", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const first = await createPayment(store, actorOf(a), pay(m.id, key(2)));
    const second = await createPayment(store, actorOf(a), pay(m.id, key(2)));
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(must(second)).toEqual(must(first));
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("treats the same amounts written differently as the same request", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await createPayment(store, actorOf(a), pay(m.id, key(3))));
    const second = await createPayment(
      store,
      actorOf(a),
      pay(m.id, key(3), {
        total: "20000.00",
        lines: [
          { category: "Shares", amount: "5000.00" },
          { category: "Savings", amount: "10000.00" },
          { category: "Special Savings", amount: "5000.00" },
        ],
      }),
    );
    expect(second).toMatchObject({ ok: true, replayed: true });
    expect(must(second).id).toBe(first.id);
  });

  it.each([
    {
      label: "a different total",
      over: { total: "10000", lines: [{ category: "Shares", amount: "10000" }] },
    },
    {
      label: "the same lines in another order",
      over: { lines: [...LINES].reverse() },
    },
    { label: "another method", over: { method: "BANK_TRANSFER" } },
    { label: "a payment date where the first had none", over: { paidOn: "2026-10-01" } },
  ])("refuses the same key with $label, and saves nothing more", async ({ over }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await createPayment(store, actorOf(a), pay(m.id, key(4)));
    const r = await createPayment(store, actorOf(a), pay(m.id, key(4), over));
    expect(r).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("refuses the same key for another member", async () => {
    const { store, a, addMember } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    await createPayment(store, actorOf(a), pay(m1.id, key(5)));
    const r = await createPayment(store, actorOf(a), pay(m2.id, key(5)));
    expect(r).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(await store.payments.listByMember(m2.id)).toEqual([]);
  });

  it("refuses the same key with the same total and categories but another split of the amounts", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await createPayment(store, actorOf(a), pay(m.id, key(14)));
    const r = await createPayment(
      store,
      actorOf(a),
      pay(m.id, key(14), {
        lines: [
          { category: "Shares", amount: "10000" },
          { category: "Savings", amount: "5000" },
          { category: "Special Savings", amount: "5000" },
        ],
      }),
    );
    expect(r).toEqual({ ok: false, reason: "idempotency_conflict" });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("keeps keys apart per user", async () => {
    const { store, a, b, addMember } = await build();
    const ma = await addMember(a.id, "A One");
    const mb = await addMember(b.id, "B One");
    const ra = must(await createPayment(store, actorOf(a), pay(ma.id, key(6))));
    const rb = await createPayment(store, actorOf(b), pay(mb.id, key(6)));
    expect(rb).toMatchObject({ ok: true, replayed: false });
    expect(must(rb).id).not.toBe(ra.id);
  });

  it("does not use up the key when the request is refused for its breakdown", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const bad = await createPayment(store, actorOf(a), pay(m.id, key(7), { total: "19999" }));
    expect(bad).toEqual({ ok: false, reason: "invalid_input", code: "mismatch" });
    const good = await createPayment(store, actorOf(a), pay(m.id, key(7)));
    expect(good).toMatchObject({ ok: true, replayed: false });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("does not use up the key when the member is unknown", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), pay("no-such-id", key(8)))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await createPayment(store, actorOf(a), pay(m.id, key(8)))).toMatchObject({
      ok: true,
      replayed: false,
    });
  });

  it("still returns the first payment after the member became Inactive, but refuses a new key", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await createPayment(store, actorOf(a), pay(m.id, key(9))));
    await store.members.setStatus(m.id, "INACTIVE");
    const again = await createPayment(store, actorOf(a), pay(m.id, key(9)));
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again).id).toBe(first.id);
    expect(await createPayment(store, actorOf(a), pay(m.id, key(10)))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
  });

  it("does not use up the key when the audit write fails", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const failing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({ ...tx, audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) } }),
        ),
    };
    await expect(createPayment(failing, actorOf(a), pay(m.id, key(11)))).rejects.toThrow("audit down");
    expect(await createPayment(store, actorOf(a), pay(m.id, key(11)))).toMatchObject({
      ok: true,
      replayed: false,
    });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("handles a lost race: the key is saved between the lookup and the save", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const first = must(await createPayment(store, actorOf(a), pay(m.id, key(12))));
    let lookups = 0;
    const racing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            payments: {
              ...tx.payments,
              findByKey: async (userId, k) => {
                lookups += 1;
                return lookups === 1 ? null : tx.payments.findByKey(userId, k);
              },
            },
          }),
        ),
    };
    const r = await createPayment(racing, actorOf(a), pay(m.id, key(12)));
    expect(r).toMatchObject({ ok: true, replayed: true });
    expect(must(r).id).toBe(first.id);
    expect(lookups).toBe(2);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("saves one payment when two identical requests arrive together", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const [r1, r2] = await Promise.all([
      createPayment(store, actorOf(a), pay(m.id, key(13))),
      createPayment(store, actorOf(a), pay(m.id, key(13))),
    ]);
    expect(must(r1).id).toBe(must(r2).id);
    const replays = [r1, r2].filter((r) => r.ok && r.replayed);
    expect(replays).toHaveLength(1);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("checks the permission before the key", async () => {
    const { store, noPay, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(noPay), pay(m.id, undefined))).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("refuses a missing key and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), pay(m.id, undefined))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "missing_idempotency_key",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "empty", value: "" },
    { label: "a number", value: 1234567890123456 },
    { label: "an object", value: {} },
    { label: "15 characters", value: "k".repeat(15) },
    { label: "65 characters", value: "k".repeat(65) },
    { label: "holding a space", value: "idem key 0000000001" },
    { label: "holding a slash", value: "idem/key/0000000001" },
  ])("refuses a key that is $label", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), pay(m.id, value))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_idempotency_key",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("accepts keys of 16 and 64 characters, with dashes and underscores", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    for (const k of ["k".repeat(16), "k".repeat(64), "a-b_C-9".padEnd(20, "x")]) {
      expect(await createPayment(store, actorOf(a), pay(m.id, k))).toMatchObject({ ok: true });
    }
    expect(await store.payments.listByMember(m.id)).toHaveLength(3);
  });
});

describe("POST /payments: Idempotency-Key header", () => {
  const body = (memberId: string, over: Record<string, unknown> = {}) => ({
    memberId,
    method: "CASH",
    total: "20000",
    lines: LINES,
    ...over,
  });

  it("answers 400 missing_idempotency_key without the header, and saves nothing", async () => {
    const { app, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).post("/payments").set("Authorization", bearer(a)).send(body(m.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "missing_idempotency_key" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("answers 400 invalid_idempotency_key for a short key", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", "short")
      .send(body(m.id));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_idempotency_key" });
  });

  it("answers 201 without the replay header the first time", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer(a))
      .set("Idempotency-Key", key(20))
      .send(body(m.id));
    expect(res.status).toBe(201);
    expect(res.headers["idempotent-replayed"]).toBeUndefined();
  });

  it("answers 201 with the first payment and the replay header on a repeat", async () => {
    const { app, a, bearer, addMember, store } = await build();
    const m = await addMember(a.id, "A One");
    const send = () =>
      request(app)
        .post("/payments")
        .set("Authorization", bearer(a))
        .set("Idempotency-Key", key(21))
        .send(body(m.id));
    const first = await send();
    const second = await send();
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.headers["cache-control"]).toBe("no-store");
    expect(second.body.payment).toEqual(first.body.payment);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("answers 409 idempotency_conflict for the same key with another total", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const send = (over: Record<string, unknown>) =>
      request(app)
        .post("/payments")
        .set("Authorization", bearer(a))
        .set("Idempotency-Key", key(22))
        .send(body(m.id, over));
    await send({});
    const res = await send({ total: "10000", lines: [{ category: "Shares", amount: "10000" }] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "idempotency_conflict" });
  });

  it("answers 403 before looking at the key", async () => {
    const { app, noPay, bearer } = await build();
    const res = await request(app).post("/payments").set("Authorization", bearer(noPay)).send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 401 without a token, whatever the key", async () => {
    const { app } = await build();
    const res = await request(app).post("/payments").set("Idempotency-Key", key(23)).send({});
    expect(res.status).toBe(401);
  });
});