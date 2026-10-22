// Member balances (DR-03, DR-05, D-17). Pure logic: no database, no network.
// Worked out on read from the member's payment lines less their pay-off lines (D-73); nothing is stored.

import { PAYMENT_CATEGORY_TABLE, isPaymentCategory, type PaymentCategory } from "./categories.js";
import type { Kobo } from "./money.js";
import type { PaymentRecord, PayOffRecord } from "./store.js";

export interface CategoryBalance {
  readonly category: PaymentCategory;
  /** Whole kobo: the member's lines in this category less what pay-offs paid out of it. */
  readonly balance: Kobo;
  readonly refundable: boolean;
}

export interface MemberBalances {
  /** Every payment category, in DR-04 order, ₦0 when the member has no line in it. */
  readonly categories: readonly CategoryBalance[];
  /** Sum of the refundable balances (DR-03). This is what a pay-off pays out (DR-05). */
  readonly refundableTotal: Kobo;
  /** Sum of the other balances. Kept by the cooperative at pay-off (DR-05). */
  readonly nonRefundableTotal: Kobo;
}

export class BalanceError extends Error {
  constructor(message = "A payment line has a category that is not a payment category.") {
    super(message);
    this.name = "BalanceError";
  }
}

/**
 * Balances of one member from their payments less their pay-offs (DR-05: refundable balances are
 * ₦0 after a pay-off). Throws BalanceError if a payment line's category is not a payment category,
 * if a pay-off line's category is not a refundable one, or if a pay-off takes a balance below ₦0
 * (the logic that saves them prevents all three, so this means broken data). Payment amounts are
 * added as saved; the logic that saves them keeps them above ₦0.
 */
export function memberBalances(
  payments: readonly Pick<PaymentRecord, "lines">[],
  payOffs: readonly Pick<PayOffRecord, "lines">[],
): MemberBalances {
  const totals = new Map<PaymentCategory, Kobo>();
  for (const payment of payments) {
    for (const line of payment.lines) {
      if (!isPaymentCategory(line.category)) throw new BalanceError();
      totals.set(line.category, (totals.get(line.category) ?? 0n) + line.amount);
    }
  }
  for (const payOff of payOffs) {
    for (const line of payOff.lines) {
      const known = PAYMENT_CATEGORY_TABLE.find((c) => c.name === line.category);
      if (!known?.refundable) throw new BalanceError("A pay-off line has a category that is not refundable.");
      const left = (totals.get(known.name) ?? 0n) - line.amount;
      if (left < 0n) throw new BalanceError("A pay-off paid out more than the balance.");
      totals.set(known.name, left);
    }
  }
  const categories = PAYMENT_CATEGORY_TABLE.map(
    (c): CategoryBalance => ({ category: c.name, balance: totals.get(c.name) ?? 0n, refundable: c.refundable }),
  );
  let refundableTotal = 0n;
  let nonRefundableTotal = 0n;
  for (const c of categories) {
    if (c.refundable) refundableTotal += c.balance;
    else nonRefundableTotal += c.balance;
  }
  return { categories, refundableTotal, nonRefundableTotal };
}
