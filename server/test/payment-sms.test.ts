import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { paymentSmsText, recordPayment } from "../src/payment-sms.js";
import type { PaymentActor } from "../src/payments.js";
import { FakeSmsProvider, type SmsProvider } from "../src/sms.js";
import type { Role, Store, UserRecord } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fictional data only (D-08). Fake values for tests only.
const SECRET = "test-only-secret-for-payment-sms-0123456789";
const T0 = new Date("2026-10-20T10:00:00.000Z");
const PHONE = "08000000001";
const TEXT = "IYANU-OLUWA Cooperative: we received NGN 20000.00 for member IO-001. Thank you.";
let keyCounter = 0;
const nextKey = () => `sms-test-key-${String(++keyCounter).padStart(8, "0")}`;

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
  const a = await make("staff-a", "STAFF", ["payments.create"]);
  const b = await make("staff-b", "STAFF", ["payments.create"]);
  const noPay = await make("no-pay", "STAFF", ["members.view"]);
  const addMember = (createdById: string, fullName: string, phone = PHONE) =>
    store.members.create({ fullName, phone, address: "", occupation: "", createdById });
  return { store, a, b, noPay, addMember };
}

const actorOf = (u: UserRecord): PaymentActor => ({ id: u.id, subject: subjectOf(u) });

const LINES = [
  { category: "Shares", amount: "5000" },
  { category: "Savings", amount: "10000" },
  { category: "Special Savings", amount: "5000" },
];
const pay = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  idempotencyKey: nextKey(),
  memberId,
  method: "CASH",
  total: "20000",
  lines: LINES,
  ...over,
});

describe("paymentSmsText", () => {
  it("holds the total and the Membership ID only", () => {
    expect(paymentSmsText({ membershipId: "IO-007", total: "1500.50" })).toBe(
      "IYANU-OLUWA Cooperative: we received NGN 1500.50 for member IO-007. Thank you.",
    );
  });
});

describe("recordPayment", () => {
  it("sends the SMS by default, to the member's phone", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(a), pay(m.id));
    expect(r).toMatchObject({ ok: true, replayed: false, sms: { status: "sent" } });
    expect(fake.sent).toEqual([{ to: PHONE, body: TEXT }]);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("sends the SMS when sendSms is true", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(a), pay(m.id, { sendSms: true }));
    expect(r).toMatchObject({ ok: true, sms: { status: "sent" } });
    expect(fake.sent).toHaveLength(1);
  });

  it("sends nothing when sendSms is false, and still saves the payment", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(a), pay(m.id, { sendSms: false }));
    expect(r).toMatchObject({ ok: true, sms: { status: "not_requested" } });
    expect(fake.sent).toEqual([]);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("reports invalid_number for a member with no phone, and keeps the payment", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One", "");
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(a), pay(m.id));
    expect(r).toMatchObject({ ok: true, sms: { status: "failed", reason: "invalid_number" } });
    expect(fake.sent).toEqual([]);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it.each([
    { label: "empty", phone: "" },
    { label: "only spaces", phone: "   " },
  ])("does not call the provider for a phone that is $label", async ({ phone }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One", phone);
    let calls = 0;
    const spy: SmsProvider = {
      send: async () => {
        calls += 1;
        return { ok: true, providerMessageId: "spy-1" };
      },
    };
    const r = await recordPayment(store, spy, actorOf(a), pay(m.id));
    expect(r).toMatchObject({ ok: true, sms: { status: "failed", reason: "invalid_number" } });
    expect(calls).toBe(0);
  });

  it.each(["invalid_number", "invalid_message"] as const)(
    "passes the provider's failure reason %s through",
    async (reason) => {
      const { store, a, addMember } = await build();
      const m = await addMember(a.id, "A One");
      const fake = new FakeSmsProvider();
      fake.failNext(reason);
      const r = await recordPayment(store, fake, actorOf(a), pay(m.id));
      expect(r).toMatchObject({ ok: true, sms: { status: "failed", reason } });
    },
  );

  it("reports a provider failure separately, and keeps the payment", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    fake.failNext("provider_error");
    const r = await recordPayment(store, fake, actorOf(a), pay(m.id));
    expect(r).toMatchObject({ ok: true, sms: { status: "failed", reason: "provider_error" } });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("catches a provider that throws, and keeps the payment", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const broken: SmsProvider = { send: () => Promise.reject(new Error("provider down")) };
    const r = await recordPayment(store, broken, actorOf(a), pay(m.id));
    expect(r).toMatchObject({ ok: true, sms: { status: "failed", reason: "provider_error" } });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("saves the payment before it tries the SMS", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    let seen = -1;
    const probe: SmsProvider = {
      send: async () => {
        seen = (await store.payments.listByMember(m.id)).length;
        return { ok: true, providerMessageId: "probe-1" };
      },
    };
    await recordPayment(store, probe, actorOf(a), pay(m.id));
    expect(seen).toBe(1);
  });

  it("sends no second SMS for a repeat of the same key", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const k = nextKey();
    const first = await recordPayment(store, fake, actorOf(a), pay(m.id, { idempotencyKey: k }));
    const second = await recordPayment(store, fake, actorOf(a), pay(m.id, { idempotencyKey: k }));
    expect(first).toMatchObject({ ok: true, replayed: false, sms: { status: "sent" } });
    expect(second).toMatchObject({ ok: true, replayed: true, sms: { status: "skipped_repeat" } });
    expect(fake.sent).toHaveLength(1);
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("reports not_requested on a repeat that asks for no SMS", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const k = nextKey();
    await recordPayment(store, fake, actorOf(a), pay(m.id, { idempotencyKey: k }));
    const second = await recordPayment(
      store,
      fake,
      actorOf(a),
      pay(m.id, { idempotencyKey: k, sendSms: false }),
    );
    expect(second).toMatchObject({ ok: true, replayed: true, sms: { status: "not_requested" } });
  });

  it("treats the same key with another sendSms as a repeat: no SMS is sent", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const k = nextKey();
    await recordPayment(store, fake, actorOf(a), pay(m.id, { idempotencyKey: k, sendSms: false }));
    const second = await recordPayment(
      store,
      fake,
      actorOf(a),
      pay(m.id, { idempotencyKey: k, sendSms: true }),
    );
    expect(second).toMatchObject({ ok: true, replayed: true, sms: { status: "skipped_repeat" } });
    expect(fake.sent).toEqual([]);
  });

  it.each([
    { label: "a string", value: "yes" },
    { label: "a number", value: 1 },
    { label: "null", value: null },
  ])("refuses sendSms that is $label, and saves and sends nothing", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(a), pay(m.id, { sendSms: value }));
    expect(r).toEqual({ ok: false, reason: "invalid_input", code: "invalid_send_sms" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
    expect(fake.sent).toEqual([]);
  });

  it("checks the permission before sendSms", async () => {
    const { store, noPay, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(noPay), pay(m.id, { sendSms: "x" }));
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(fake.sent).toEqual([]);
  });

  it.each([
    { label: "lines that do not add up", which: "mine", over: { total: "19999" } },
    { label: "an unknown member", which: "unknown", over: {} },
    { label: "another user's member", which: "theirs", over: {} },
    { label: "an Inactive member", which: "inactive", over: {} },
  ])("sends no SMS for $label", async ({ which, over }) => {
    const { store, a, b, addMember } = await build();
    const mine = await addMember(a.id, "A One");
    const theirs = await addMember(b.id, "B One");
    const inactive = await addMember(a.id, "A Two");
    await store.members.setStatus(inactive.id, "INACTIVE");
    const ids: Record<string, string> = {
      mine: mine.id,
      unknown: "no-such-id",
      theirs: theirs.id,
      inactive: inactive.id,
    };
    const fake = new FakeSmsProvider();
    const r = await recordPayment(store, fake, actorOf(a), pay(ids[which], over));
    expect(r.ok).toBe(false);
    expect(fake.sent).toEqual([]);
  });

  it.each([
    { label: "an unknown member", which: "unknown", over: {}, reason: "not_found" },
    { label: "an Inactive member", which: "inactive", over: {}, reason: "member_inactive" },
    {
      label: "an Inactive member with sendSms false",
      which: "inactive",
      over: { sendSms: false },
      reason: "member_inactive",
    },
  ])("returns the payment failure exactly, with no sms key, for $label", async (c) => {
    const { store, a, addMember } = await build();
    const inactive = await addMember(a.id, "A Two");
    await store.members.setStatus(inactive.id, "INACTIVE");
    const id = c.which === "inactive" ? inactive.id : "no-such-id";
    const r = await recordPayment(store, new FakeSmsProvider(), actorOf(a), pay(id, c.over));
    expect(r).toEqual({ ok: false, reason: c.reason });
  });

  it("sends no SMS when the payment is not saved (audit write fails)", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const failing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({ ...tx, audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) } }),
        ),
    };
    const fake = new FakeSmsProvider();
    await expect(recordPayment(failing, fake, actorOf(a), pay(m.id))).rejects.toThrow("audit down");
    expect(fake.sent).toEqual([]);
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });
});

describe("POST /payments: sms", () => {
  async function buildApp(withProvider = true) {
    const { store, a, addMember } = await build();
    const fake = new FakeSmsProvider();
    const app = createApp({
      store,
      tokenSecret: SECRET,
      now: () => T0,
      ...(withProvider ? { sms: fake } : {}),
    });
    const bearer = `Bearer ${createAccessToken(SECRET, a.id, T0)}`;
    return { store, a, addMember, fake, app, bearer };
  }
  const body = (memberId: string, over: Record<string, unknown> = {}) => ({
    memberId,
    method: "CASH",
    total: "20000",
    lines: LINES,
    ...over,
  });

  it("answers 201 with payment and sms, and sends the message", async () => {
    const { app, bearer, a, addMember, fake } = await buildApp();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer)
      .set("Idempotency-Key", nextKey())
      .send(body(m.id));
    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object).sort()).toEqual(["payment", "sms"]);
    expect(res.body.sms).toEqual({ status: "sent" });
    expect(fake.sent).toEqual([{ to: PHONE, body: TEXT }]);
  });

  it("sends nothing when sendSms is false", async () => {
    const { app, bearer, a, addMember, fake } = await buildApp();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer)
      .set("Idempotency-Key", nextKey())
      .send(body(m.id, { sendSms: false }));
    expect(res.status).toBe(201);
    expect(res.body.sms).toEqual({ status: "not_requested" });
    expect(fake.sent).toEqual([]);
  });

  it("answers 201 and reports the failure when the provider fails", async () => {
    const { app, bearer, a, addMember, fake, store } = await buildApp();
    const m = await addMember(a.id, "A One");
    fake.failNext("provider_error");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer)
      .set("Idempotency-Key", nextKey())
      .send(body(m.id));
    expect(res.status).toBe(201);
    expect(res.body.sms).toEqual({ status: "failed", reason: "provider_error" });
    expect(await store.payments.listByMember(m.id)).toHaveLength(1);
  });

  it("answers 400 invalid_send_sms and saves nothing", async () => {
    const { app, bearer, a, addMember, fake, store } = await buildApp();
    const m = await addMember(a.id, "A One");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer)
      .set("Idempotency-Key", nextKey())
      .send(body(m.id, { sendSms: "yes" }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input", code: "invalid_send_sms" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
    expect(fake.sent).toEqual([]);
  });

  it("sends one SMS for a repeat and reports skipped_repeat", async () => {
    const { app, bearer, a, addMember, fake } = await buildApp();
    const m = await addMember(a.id, "A One");
    const k = nextKey();
    const send = () =>
      request(app)
        .post("/payments")
        .set("Authorization", bearer)
        .set("Idempotency-Key", k)
        .send(body(m.id));
    const first = await send();
    const second = await send();
    expect(first.body.sms).toEqual({ status: "sent" });
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.sms).toEqual({ status: "skipped_repeat" });
    expect(second.body.payment).toEqual(first.body.payment);
    expect(fake.sent).toHaveLength(1);
  });

  it("works without an sms setting: the default provider reports a missing phone", async () => {
    const { app, bearer, a, addMember } = await buildApp(false);
    const m = await addMember(a.id, "A One", "");
    const res = await request(app)
      .post("/payments")
      .set("Authorization", bearer)
      .set("Idempotency-Key", nextKey())
      .send(body(m.id));
    expect(res.status).toBe(201);
    expect(res.body.sms).toEqual({ status: "failed", reason: "invalid_number" });
  });
});