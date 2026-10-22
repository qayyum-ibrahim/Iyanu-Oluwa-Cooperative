import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberBalances } from "../src/balances.js";
import { subjectOf } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import {
  processPayOff,
  type PayOffActor,
  type PayOffResult,
  type PayOffView,
} from "../src/payoffs.js";
import { createPrismaStore } from "../src/prisma-store.js";
import type { Role, Store, UserRecord } from "../src/store.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// Fictional data only (D-08). Amounts are made up.
async function build(store: Store = createMemoryStore()) {
  const make = (name: string, role: Role, permissions: string[]) =>
    store.users.create({
      email: `${name}-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role,
      permissions,
    });
  const admin = await make("admin", "SUPER_ADMIN", []);
  const a = await make("staff-a", "STAFF", ["payoff.process"]);
  const b = await make("staff-b", "STAFF", ["payoff.process"]);
  const noRight = await make("no-right", "STAFF", ["members.edit", "loans.disburse", "expenses.create"]);
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({
      fullName,
      phone: "08000000001",
      address: "1 Test Street",
      occupation: "Trader",
      createdById,
    });
  /** A payment saved straight through the store. Amounts in naira, whole numbers. */
  const pay = (memberId: string, createdById: string, lines: [string, number][], loanId?: string) => {
    const kobo = lines.map(([category, naira]) => ({
      category,
      amount: BigInt(naira) * 100n,
      ...(loanId !== undefined && category === "Loan Repaid" ? { loanId } : {}),
    }));
    return store.payments.create({
      memberId,
      method: "CASH",
      total: kobo.reduce((s, l) => s + l.amount, 0n),
      lines: kobo,
      createdById,
    });
  };
  /** The DR-05 worked example: payout ₦25,000; ₦3,000 non-refundable stays. */
  const payExample = (memberId: string, createdById: string) =>
    pay(memberId, createdById, [
      ["Shares", 12000],
      ["Savings", 8000],
      ["Special Savings", 5000],
      ["Development Levy", 1000],
      ["Entrance Fee", 2000],
    ]);
  return { store, admin, a, b, noRight, addMember, pay, payExample };
}

const actorOf = (u: UserRecord): PayOffActor => ({ id: u.id, subject: subjectOf(u) });

let keyCount = 0;
/** A new idempotency key on every call, so separate calls are separate requests. */
const newKey = () => `payoff-test-key-${String(++keyCount).padStart(6, "0")}`;

const payOffBody = (memberId: unknown, total: unknown = "25000.00", over: Record<string, unknown> = {}) => ({
  idempotencyKey: newKey(),
  memberId,
  method: "BANK_TRANSFER",
  total,
  ...over,
});

function must(r: PayOffResult): PayOffView {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

/** Nothing of a pay-off was saved for this member: no pay-off, no expense, still Active, no audit. */
async function expectNothingSaved(store: Store, memberId: string, actorId: string) {
  expect(await store.payOffs.listByMember(memberId)).toEqual([]);
  expect((await store.expenses.list({})).filter((e) => e.payOffId !== null)).toEqual([]);
  expect((await store.members.findById(memberId))?.status).toBe("ACTIVE");
  expect((await store.audit.listByActor(actorId)).filter((e) => e.action === "payoff.processed")).toEqual([]);
}

describe("processPayOff: success (DR-05)", () => {
  it("pays the DR-05 worked example: ₦25,000 out, ₦3,000 kept, member Inactive", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const r = await processPayOff(store, actorOf(a), payOffBody(m.id));
    expect(r).toMatchObject({ ok: true, replayed: false });
    const v = must(r);
    expect(v).toEqual({
      id: v.id,
      memberId: m.id,
      membershipId: m.membershipId,
      method: "BANK_TRANSFER",
      total: "25000.00",
      lines: [
        { category: "Shares", amount: "12000.00" },
        { category: "Savings", amount: "8000.00" },
        { category: "Special Savings", amount: "5000.00" },
      ],
      expenseId: v.expenseId,
      createdById: a.id,
      createdAt: v.createdAt,
    });
    expect(Number.isNaN(Date.parse(v.createdAt))).toBe(false);

    const saved = await store.payOffs.findById(v.id);
    expect(saved).toMatchObject({ memberId: m.id, method: "BANK_TRANSFER", total: 2_500_000n, createdById: a.id });
    expect(saved?.lines.map((l) => [l.category, l.amount])).toEqual([
      ["Shares", 1_200_000n],
      ["Savings", 800_000n],
      ["Special Savings", 500_000n],
    ]);
    expect(await store.expenses.findById(v.expenseId)).toMatchObject({
      category: "Membership Withdrawal",
      amount: 2_500_000n,
      method: "BANK_TRANSFER",
      payOffId: v.id,
      loanId: null,
      idempotencyKey: null,
      createdById: a.id,
      deletedAt: null,
    });
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");

    const after = memberBalances(await store.payments.listByMember(m.id), await store.payOffs.listByMember(m.id));
    expect(after.refundableTotal).toBe(0n);
    expect(after.nonRefundableTotal).toBe(300_000n);
  });

  it("writes one payoff.processed entry with ids and amounts only", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const v = must(await processPayOff(store, actorOf(a), payOffBody(m.id)));
    const entries = await store.audit.listByActor(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: a.id,
      action: "payoff.processed",
      entityType: "PayOff",
      entityId: v.id,
      detail: `membership_id=${m.membershipId} total_kobo=2500000 expense_id=${v.expenseId} member_status=INACTIVE`,
    });
    expect(entries[0]?.detail).not.toContain("A One");
    expect(entries[0]?.detail).not.toContain("08000000001");
  });

  it("pays every refundable category above ₦0 in DR-04 order, whatever order they were paid in", async () => {
    const { store, a, addMember, pay } = await build();
    const m = await addMember(a.id, "A One");
    await pay(m.id, a.id, [
      ["Building Funds", 500],
      ["Special Deposit", 400],
      ["Savings", 200],
    ]);
    await pay(m.id, a.id, [["Shares", 100], ["Savings", 50]]);
    const v = must(await processPayOff(store, actorOf(a), payOffBody(m.id, "1250", { method: "CASH" })));
    expect(v.total).toBe("1250.00");
    expect(v.method).toBe("CASH");
    expect(v.lines).toEqual([
      { category: "Shares", amount: "100.00" },
      { category: "Savings", amount: "250.00" },
      { category: "Special Deposit", amount: "400.00" },
      { category: "Building Funds", amount: "500.00" },
    ]);
    expect((await store.expenses.findById(v.expenseId))?.method).toBe("CASH");
  });

  it("keeps kobo exact", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.payments.create({
      memberId: m.id,
      method: "CASH",
      total: 1n,
      lines: [{ category: "Shares", amount: 1n }],
      createdById: a.id,
    });
    const v = must(await processPayOff(store, actorOf(a), payOffBody(m.id, "0.01")));
    expect(v.total).toBe("0.01");
    expect((await store.payOffs.findById(v.id))?.total).toBe(1n);
  });

  it("lets the Super Admin pay out a Staff member's member, and logs the caller", async () => {
    const { store, admin, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const v = must(await processPayOff(store, actorOf(admin), payOffBody(m.id)));
    expect(v.createdById).toBe(admin.id);
    expect((await store.expenses.findById(v.expenseId))?.createdById).toBe(admin.id);
    expect((await store.audit.listByActor(admin.id)).map((e) => e.action)).toEqual(["payoff.processed"]);
  });

  it("pays out once a loan is fully repaid, and never pays out Loan Repaid lines", async () => {
    const { store, a, addMember, pay, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const loan = await store.loans.create({ memberId: m.id, principal: 1_000_000n, createdById: a.id });
    await pay(m.id, a.id, [["Loan Repaid", 10000]], loan.id);
    const v = must(await processPayOff(store, actorOf(a), payOffBody(m.id)));
    expect(v.total).toBe("25000.00");
  });

  it("pays only new money after the member is reactivated and pays again (DR-16)", async () => {
    const { store, a, addMember, pay, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    must(await processPayOff(store, actorOf(a), payOffBody(m.id)));
    await store.members.setStatus(m.id, "ACTIVE");
    await pay(m.id, a.id, [["Savings", 700], ["Development Levy", 100]]);
    const second = must(await processPayOff(store, actorOf(a), payOffBody(m.id, "700")));
    expect(second.lines).toEqual([{ category: "Savings", amount: "700.00" }]);
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(2);
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
  });
});

describe("processPayOff: refusals", () => {
  it("refuses Staff without payoff.process, and saves nothing", async () => {
    const { store, noRight, addMember, payExample } = await build();
    const m = await addMember(noRight.id, "N One");
    await payExample(m.id, noRight.id);
    expect(await processPayOff(store, actorOf(noRight), payOffBody(m.id))).toEqual({ ok: false, reason: "forbidden" });
    await expectNothingSaved(store, m.id, noRight.id);
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, admin, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const inactive = { id: admin.id, subject: { ...subjectOf(admin), isActive: false } };
    expect(await processPayOff(store, inactive, payOffBody(m.id))).toEqual({ ok: false, reason: "forbidden" });
    await expectNothingSaved(store, m.id, admin.id);
  });

  it("checks the permission before the key and the input", async () => {
    const { store, noRight } = await build();
    expect(await processPayOff(store, actorOf(noRight), {})).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses a missing or bad key, before the other input", async () => {
    const { store, a } = await build();
    const bad = (over: Record<string, unknown>) => processPayOff(store, actorOf(a), { ...payOffBody(5, 5), ...over });
    expect(await bad({ idempotencyKey: undefined })).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "missing_idempotency_key",
    });
    for (const k of [null, 123, "", "a".repeat(15), "a".repeat(65), "has space in the key!", "key.with.dots.12345"]) {
      expect(await bad({ idempotencyKey: k })).toEqual({
        ok: false,
        reason: "invalid_input",
        code: "invalid_idempotency_key",
      });
    }
  });

  it("refuses a bad member id, method or total", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const code = async (body: Record<string, unknown>) => {
      const r = await processPayOff(store, actorOf(a), body);
      return r.ok ? "ok" : `${r.reason}:${r.code ?? ""}`;
    };
    for (const id of [undefined, null, 5, ""]) {
      expect(await code(payOffBody(id))).toBe("invalid_input:invalid_member_id");
    }
    for (const method of [undefined, "cash", "CHEQUE", 1]) {
      expect(await code(payOffBody(m.id, "25000", { method }))).toBe("invalid_input:invalid_method");
    }
    for (const total of [undefined, null, 25000, "-1", "25,000", "25000.001", " 25000", "₦25000"]) {
      expect(await code({ ...payOffBody(m.id), total })).toBe("invalid_input:invalid_total");
    }
    await expectNothingSaved(store, m.id, a.id);
  });

  it("answers not_found for an unknown member and for another Staff member's member", async () => {
    const { store, a, b, addMember, payExample } = await build();
    const m = await addMember(b.id, "B One");
    await payExample(m.id, b.id);
    expect(await processPayOff(store, actorOf(a), payOffBody("no-such-member"))).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await processPayOff(store, actorOf(a), payOffBody(m.id))).toEqual({ ok: false, reason: "not_found" });
    await expectNothingSaved(store, m.id, a.id);
  });

  it("answers member_inactive for an Inactive member, and saves nothing", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    await store.members.setStatus(m.id, "INACTIVE");
    expect(await processPayOff(store, actorOf(a), payOffBody(m.id))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
    expect(await store.payOffs.listByMember(m.id)).toEqual([]);
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("answers active_loan while 1 kobo of a loan is outstanding (DR-06), for the Super Admin too", async () => {
    const { store, admin, a, addMember, pay, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const loan = await store.loans.create({ memberId: m.id, principal: 1_000_001n, createdById: a.id });
    await pay(m.id, a.id, [["Loan Repaid", 10000]], loan.id);
    for (const u of [a, admin]) {
      expect(await processPayOff(store, actorOf(u), payOffBody(m.id))).toEqual({ ok: false, reason: "active_loan" });
    }
    await expectNothingSaved(store, m.id, a.id);
  });

  it("does not count another member's active loan", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    const other = await addMember(a.id, "A Two");
    await payExample(m.id, a.id);
    await store.loans.create({ memberId: other.id, principal: 1_000_000n, createdById: a.id });
    must(await processPayOff(store, actorOf(a), payOffBody(m.id)));
  });

  it("answers nothing_to_pay_off with no payments or only non-refundable ones, and keeps the member Active", async () => {
    const { store, a, addMember, pay } = await build();
    const fresh = await addMember(a.id, "A One");
    expect(await processPayOff(store, actorOf(a), payOffBody(fresh.id, "0"))).toEqual({
      ok: false,
      reason: "nothing_to_pay_off",
    });
    const levyOnly = await addMember(a.id, "A Two");
    await pay(levyOnly.id, a.id, [["Development Levy", 1000], ["Entrance Fee", 2000]]);
    expect(await processPayOff(store, actorOf(a), payOffBody(levyOnly.id, "0"))).toEqual({
      ok: false,
      reason: "nothing_to_pay_off",
    });
    await expectNothingSaved(store, fresh.id, a.id);
    await expectNothingSaved(store, levyOnly.id, a.id);
  });

  it("answers payout_changed when the total is not the payout, by 1 kobo either way (A-185)", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    for (const total of ["24999.99", "25000.01", "0", "28000"]) {
      expect(await processPayOff(store, actorOf(a), payOffBody(m.id, total))).toEqual({
        ok: false,
        reason: "payout_changed",
      });
    }
    await expectNothingSaved(store, m.id, a.id);
  });

  it("answers payout_changed when a payment arrived after the caller confirmed", async () => {
    const { store, a, addMember, pay, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    await pay(m.id, a.id, [["Savings", 1]]);
    expect(await processPayOff(store, actorOf(a), payOffBody(m.id))).toEqual({ ok: false, reason: "payout_changed" });
    must(await processPayOff(store, actorOf(a), payOffBody(m.id, "25001")));
  });
});

function failingInside(store: Store, part: "payOffs" | "expenses" | "members" | "audit"): Store {
  const down = () => Promise.reject(new Error(`${part} down`));
  return {
    ...store,
    transaction: (fn) =>
      store.transaction((tx) => {
        switch (part) {
          case "payOffs":
            return fn({ ...tx, payOffs: { ...tx.payOffs, create: down } });
          case "expenses":
            return fn({ ...tx, expenses: { ...tx.expenses, create: down } });
          case "members":
            return fn({ ...tx, members: { ...tx.members, setStatus: down } });
          case "audit":
            return fn({ ...tx, audit: { ...tx.audit, append: down } });
        }
      }),
  };
}

describe("processPayOff: one transaction (D-45)", () => {
  for (const part of ["payOffs", "expenses", "members", "audit"] as const) {
    it(`saves nothing when the ${part} write fails`, async () => {
      const { store, a, addMember, payExample } = await build();
      const m = await addMember(a.id, "A One");
      await payExample(m.id, a.id);
      await expect(processPayOff(failingInside(store, part), actorOf(a), payOffBody(m.id))).rejects.toThrow(
        `${part} down`,
      );
      await expectNothingSaved(store, m.id, a.id);
    });
  }

  it("fails loudly, and saves nothing, when the member cannot be set Inactive", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const lost: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) => fn({ ...tx, members: { ...tx.members, setStatus: async () => false } })),
    };
    await expect(processPayOff(lost, actorOf(a), payOffBody(m.id))).rejects.toThrow("member of a pay-off");
    await expectNothingSaved(store, m.id, a.id);
  });
});

describe("processPayOff: idempotency key (as D-48)", () => {
  it("a repeat returns the first pay-off: one pay-off, one expense, one audit entry", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    const first = must(await processPayOff(store, actorOf(a), body));
    const again = await processPayOff(store, actorOf(a), body);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again)).toEqual(first);
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect((await store.expenses.list({})).filter((e) => e.payOffId !== null)).toHaveLength(1);
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  it("saves the key and the request hash on the pay-off", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    const v = must(await processPayOff(store, actorOf(a), body));
    const saved = await store.payOffs.findById(v.id);
    expect(saved?.idempotencyKey).toBe(body.idempotencyKey);
    expect(saved?.requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("treats the same total written differently as the same request", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id, "25000");
    const first = must(await processPayOff(store, actorOf(a), body));
    const again = await processPayOff(store, actorOf(a), { ...body, total: "25000.00" });
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again).id).toBe(first.id);
  });

  it("refuses the same key with another method, total or member", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    const other = await addMember(a.id, "A Two");
    await payExample(m.id, a.id);
    await payExample(other.id, a.id);
    const body = payOffBody(m.id);
    must(await processPayOff(store, actorOf(a), body));
    for (const over of [{ method: "CASH" }, { total: "25000.01" }, { memberId: other.id }]) {
      expect(await processPayOff(store, actorOf(a), { ...body, ...over })).toEqual({
        ok: false,
        reason: "idempotency_conflict",
      });
    }
    expect(await store.payOffs.listByMember(other.id)).toEqual([]);
    expect((await store.members.findById(other.id))?.status).toBe("ACTIVE");
  });

  it("keeps keys apart per user", async () => {
    const { store, a, b, addMember, payExample } = await build();
    const ma = await addMember(a.id, "A One");
    const mb = await addMember(b.id, "B One");
    await payExample(ma.id, a.id);
    await payExample(mb.id, b.id);
    const key = newKey();
    const ra = must(await processPayOff(store, actorOf(a), { ...payOffBody(ma.id), idempotencyKey: key }));
    const rb = await processPayOff(store, actorOf(b), { ...payOffBody(mb.id), idempotencyKey: key });
    expect(rb).toMatchObject({ ok: true, replayed: false });
    expect(must(rb).id).not.toBe(ra.id);
  });

  it("a repeat returns its own pay-off's expense when the same user made other pay-offs", async () => {
    const { store, a, addMember, payExample } = await build();
    const m1 = await addMember(a.id, "A One");
    const m2 = await addMember(a.id, "A Two");
    await payExample(m1.id, a.id);
    await payExample(m2.id, a.id);
    const body = payOffBody(m2.id);
    must(await processPayOff(store, actorOf(a), payOffBody(m1.id)));
    const first = must(await processPayOff(store, actorOf(a), body));
    expect(must(await processPayOff(store, actorOf(a), body)).expenseId).toBe(first.expenseId);
  });

  it("does not use up the key when the request is refused", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const loan = await store.loans.create({ memberId: m.id, principal: 100n, createdById: a.id });
    const body = payOffBody(m.id);
    expect(await processPayOff(store, actorOf(a), body)).toEqual({ ok: false, reason: "active_loan" });
    await store.payments.create({
      memberId: m.id,
      method: "CASH",
      total: 100n,
      lines: [{ category: "Loan Repaid", amount: 100n, loanId: loan.id }],
      createdById: a.id,
    });
    expect(await processPayOff(store, actorOf(a), body)).toMatchObject({ ok: true, replayed: false });
  });

  it("does not use up the key when the audit write fails", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    await expect(processPayOff(failingInside(store, "audit"), actorOf(a), body)).rejects.toThrow("audit down");
    expect(await processPayOff(store, actorOf(a), body)).toMatchObject({ ok: true, replayed: false });
  });

  it("refuses a new key after the pay-off, as the member is now Inactive", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    must(await processPayOff(store, actorOf(a), payOffBody(m.id)));
    expect(await processPayOff(store, actorOf(a), payOffBody(m.id))).toEqual({
      ok: false,
      reason: "member_inactive",
    });
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
  });

  it("handles a lost race: the key is saved between the lookup and the save", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    const first = must(await processPayOff(store, actorOf(a), body));
    let lookups = 0;
    // The first lookup misses and the member looks Active with nothing paid out, so the save is
    // reached and clashes on the key.
    const racing: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) =>
          fn({
            ...tx,
            payOffs: {
              ...tx.payOffs,
              findByKey: async (userId, k) => {
                lookups += 1;
                return lookups === 1 ? null : tx.payOffs.findByKey(userId, k);
              },
              listByMember: async (id) => (lookups === 1 ? [] : tx.payOffs.listByMember(id)),
            },
            members: {
              ...tx.members,
              findById: async (id) => {
                const found = await tx.members.findById(id);
                return found === null || lookups !== 1 ? found : { ...found, status: "ACTIVE" };
              },
            },
          }),
        ),
    };
    const r = await processPayOff(racing, actorOf(a), body);
    expect(r).toMatchObject({ ok: true, replayed: true });
    expect(must(r).id).toBe(first.id);
    expect(lookups).toBe(2);
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect((await store.expenses.list({})).filter((e) => e.payOffId !== null)).toHaveLength(1);
  });

  it("saves one pay-off when two identical requests arrive together", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    const [r1, r2] = await Promise.all([
      processPayOff(store, actorOf(a), body),
      processPayOff(store, actorOf(a), body),
    ]);
    expect(must(r1).id).toBe(must(r2).id);
    expect([r1, r2].filter((r) => r.ok && r.replayed)).toHaveLength(1);
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
  });

  it("fails loudly when a saved pay-off has lost its member or its expense", async () => {
    const { store, a, addMember, payExample } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    must(await processPayOff(store, actorOf(a), body));
    const wrap = (over: (tx: Store) => Partial<Store>): Store => ({
      ...store,
      transaction: (fn) => store.transaction((tx) => fn({ ...tx, ...over(tx) })),
    });
    const noMember = wrap((tx) => ({ members: { ...tx.members, findById: async () => null } }));
    const noExpense = wrap((tx) => ({ expenses: { ...tx.expenses, list: async () => [] } }));
    await expect(processPayOff(noMember, actorOf(a), body)).rejects.toThrow("member of a saved pay-off");
    await expect(processPayOff(noExpense, actorOf(a), body)).rejects.toThrow("expense of a saved pay-off");
  });
});

describe("processPayOff on the Prisma store (real SQLite)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("saves the pay-off, its expense, the Inactive status and the audit entry", async () => {
    const { a, addMember, payExample } = await build(store);
    const m = await addMember(a.id, "P One");
    await payExample(m.id, a.id);
    const v = must(await processPayOff(store, actorOf(a), payOffBody(m.id)));
    expect((await store.payOffs.findById(v.id))?.lines.map((l) => [l.category, l.amount])).toEqual([
      ["Shares", 1_200_000n],
      ["Savings", 800_000n],
      ["Special Savings", 500_000n],
    ]);
    expect(await store.expenses.findById(v.expenseId)).toMatchObject({
      category: "Membership Withdrawal",
      amount: 2_500_000n,
      payOffId: v.id,
    });
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["payoff.processed"]);
  });

  it("saves nothing when the audit write fails", async () => {
    const { a, addMember, payExample } = await build(store);
    const m = await addMember(a.id, "P Two");
    await payExample(m.id, a.id);
    await expect(processPayOff(failingInside(store, "audit"), actorOf(a), payOffBody(m.id))).rejects.toThrow(
      "audit down",
    );
    expect(await store.payOffs.listByMember(m.id)).toEqual([]);
    expect(await store.expenses.list({ createdById: a.id })).toEqual([]);
    expect((await store.members.findById(m.id))?.status).toBe("ACTIVE");
  });

  it("pays out once when five requests with different keys run at once", async () => {
    const { a, addMember, payExample } = await build(store);
    const m = await addMember(a.id, "P Three");
    await payExample(m.id, a.id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => processPayOff(store, actorOf(a), payOffBody(m.id))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.reason))).toEqual(
      Array(4).fill("member_inactive"),
    );
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({ createdById: a.id })).toHaveLength(1);
  });

  it("gives one pay-off and the same answer to five requests with one key at once", async () => {
    const { a, addMember, payExample } = await build(store);
    const m = await addMember(a.id, "P Four");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => processPayOff(store, actorOf(a), body)));
    const ids = results.map((r) => must(r).id);
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((r) => r.ok && !r.replayed)).toHaveLength(1);
    expect(await store.payOffs.listByMember(m.id)).toHaveLength(1);
    expect(await store.expenses.list({ createdById: a.id })).toHaveLength(1);
    expect((await store.audit.listByActor(a.id)).filter((e) => e.entityId === ids[0])).toHaveLength(1);
  });

  it("returns a repeat with the same view, read back from the database", async () => {
    const { a, addMember, payExample } = await build(store);
    const m = await addMember(a.id, "P Five");
    await payExample(m.id, a.id);
    const body = payOffBody(m.id);
    const first = must(await processPayOff(store, actorOf(a), body));
    const again = await processPayOff(store, actorOf(a), body);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(must(again)).toEqual(first);
  });
});
