// Member balances (DR-03, DR-05, D-17). Pure logic: no database, no network.
// Worked out on read from the member's payment lines; nothing is stored.
// Pay-offs are not counted yet: how a pay-off is stored is decided at step 6.3 (A-180).

import { PAYMENT_CATEGORY_TABLE, isPaymentCategory, type PaymentCategory } from "./categories.js";
import type { Kobo } from "./money.js";
import type { PaymentRecord } from "./store.js";

export interface CategoryBalance {
  readonly category: PaymentCategory;
  /** Whole kobo: the sum of the member's lines in this category. */
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
  constructor() {
    super("A payment line has a category that is not a payment category.");
    this.name = "BalanceError";
  }
}

/**
 * Balances of one member from their payments. Throws BalanceError if a line's category is not a
 * payment category (saved lines are checked by createPayment, so this means broken data). Amounts
 * are added as saved; the logic that saves them keeps them above ₦0.
 */
export function memberBalances(payments: readonly Pick<PaymentRecord, "lines">[]): MemberBalances {
  const totals = new Map<PaymentCategory, Kobo>();
  for (const payment of payments) {
    for (const line of payment.lines) {
      if (!isPaymentCategory(line.category)) throw new BalanceError();
      totals.set(line.category, (totals.get(line.category) ?? 0n) + line.amount);
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
