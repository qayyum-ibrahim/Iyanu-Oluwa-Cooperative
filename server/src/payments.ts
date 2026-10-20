// Payment logic (step 4.4, idempotency key added in 4.5, list in 4.8; D-43 to D-47, DR-02,
// DR-13, DR-15).
// Rules over the Store: no HTTP here.
// The breakdown is checked first. The key lookup, the member check, the payment and the audit
// entry then run inside one store transaction, so all of them are saved or none (D-45).
// Audit details hold the Membership ID, the total in kobo and the line count: no name, no phone,
// no key.

import { createHash } from "node:crypto";
import { BreakdownError, checkBreakdown } from "./breakdown.js";
import type { Kobo } from "./money.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import {
  DuplicateIdempotencyKeyError,
  type PaymentMethod,
  type PaymentRecord,
  type Store,
} from "./store.js";

/** Most lines one payment may have (A-100: my choice). There are 14 categories. */
export const MAX_PAYMENT_LINES = 20;

/** A key is 16 to 64 characters from these (A-119: my choice). A UUID fits. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface PaymentActor {
  id: string;
  subject: PermissionSubject;
}

export interface PaymentLineView {
  category: string;
  /** Naira as text, always 2 decimals, for example "5000.00". */
  amount: string;
}

/** A payment as it may leave this module. */
export interface PaymentView {
  id: string;
  memberId: string;
  membershipId: string;
  method: PaymentMethod;
  total: string;
  lines: PaymentLineView[];
  createdById: string;
  createdAt: string;
}

export type PaymentFailure =
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "member_inactive"
  | "idempotency_conflict";

export interface PaymentFailureResult {
  ok: false;
  reason: PaymentFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
  /** For invalid_input from a bad line: the position of the line (first is 0). */
  lineIndex?: number;
}

/** replayed is true when the key had been used before and the first payment is returned. */
export type PaymentResult =
  | { ok: true; value: PaymentView; replayed: boolean }
  | PaymentFailureResult;

function failure(reason: PaymentFailure, code?: string, lineIndex?: number): PaymentFailureResult {
  return {
    ok: false,
    reason,
    ...(code !== undefined ? { code } : {}),
    ...(lineIndex !== undefined ? { lineIndex } : {}),
  };
}

/** 2000050n gives "20000.50". Not for negative values. */
export function koboToNairaString(kobo: Kobo): string {
  if (kobo < 0n) throw new RangeError("Amount must not be negative.");
  return `${(kobo / 100n).toString()}.${(kobo % 100n).toString().padStart(2, "0")}`;
}

function toView(p: PaymentRecord, membershipId: string): PaymentView {
  return {
    id: p.id,
    memberId: p.memberId,
    membershipId,
    method: p.method,
    total: koboToNairaString(p.total),
    lines: p.lines.map((l) => ({ category: l.category, amount: koboToNairaString(l.amount) })),
    createdById: p.createdById,
    createdAt: p.createdAt.toISOString(),
  };
}

function parseMethod(value: unknown): PaymentMethod | null {
  return value === "CASH" || value === "BANK_TRANSFER" ? value : null;
}

/** A fingerprint of the checked request: member, method, exact kobo, lines in order. */
function hashRequest(
  memberId: string,
  method: PaymentMethod,
  checked: ReturnType<typeof checkBreakdown>,
): string {
  const canonical = JSON.stringify({
    memberId,
    method,
    total: checked.total.toString(),
    lines: checked.lines.map((l) => [l.category, l.amount.toString()]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Raw values as they arrive from a request. Anything may be wrong; this code checks it. */
export interface NewPaymentInput {
  idempotencyKey?: unknown;
  memberId?: unknown;
  method?: unknown;
  total?: unknown;
  lines?: unknown;
}

/**
 * Records a payment for a member and writes one audit entry "payment.created".
 * Order: permission, idempotency key shape, member id and method, line count, breakdown (DR-02),
 * then one transaction: look the key up (a repeat returns the first payment, a different request
 * with the same key is refused), find the member, check who may see it, check it is Active,
 * save the payment with its key, write the audit entry.
 * Staff may pay only into members they recorded (OQ-09); other members answer not_found.
 * If any write fails, nothing is saved (D-45). A refused request does not use up the key.
 */
export async function createPayment(
  store: Store,
  actor: PaymentActor,
  input: NewPaymentInput,
): Promise<PaymentResult> {
  if (!hasPermission(actor.subject, "payments.create")) return failure("forbidden");

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
  if (Array.isArray(input.lines) && input.lines.length > MAX_PAYMENT_LINES) {
    return failure("invalid_input", "too_many_lines");
  }

  let checked;
  try {
    checked = checkBreakdown({ total: input.total, lines: input.lines });
  } catch (e) {
    if (e instanceof BreakdownError) return failure("invalid_input", e.code, e.lineIndex);
    throw e;
  }
  const requestHash = hashRequest(memberId, method, checked);

  const attempt = (): Promise<PaymentResult> =>
    store.transaction<PaymentResult>(async (tx) => {
      const existing = await tx.payments.findByKey(actor.id, key);
      if (existing !== null) {
        if (existing.requestHash !== requestHash) return failure("idempotency_conflict");
        const original = await tx.members.findById(existing.memberId);
        if (original === null) throw new Error("The member of a saved payment is missing");
        return { ok: true, value: toView(existing, original.membershipId), replayed: true };
      }

      const member = await tx.members.findById(memberId);
      if (member === null) return failure("not_found");
      if (actor.subject.role !== "SUPER_ADMIN" && member.createdById !== actor.id) {
        return failure("not_found");
      }
      if (member.status !== "ACTIVE") return failure("member_inactive");

      const payment = await tx.payments.create({
        memberId: member.id,
        method,
        total: checked.total,
        lines: checked.lines.map((l) => ({ category: l.category, amount: l.amount })),
        createdById: actor.id,
        idempotencyKey: key,
        requestHash,
      });
      await tx.audit.append({
        actorId: actor.id,
        action: "payment.created",
        entityType: "Payment",
        entityId: payment.id,
        detail: `membership_id=${member.membershipId} total_kobo=${checked.total.toString()} lines=${checked.lines.length}`,
      });
      return { ok: true, value: toView(payment, member.membershipId), replayed: false };
    });

  try {
    return await attempt();
  } catch (e) {
    // Another request with the same key was saved between our lookup and our save. Our
    // transaction was undone, so one more attempt finds the first payment.
    if (e instanceof DuplicateIdempotencyKeyError) return attempt();
    throw e;
  }
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface PaymentListInput {
  memberId?: unknown;
}

export type PaymentListResult = { ok: true; value: PaymentView[] } | PaymentFailureResult;

/**
 * The payments of one member, oldest first (step 4.8). Read only: nothing is written, not even
 * an audit entry (A-134).
 * Order: permission, member id, find the member, check who may see it.
 * Staff see the payments of members they recorded, whoever recorded the payment (A-133). An
 * unknown member and a member Staff may not see both answer not_found (A-86).
 * An Inactive member's payments are listed too.
 */
export async function listPayments(
  store: Store,
  actor: PaymentActor,
  input: PaymentListInput,
): Promise<PaymentListResult> {
  if (!hasPermission(actor.subject, "payments.view")) return failure("forbidden");

  const memberId = input.memberId;
  if (memberId === undefined) return failure("invalid_input", "missing_member_id");
  if (typeof memberId !== "string" || memberId.length === 0) {
    return failure("invalid_input", "invalid_member_id");
  }

  const member = await store.members.findById(memberId);
  if (member === null) return failure("not_found");
  if (actor.subject.role !== "SUPER_ADMIN" && member.createdById !== actor.id) {
    return failure("not_found");
  }
  const rows = await store.payments.listByMember(member.id);
  return { ok: true, value: rows.map((p) => toView(p, member.membershipId)) };
}