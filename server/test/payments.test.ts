import { describe, expect, it } from "vitest";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import {
  createPayment,
  koboToNairaString,
  type PaymentActor,
  type PaymentResult,
  type PaymentView,
} from "../src/payments.js";
import type { Role, Store, UserRecord } from "../src/store.js";

// Fictional data only (D-08).
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
    store.members.create({
      fullName,
      phone: "08000000001",
      address: "1 Test Street",
      occupation: "Trader",
      createdById,
    });
  return { store, admin, a, b, noPay, addMember };
}

const actorOf = (u: UserRecord): PaymentActor => ({ id: u.id, subject: subjectOf(u) });

// The DR-02 example: 20,000 = 5,000 + 10,000 + 5,000.
let keyCounter = 0;
const nextKey = () => `logic-test-key-${String(++keyCounter).padStart(8, "0")}`;
const pay = (memberId: unknown, over: Record<string, unknown> = {}) => ({
  idempotencyKey: nextKey(),
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

function must(r: PaymentResult): PaymentView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

describe("createPayment: success", () => {
  it("records a payment for Staff on their own member, with exact amounts and the actor", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(a), pay(m.id)));
    expect(r).toMatchObject({
      memberId: m.id,
      membershipId: "IO-001",
      method: "CASH",
      total: "20000.00",
      createdById: a.id,
    });
    expect(r.lines).toEqual([
      { category: "Shares", amount: "5000.00" },
      { category: "Savings", amount: "10000.00" },
      { category: "Special Savings", amount: "5000.00" },
    ]);
    expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);
    const saved = await store.payments.listByMember(m.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.total).toBe(2_000_000n);
    expect(saved[0]?.lines.map((l) => l.amount)).toEqual([500_000n, 1_000_000n, 500_000n]);
  });

  it("keeps the largest allowed amount exact", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(
      await createPayment(
        store,
        actorOf(a),
        pay(m.id, {
          total: "999999999999.99",
          lines: [{ category: "Shares", amount: "999999999999.99" }],
        }),
      ),
    );
    expect(r.total).toBe("999999999999.99");
    const saved = await store.payments.listByMember(m.id);
    expect(saved[0]?.total).toBe(99_999_999_999_999n);
  });

  it("accepts a bank transfer and the same category on two lines", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(
      await createPayment(
        store,
        actorOf(a),
        pay(m.id, {
          method: "BANK_TRANSFER",
          total: "3000.50",
          lines: [
            { category: "Savings", amount: "1000.25" },
            { category: "Savings", amount: "2000.25" },
          ],
        }),
      ),
    );
    expect(r.method).toBe("BANK_TRANSFER");
    expect(r.lines.map((l) => l.amount)).toEqual(["1000.25", "2000.25"]);
  });

  it("lets the Super Admin pay into any member", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(admin), pay(m.id)));
    expect(r.createdById).toBe(admin.id);
  });

  it("saves two payments with different ids", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const one = must(await createPayment(store, actorOf(a), pay(m.id)));
    const two = must(await createPayment(store, actorOf(a), pay(m.id)));
    expect(one.id).not.toBe(two.id);
    expect(await store.payments.listByMember(m.id)).toHaveLength(2);
  });
});

describe("createPayment: refusals", () => {
  it("refuses Staff without payments.create, and saves nothing", async () => {
    const { store, noPay, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = await createPayment(store, actorOf(noPay), pay(m.id));
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("checks the permission before the input", async () => {
    const { store, noPay } = await build();
    const r = await createPayment(store, actorOf(noPay), pay(undefined, { method: "x" }));
    expect(r).toEqual({ ok: false, reason: "forbidden" });
  });

  it("answers not_found for an unknown member", async () => {
    const { store, a } = await build();
    expect(await createPayment(store, actorOf(a), pay("no-such-id"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("answers not_found when Staff pay into another user's member, and saves nothing", async () => {
    const { store, a, b, addMember } = await build();
    const m = await addMember(b.id, "B One");
    expect(await createPayment(store, actorOf(a), pay(m.id))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("answers member_inactive for an Inactive member, and saves nothing", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.members.setStatus(m.id, "INACTIVE");
    expect(await createPayment(store, actorOf(a), pay(m.id))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "a number", value: 5 },
  ])("refuses a member id that is $label", async ({ value }) => {
    const { store, a } = await build();
    expect(await createPayment(store, actorOf(a), pay(value))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_member_id",
    });
  });

  it.each([
    { label: "lower case", value: "cash" },
    { label: "unknown", value: "CARD" },
    { label: "missing", value: undefined },
    { label: "a number", value: 5 },
  ])("refuses a method that is $label", async ({ value }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect(await createPayment(store, actorOf(a), pay(m.id, { method: value }))).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_method",
    });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it.each([
    { label: "lines that do not add up", over: { total: "19999" }, expected: { code: "mismatch" } },
    {
      label: "Membership Withdrawal on a line",
      over: {
        lines: [
          { category: "Shares", amount: "5000" },
          { category: "Membership Withdrawal", amount: "15000" },
        ],
      },
      expected: { code: "system_only", lineIndex: 1 },
    },
    { label: "no lines", over: { lines: [] }, expected: { code: "no_lines" } },
    { label: "a missing total", over: { total: undefined }, expected: { code: "invalid_total" } },
    { label: "a zero total", over: { total: "0" }, expected: { code: "total_not_positive" } },
    {
      label: "an amount sent as a number",
      over: { lines: [{ category: "Shares", amount: 20000 }] },
      expected: { code: "invalid_amount", lineIndex: 0 },
    },
  ])("refuses $label, with the code and no payment saved", async ({ over, expected }) => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = await createPayment(store, actorOf(a), pay(m.id, over));
    expect(r).toEqual({ ok: false, reason: "invalid_input", ...expected });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });

  it("accepts exactly 20 lines", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const lines = Array.from({ length: 20 }, () => ({ category: "Shares", amount: "1" }));
    const r = must(await createPayment(store, actorOf(a), pay(m.id, { total: "20", lines })));
    expect(r.lines).toHaveLength(20);
  });

  it("refuses 21 lines", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const lines = Array.from({ length: 21 }, () => ({ category: "Shares", amount: "1" }));
    const r = await createPayment(store, actorOf(a), pay(m.id, { total: "21", lines }));
    expect(r).toEqual({ ok: false, reason: "invalid_input", code: "too_many_lines" });
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });
});

describe("createPayment: audit and transaction", () => {
  it("writes one payment.created entry with the actor, ids and totals only", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(a), pay(m.id)));
    const entries = await store.audit.listByActor(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "payment.created",
      entityType: "Payment",
      entityId: r.id,
      detail: "membership_id=IO-001 total_kobo=2000000 lines=3",
    });
    const text = JSON.stringify(entries);
    expect(text).not.toContain("A One");
    expect(text).not.toContain("08000000001");
  });

  it("logs the caller, not the member's recorder, when the Super Admin pays into a Staff member", async () => {
    const { store, admin, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const r = must(await createPayment(store, actorOf(admin), pay(m.id)));
    const adminEntries = await store.audit.listByActor(admin.id);
    expect(adminEntries).toHaveLength(1);
    expect(adminEntries[0]).toMatchObject({ action: "payment.created", entityId: r.id });
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("writes no audit entry when the payment is refused", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await createPayment(store, actorOf(a), pay(m.id, { total: "19999" }));
    await createPayment(store, actorOf(a), pay("no-such-id"));
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("saves no payment when the audit write fails", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const failing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            audit: { ...tx.audit, append: () => Promise.reject(new Error("audit down")) },
          }),
        ),
    };
    await expect(createPayment(failing, actorOf(a), pay(m.id))).rejects.toThrow("audit down");
    expect(await store.payments.listByMember(m.id)).toEqual([]);
  });
});

describe("koboToNairaString", () => {
  it.each([
    { kobo: 0n, text: "0.00" },
    { kobo: 5n, text: "0.05" },
    { kobo: 100n, text: "1.00" },
    { kobo: 2_000_050n, text: "20000.50" },
    { kobo: 99_999_999_999_999n, text: "999999999999.99" },
  ])("shows $kobo kobo as $text", ({ kobo, text }) => {
    expect(koboToNairaString(kobo)).toBe(text);
  });

  it("refuses a negative amount", () => {
    expect(() => koboToNairaString(-1n)).toThrow(RangeError);
  });
});