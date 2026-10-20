// Payment logic (step 4.4; D-43, D-44, D-45, DR-02, DR-13, DR-15). Rules over the Store: no HTTP here.
// The breakdown is checked first. The member check, the payment and the audit entry
// then run inside one store transaction, so all three are saved or none (D-45).
// Audit details hold the Membership ID, the total in kobo and the line count: no name, no phone.

import { BreakdownError, checkBreakdown } from "./breakdown.js";
import type { Kobo } from "./money.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { PaymentMethod, PaymentRecord, Store } from "./store.js";

/** Most lines one payment may have (A-100: my choice). There are 14 categories. */
export const MAX_PAYMENT_LINES = 20;

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

export type PaymentFailure = "forbidden" | "invalid_input" | "not_found" | "member_inactive";

export interface PaymentFailureResult {
  ok: false;
  reason: PaymentFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
  /** For invalid_input from a bad line: the position of the line (first is 0). */
  lineIndex?: number;
}

export type PaymentResult = { ok: true; value: PaymentView } | PaymentFailureResult;

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

/** Raw values as they arrive from a request body. Anything may be wrong; this code checks it. */
export interface NewPaymentInput {
  memberId?: unknown;
  method?: unknown;
  total?: unknown;
  lines?: unknown;
}

/**
 * Records a payment for a member and writes one audit entry "payment.created".
 * Order: permission, member id and method, line count, breakdown (DR-02), then one transaction:
 * find the member, check who may see it, check it is Active, save the payment, write the audit entry.
 * Staff may pay only into members they recorded (OQ-09); other members answer not_found.
 * If any write fails, nothing is saved (D-45).
 */
export async function createPayment(
  store: Store,
  actor: PaymentActor,
  input: NewPaymentInput,
): Promise<PaymentResult> {
  if (!hasPermission(actor.subject, "payments.create")) return failure("forbidden");

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

  return store.transaction<PaymentResult>(async (tx) => {
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
    });
    await tx.audit.append({
      actorId: actor.id,
      action: "payment.created",
      entityType: "Payment",
      entityId: payment.id,
      detail: `membership_id=${member.membershipId} total_kobo=${checked.total.toString()} lines=${checked.lines.length}`,
    });
    return { ok: true, value: toView(payment, member.membershipId) };
  });
}
