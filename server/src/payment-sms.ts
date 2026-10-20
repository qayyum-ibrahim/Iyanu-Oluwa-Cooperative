// Records a payment, then sends the SMS (step 4.7; D-07, D-48, D-49, OQ-05).
// The payment is saved first, inside createPayment. An SMS problem never undoes it: it is
// reported in the result. A repeat of a saved request (replay) sends nothing.
// The message holds the total and the Membership ID only: no name (A-05).

import {
  createPayment,
  type NewPaymentInput,
  type PaymentActor,
  type PaymentFailureResult,
  type PaymentView,
} from "./payments.js";
import { hasPermission } from "./permissions.js";
import type { SmsFailure, SmsProvider } from "./sms.js";
import type { Store } from "./store.js";

export type SmsOutcome =
  | { status: "not_requested" }
  | { status: "skipped_repeat" }
  | { status: "sent" }
  | { status: "failed"; reason: SmsFailure };

export type PaymentWithSmsResult =
  | { ok: true; value: PaymentView; replayed: boolean; sms: SmsOutcome }
  | PaymentFailureResult;

/** Placeholder text until the owner decides the wording (OQ-05). */
export function paymentSmsText(p: Pick<PaymentView, "membershipId" | "total">): string {
  return `IYANU-OLUWA Cooperative: we received NGN ${p.total} for member ${p.membershipId}. Thank you.`;
}

async function trySend(store: Store, sms: SmsProvider, p: PaymentView): Promise<SmsOutcome> {
  try {
    const member = await store.members.findById(p.memberId);
    if (member === null) return { status: "failed", reason: "provider_error" };
    if (member.phone.trim().length === 0) return { status: "failed", reason: "invalid_number" };
    const result = await sms.send({ to: member.phone, body: paymentSmsText(p) });
    return result.ok ? { status: "sent" } : { status: "failed", reason: result.reason };
  } catch {
    // A real adapter may throw (A-124). The payment is already saved.
    return { status: "failed", reason: "provider_error" };
  }
}

/**
 * createPayment plus the SMS. Order: permission, sendSms check (true, false or missing; missing
 * means true), then createPayment. The SMS is tried only for a new payment, after it is saved.
 */
export async function recordPayment(
  store: Store,
  sms: SmsProvider,
  actor: PaymentActor,
  input: NewPaymentInput & { sendSms?: unknown },
): Promise<PaymentWithSmsResult> {
  if (!hasPermission(actor.subject, "payments.create")) return { ok: false, reason: "forbidden" };

  const flag = input.sendSms;
  if (flag !== undefined && typeof flag !== "boolean") {
    return { ok: false, reason: "invalid_input", code: "invalid_send_sms" };
  }

  const result = await createPayment(store, actor, input);
  if (!result.ok) return result;
  if (flag === false) return { ...result, sms: { status: "not_requested" } };
  if (result.replayed) return { ...result, sms: { status: "skipped_repeat" } };
  return { ...result, sms: await trySend(store, sms, result.value) };
}