// Expense categories (DR-11, A-97, A-148). Pure logic: no database, no network.
// One table holds each category name and whether only the system may set it.
// "Loan" is set by giving a loan (DR-10); "Membership Withdrawal" by pay-off (DR-05).
// Kept apart from the payment categories in categories.ts on purpose (D-42, A-97).

import { CategoryError } from "./categories.js";

interface ExpenseCategoryDef {
  readonly name: string;
  readonly systemOnly: boolean;
}

// Order is the order of DR-11. A test pins this list. Do not reorder.
export const EXPENSE_CATEGORY_TABLE = [
  { name: "Loan", systemOnly: true },
  { name: "Expenses", systemOnly: false },
  { name: "Allowances", systemOnly: false },
  { name: "Members Credit", systemOnly: false },
  { name: "Membership Withdrawal", systemOnly: true },
  { name: "Asset Purchase", systemOnly: false },
  { name: "Office Maintenance", systemOnly: false },
  { name: "Payment to Union", systemOnly: false },
  { name: "Payment to Apexes", systemOnly: false },
  { name: "Others", systemOnly: false },
] as const satisfies readonly ExpenseCategoryDef[];

export type ExpenseCategory = (typeof EXPENSE_CATEGORY_TABLE)[number]["name"];

const BY_NAME: ReadonlyMap<string, ExpenseCategoryDef> = new Map<string, ExpenseCategoryDef>(
  EXPENSE_CATEGORY_TABLE.map((c): [string, ExpenseCategoryDef] => [c.name, c]),
);

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = Object.freeze(
  EXPENSE_CATEGORY_TABLE.map((c) => c.name),
);

/** Categories a person may pick when recording an expense by hand. */
export const MANUAL_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = Object.freeze(
  EXPENSE_CATEGORY_TABLE.filter((c) => !c.systemOnly).map((c) => c.name),
);

/** Categories only the system sets (loan disbursement and pay-off). */
export const SYSTEM_ONLY_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = Object.freeze(
  EXPENSE_CATEGORY_TABLE.filter((c) => c.systemOnly).map((c) => c.name),
);

/** True only for the exact name of an expense category (letter case and spaces matter). */
export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && BY_NAME.has(value);
}

/** Is this category set only by the system? Anything not in the table answers false. */
export function isSystemOnlyExpenseCategory(category: ExpenseCategory): boolean {
  return BY_NAME.get(category)?.systemOnly === true;
}

/**
 * Checks a category picked by hand for an expense. Returns it, or throws CategoryError:
 * "system_only" for Loan and Membership Withdrawal, "unknown" for anything not in the table.
 * The message never repeats the input.
 */
export function parseManualExpenseCategory(value: unknown): ExpenseCategory {
  if (!isExpenseCategory(value)) {
    throw new CategoryError("unknown", "Unknown expense category.");
  }
  if (isSystemOnlyExpenseCategory(value)) {
    throw new CategoryError("system_only", "This category is set by the system and cannot be chosen.");
  }
  return value;
}
