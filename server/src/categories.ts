// Payment categories (DR-03, DR-04, D-12). Pure logic: no database, no network.
// One table holds each category name and whether it is refundable at pay-off.
// "Membership Withdrawal" is not in this table on purpose: the system sets it (DR-04).

interface CategoryDef {
  readonly name: string;
  readonly refundable: boolean;
}

// Order is the order of DR-04. A test pins this list. Do not reorder.
export const PAYMENT_CATEGORY_TABLE = [
  { name: "Shares", refundable: true },
  { name: "Savings", refundable: true },
  { name: "Special Savings", refundable: true },
  { name: "Development Levy", refundable: false },
  { name: "Loan Repaid", refundable: false },
  { name: "Loan Interest", refundable: false },
  { name: "Entrance Fee", refundable: false },
  { name: "Stationeries", refundable: false },
  { name: "Empowerment Repaid", refundable: false },
  { name: "Committee Gift", refundable: false },
  { name: "Special Deposit", refundable: true },
  { name: "Investment Repaid", refundable: false },
  { name: "Investment Income", refundable: false },
  { name: "Building Funds", refundable: true },
] as const satisfies readonly CategoryDef[];

export type PaymentCategory = (typeof PAYMENT_CATEGORY_TABLE)[number]["name"];

/** Used by the system for pay-off outflows. It can never be chosen in a payment. */
export const SYSTEM_ONLY_CATEGORY = "Membership Withdrawal";

const BY_NAME: ReadonlyMap<string, CategoryDef> = new Map<string, CategoryDef>(
  PAYMENT_CATEGORY_TABLE.map((c): [string, CategoryDef] => [c.name, c]),
);

export const PAYMENT_CATEGORIES: readonly PaymentCategory[] = Object.freeze(
  PAYMENT_CATEGORY_TABLE.map((c) => c.name),
);

export const REFUNDABLE_CATEGORIES: readonly PaymentCategory[] = Object.freeze(
  PAYMENT_CATEGORY_TABLE.filter((c) => c.refundable).map((c) => c.name),
);

/** True only for the exact name of a payment category (letter case and spaces matter). */
export function isPaymentCategory(value: unknown): value is PaymentCategory {
  return typeof value === "string" && BY_NAME.has(value);
}

/** Is this category paid out at pay-off (DR-03)? Anything not in the table answers false. */
export function isRefundable(category: PaymentCategory): boolean {
  return BY_NAME.get(category)?.refundable === true;
}

export type CategoryErrorCode = "unknown" | "system_only";

export class CategoryError extends Error {
  readonly code: CategoryErrorCode;
  constructor(code: CategoryErrorCode, message: string) {
    super(message);
    this.name = "CategoryError";
    this.code = code;
  }
}

/**
 * Checks a category chosen for a payment line. Returns it, or throws CategoryError:
 * "system_only" for Membership Withdrawal, "unknown" for anything else not in the table.
 * The message never repeats the input.
 */
export function parsePaymentCategory(value: unknown): PaymentCategory {
  if (value === SYSTEM_ONLY_CATEGORY) {
    throw new CategoryError("system_only", "This category is set by the system and cannot be chosen.");
  }
  if (!isPaymentCategory(value)) {
    throw new CategoryError("unknown", "Unknown payment category.");
  }
  return value;
}
