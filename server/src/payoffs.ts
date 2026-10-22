// Pay-off logic (step 6.4; D-73, D-74, D-75, DR-05, DR-06, DR-07, DR-13, DR-14, DR-15). Rules over
// the Store: no HTTP here.
// A pay-off needs payoff.process (DR-14). The key lookup, the member checks, the active-loan check,
// the payout, the pay-off, its Membership Withdrawal expense, the member's automatic Inactive and
// the audit entry run inside one store transaction, so all of them are saved or none (D-45).
// Audit details hold the Membership ID, the total in kobo, the expense id and the new status: no
// name, no phone, no key.

import { createHash } from "node:crypto";
import { memberBalances } from "./balances.js";
import { SYSTEM_ONLY_CATEGORY } from "./categories.js";
import { isLoanActive } from "./loans.js";
import { MoneyError, parseNaira, type Kobo } from "./money.js";
import { IDEMPOTENCY_KEY_PATTERN, koboToNairaString } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import { DuplicatePayOffKeyError, type PaymentMethod, type PayOffRecord, type Store } from "./store.js";

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface PayOffActor {
  id: string;
  subject: PermissionSubject;
}

/** A pay-off as it may leave this module. Amounts are naira as text, always 2 decimals. */
export interface PayOffView {
  id: string;
  memberId: string;
  membershipId: string;
  method: PaymentMethod;
  total: string;
  /** One line per refundable category paid out, in DR-04 order. */
  lines: { category: string; amount: string }[];
  /** The Membership Withdrawal expense saved with the pay-off (DR-05). */
  expenseId: string;
  createdById: string;
  createdAt: string;
}

export type PayOffFailure =
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "member_inactive"
  | "active_loan"
  | "nothing_to_pay_off"
  | "payout_changed"
  | "idempotency_conflict";

export interface PayOffFailureResult {
  ok: false;
  reason: PayOffFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

/** replayed is true when the key had been used before and the first pay-off is returned. */
export type PayOffResult = { ok: true; value: PayOffView; replayed: boolean } | PayOffFailureResult;

function failure(reason: PayOffFailure, code?: string): PayOffFailureResult {
  return { ok: false, reason, ...(code !== undefined ? { code } : {}) };
}

function parseMethod(value: unknown): PaymentMethod | null {
  return value === "CASH" || value === "BANK_TRANSFER" ? value : null;
}

/** A fingerprint of the checked request: member, method, exact kobo payout. */
function hashRequest(memberId: string, method: PaymentMethod, total: Kobo): string {
  const canonical = JSON.stringify({ memberId, method, total: total.toString() });
  return createHash("sha256").update(canonical).digest("hex");
}

function toView(p: PayOffRecord, membershipId: string, expenseId: string): PayOffView {
  return {
    id: p.id,
    memberId: p.memberId,
    membershipId,
    method: p.method,
    total: koboToNairaString(p.total),
    lines: p.lines.map((l) => ({ category: l.category, amount: koboToNairaString(l.amount) })),
    expenseId,
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Raw values as they arrive from a request. Anything may be wrong; this code checks it. */
export interface NewPayOffInput {
  idempotencyKey?: unknown;
  memberId?: unknown;
  method?: unknown;
  /** The payout the caller confirmed (a naira string). It must equal the payout worked out now. */
  total?: unknown;
}

/**
 * Pays a member out (DR-05): saves the pay-off with one line per refundable category above ₦0,
 * its Membership Withdrawal expense, sets the member Inactive (DR-07) and writes one audit entry
 * "payoff.processed".
 * Order: permission, idempotency key shape, member id, method, total (a naira string), then one
 * transaction: look the key up (a repeat returns the first pay-off, a different request with the
 * same key is refused), find the member, check who may see it, check it is Active, check it has
 * no active loan (DR-06), work out the balances, refuse a ₦0 payout, refuse a total that is not
 * the payout (the balances changed after the caller confirmed, A-185), save the pay-off with its
 * key, save the expense, set the member Inactive, write the audit entry. Staff may pay out only
 * members they recorded (DR-13); other members answer not_found. If any write fails, nothing is
 * saved (D-45). A refused request does not use up the key (as D-48).
 */
export async function processPayOff(
  store: Store,
  actor: PayOffActor,
  input: NewPayOffInput,
): Promise<PayOffResult> {
  if (!hasPermission(actor.subject, "payoff.process")) return failure("forbidden");

  const key = input.idempotencyKey;
  if (key === undefined) return failure("invalid_input", "missing_idempotency_key");
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return failure("invalid_input", "invalid_idempotency_key");
  }

  const memberId = input.memberId;
  if (typeof memberId !== "string" || memberId.length === 0) {
    return failure("invalid_input", "invalid_member_id");
  }
  const method = parseMethod(input.method);
  if (method === null) return failure("invalid_input", "invalid_method");

  let total: Kobo;
  try {
    total = parseNaira(input.total);
  } catch (e) {
    if (e instanceof MoneyError) return failure("invalid_input", "invalid_total");
    throw e;
  }
  const requestHash = hashRequest(memberId, method, total);

  const attempt = (): Promise<PayOffResult> =>
    store.transaction<PayOffResult>(async (tx) => {
      const existing = await tx.payOffs.findByKey(actor.id, key);
      if (existing !== null) {
        if (existing.requestHash !== requestHash) return failure("idempotency_conflict");
        // A repeat returns what was saved, even though the member is now Inactive.
        const original = await tx.members.findById(existing.memberId);
        if (original === null) throw new Error("The member of a saved pay-off is missing");
        const expense = (await tx.expenses.list({ createdById: existing.createdById })).find(
          (e) => e.payOffId === existing.id,
        );
        if (expense === undefined) throw new Error("The expense of a saved pay-off is missing");
        return { ok: true, value: toView(existing, original.membershipId, expense.id), replayed: true };
      }

      const member = await tx.members.findById(memberId);
      if (member === null) return failure("not_found");
      if (actor.subject.role !== "SUPER_ADMIN" && member.createdById !== actor.id) {
        return failure("not_found");
      }
      if (member.status !== "ACTIVE") return failure("member_inactive");

      const payments = await tx.payments.listByMember(member.id);
      const loans = await tx.loans.listByMember(member.id);
      if (loans.some((l) => isLoanActive(l, payments))) return failure("active_loan");

      const balances = memberBalances(payments, await tx.payOffs.listByMember(member.id));
      if (balances.refundableTotal === 0n) return failure("nothing_to_pay_off");
      if (total !== balances.refundableTotal) return failure("payout_changed");
      const lines = balances.categories
        .filter((c) => c.refundable && c.balance > 0n)
        .map((c) => ({ category: c.category, amount: c.balance }));

      const payOff = await tx.payOffs.create({
        memberId: member.id,
        method,
        total,
        lines,
        idempotencyKey: key,
        requestHash,
        createdById: actor.id,
      });
      const expense = await tx.expenses.create({
        category: SYSTEM_ONLY_CATEGORY,
        amount: total,
        method,
        payOffId: payOff.id,
        createdById: actor.id,
      });
      // DR-07 holds here: the member has payment history (the payout is above ₦0), every
      // refundable balance is now ₦0, and there is no active loan (checked above).
      if (!(await tx.members.setStatus(member.id, "INACTIVE"))) {
        throw new Error("The member of a pay-off is missing");
      }
      await tx.audit.append({
        actorId: actor.id,
        action: "payoff.processed",
        entityType: "PayOff",
        entityId: payOff.id,
        detail: `membership_id=${member.membershipId} total_kobo=${total.toString()} expense_id=${expense.id} member_status=INACTIVE`,
      });
      return { ok: true, value: toView(payOff, member.membershipId, expense.id), replayed: false };
    });

  try {
    return await attempt();
  } catch (e) {
    // Another request with the same key was saved between our lookup and our save. Our
    // transaction was undone, so one more attempt finds the first pay-off (as A-121).
    if (e instanceof DuplicatePayOffKeyError) return attempt();
    throw e;
  }
}
