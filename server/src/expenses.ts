// Expense logic (step 5.7, idempotency key in 5.7c, list in 5.8b; D-54, DR-11, DR-13, DR-15,
// A-148, A-150, A-173). Rules over the Store: no HTTP here.
// Recording an expense by hand needs expenses.create. Only the categories a person may pick are
// accepted (parseManualExpenseCategory): Loan and Membership Withdrawal are set by the system.
// The key lookup, the expense and its audit entry run inside one store transaction, so both are
// saved or neither (D-45). Audit details hold the category and the amount in kobo: no description,
// no narration, no key.

import { createHash } from "node:crypto";
import { CategoryError } from "./categories.js";
import { isExpenseCategory, parseManualExpenseCategory, type ExpenseCategory } from "./expense-categories.js";
import { MoneyError, parseNaira, sumKobo, type Kobo } from "./money.js";
import { IDEMPOTENCY_KEY_PATTERN, koboToNairaString } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import { DuplicateExpenseKeyError, type ExpenseRecord, type PaymentMethod, type Store } from "./store.js";

/** Longest description or narration accepted (A-169: my choice, same as A-82 and A-161). */
export const EXPENSE_TEXT_MAX = 200;

/** The one category that needs a narration (DR-11). */
export const OTHERS_EXPENSE_CATEGORY = "Others";

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface ExpenseActor {
  id: string;
  subject: PermissionSubject;
}

/** An expense as it may leave this module. */
export interface ExpenseView {
  id: string;
  category: string;
  /** Naira as text, always 2 decimals, for example "15000.00". */
  amount: string;
  method: PaymentMethod;
  description: string;
  narration: string;
  createdById: string;
  createdAt: string;
}

export type ExpenseFailure = "forbidden" | "invalid_input" | "idempotency_conflict";

export interface ExpenseFailureResult {
  ok: false;
  reason: ExpenseFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

/** replayed is true when the key had been used before and the first expense is returned. */
export type ExpenseResult = { ok: true; value: ExpenseView; replayed: boolean } | ExpenseFailureResult;

function failure(reason: ExpenseFailure, code?: string): ExpenseFailureResult {
  return { ok: false, reason, ...(code !== undefined ? { code } : {}) };
}

function parseMethod(value: unknown): PaymentMethod | null {
  return value === "CASH" || value === "BANK_TRANSFER" ? value : null;
}

type Text = { ok: true; value: string } | { ok: false };

/** Optional text: missing or null gives "". Anything else must be text of at most 200 characters after trimming. */
function optionalText(value: unknown): Text {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > EXPENSE_TEXT_MAX) return { ok: false };
  return { ok: true, value: trimmed };
}

/** A fingerprint of the checked request: category, method, exact kobo, trimmed texts. */
function hashRequest(
  category: string,
  method: PaymentMethod,
  amount: Kobo,
  description: string,
  narration: string,
): string {
  const canonical = JSON.stringify({ category, method, amount: amount.toString(), description, narration });
  return createHash("sha256").update(canonical).digest("hex");
}

function toView(e: ExpenseRecord): ExpenseView {
  return {
    id: e.id,
    category: e.category,
    amount: koboToNairaString(e.amount),
    method: e.method,
    description: e.description,
    narration: e.narration,
    createdById: e.createdById,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Raw values as they arrive from a request. Anything may be wrong; this code checks it. */
export interface NewExpenseInput {
  idempotencyKey?: unknown;
  category?: unknown;
  amount?: unknown;
  method?: unknown;
  description?: unknown;
  narration?: unknown;
}

/**
 * Records an expense picked by hand and one audit entry "expense.created".
 * Order: permission, idempotency key shape, category (unknown_category, system_only), method,
 * amount (a naira string above ₦0), description, narration. "Others" needs a narration; every
 * other category must leave it empty (A-169). Then one transaction looks the key up (a repeat
 * returns the first expense, a different request with the same key is refused), saves the expense
 * with its key and writes the audit entry. If either write fails, nothing is saved (D-45). A
 * refused request does not use up the key (as D-48). The expense is not linked to a loan (DR-10, A-148).
 */
export async function createExpense(
  store: Store,
  actor: ExpenseActor,
  input: NewExpenseInput,
): Promise<ExpenseResult> {
  if (!hasPermission(actor.subject, "expenses.create")) return failure("forbidden");

  const key = input.idempotencyKey;
  if (key === undefined) return failure("invalid_input", "missing_idempotency_key");
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return failure("invalid_input", "invalid_idempotency_key");
  }

  let category: ExpenseCategory;
  try {
    category = parseManualExpenseCategory(input.category);
  } catch (e) {
    if (e instanceof CategoryError) {
      return failure("invalid_input", e.code === "system_only" ? "system_only" : "unknown_category");
    }
    throw e;
  }

  const method = parseMethod(input.method);
  if (method === null) return failure("invalid_input", "invalid_method");

  let amount: Kobo;
  try {
    amount = parseNaira(input.amount);
  } catch (e) {
    if (e instanceof MoneyError) return failure("invalid_input", "invalid_amount");
    throw e;
  }
  if (amount <= 0n) return failure("invalid_input", "amount_not_positive");

  const description = optionalText(input.description);
  if (!description.ok) return failure("invalid_input", "invalid_description");
  const narration = optionalText(input.narration);
  if (!narration.ok) return failure("invalid_input", "invalid_narration");
  if (category === OTHERS_EXPENSE_CATEGORY) {
    if (narration.value.length === 0) return failure("invalid_input", "missing_narration");
  } else if (narration.value.length > 0) {
    return failure("invalid_input", "narration_not_allowed");
  }

  const requestHash = hashRequest(category, method, amount, description.value, narration.value);

  const attempt = (): Promise<ExpenseResult> =>
    store.transaction<ExpenseResult>(async (tx) => {
      const existing = await tx.expenses.findByKey(actor.id, key);
      if (existing !== null) {
        if (existing.requestHash !== requestHash) return failure("idempotency_conflict");
        return { ok: true, value: toView(existing), replayed: true };
      }
      const saved = await tx.expenses.create({
        category,
        amount,
        method,
        description: description.value,
        narration: narration.value,
        idempotencyKey: key,
        requestHash,
        createdById: actor.id,
      });
      await tx.audit.append({
        actorId: actor.id,
        action: "expense.created",
        entityType: "Expense",
        entityId: saved.id,
        detail: `category=${category} amount_kobo=${amount.toString()}`,
      });
      return { ok: true, value: toView(saved), replayed: false };
    });

  try {
    return await attempt();
  } catch (e) {
    // Another request with the same key was saved between our lookup and our save. Our
    // transaction was undone, so one more attempt finds the first expense (as A-121).
    if (e instanceof DuplicateExpenseKeyError) return attempt();
    throw e;
  }
}

/** Longest createdById filter accepted (as USER_FILTER_MAX in members.ts). */
const USER_FILTER_MAX = 100;

/** A UTC time such as "2026-10-01T00:00:00Z" or "2026-10-01T00:00:00.000Z" (A-173). */
const UTC_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

type TimeFilter = { ok: true; value: Date | undefined } | { ok: false };

/** Missing gives no filter. Otherwise a real UTC time: "2026-02-30T00:00:00Z" is refused. */
function parseTime(raw: unknown): TimeFilter {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string" || !UTC_TIME_PATTERN.test(raw)) return { ok: false };
  const date = new Date(raw);
  const canonical = raw.length === 20 ? `${raw.slice(0, 19)}.000Z` : raw;
  if (Number.isNaN(date.getTime()) || date.toISOString() !== canonical) return { ok: false };
  return { ok: true, value: date };
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface ExpenseListInput {
  createdById?: unknown;
  category?: unknown;
  method?: unknown;
  from?: unknown;
  before?: unknown;
}

export interface ExpenseList {
  expenses: ExpenseView[];
  /** The sum of the listed amounts, naira as text with 2 decimals ("totals reconcile"). */
  total: string;
}

export type ExpenseListResult = { ok: true; value: ExpenseList } | ExpenseFailureResult;

/**
 * Expenses oldest first, with their total (step 5.8b). Read only: no audit entry (as A-134).
 * Order: permission, createdById, category (any of DR-11, Loan too), method, from, before, range.
 * The time range is half-open on createdAt: from is included, before is not (D-66, A-172).
 * Staff: always only the expenses they recorded; a createdById filter is checked but ignored
 * (DR-13, as listMembers). Super Admin: all expenses, or the ones recorded by createdById.
 * Soft-deleted expenses are never listed, so the total leaves them out (DR-12, step 5.9).
 */
export async function listExpenses(
  store: Store,
  actor: ExpenseActor,
  input: ExpenseListInput,
): Promise<ExpenseListResult> {
  if (!hasPermission(actor.subject, "expenses.view")) return failure("forbidden");

  const userFilter = input.createdById;
  if (
    userFilter !== undefined &&
    (typeof userFilter !== "string" || userFilter.length === 0 || userFilter.length > USER_FILTER_MAX)
  ) {
    return failure("invalid_input", "invalid_created_by_id");
  }
  const category = input.category;
  if (category !== undefined && !isExpenseCategory(category)) {
    return failure("invalid_input", "invalid_category");
  }
  const method = input.method === undefined ? undefined : parseMethod(input.method);
  if (method === null) return failure("invalid_input", "invalid_method");
  const from = parseTime(input.from);
  if (!from.ok) return failure("invalid_input", "invalid_from");
  const before = parseTime(input.before);
  if (!before.ok) return failure("invalid_input", "invalid_before");
  if (from.value !== undefined && before.value !== undefined && from.value.getTime() > before.value.getTime()) {
    return failure("invalid_input", "invalid_range");
  }

  const createdById = actor.subject.role === "SUPER_ADMIN" ? userFilter : actor.id;
  const rows = await store.expenses.list({
    ...(createdById !== undefined ? { createdById } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(method !== undefined ? { method } : {}),
    ...(from.value !== undefined ? { createdFrom: from.value } : {}),
    ...(before.value !== undefined ? { createdBefore: before.value } : {}),
  });
  return {
    ok: true,
    value: { expenses: rows.map(toView), total: koboToNairaString(sumKobo(rows.map((e) => e.amount))) },
  };
}
