// Expense logic (step 5.7, idempotency key in 5.7c, list in 5.8b, delete in 5.9b, edit in 5.9c,
// day spent in U.6b; D-54, D-92, DR-11, DR-12, DR-13, DR-15, A-148, A-150, A-173, A-176, A-177).
// Rules over the Store: no HTTP here.
// Recording an expense by hand needs expenses.create. Only the categories a person may pick are
// accepted (parseManualExpenseCategory): Loan and Membership Withdrawal are set by the system.
// The key lookup, the expense and its audit entry run inside one store transaction, so both are
// saved or neither (D-45). Audit details hold the category, the amount in kobo and the day spent:
// no description, no narration, no key.

import { createHash } from "node:crypto";
import { CategoryError } from "./categories.js";
import { isExpenseCategory, parseManualExpenseCategory, type ExpenseCategory } from "./expense-categories.js";
import { MoneyError, parseNaira, sumKobo, type Kobo } from "./money.js";
import { IDEMPOTENCY_KEY_PATTERN, isCalendarDay, koboToNairaString, lagosDay } from "./payments.js";
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
  /** The day the money left, "YYYY-MM-DD" in Lagos (D-92). */
  spentOn: string;
  description: string;
  narration: string;
  createdById: string;
  createdAt: string;
}

export type ExpenseFailure =
  | "forbidden"
  | "invalid_input"
  | "idempotency_conflict"
  | "not_found"
  | "not_deletable"
  | "not_editable";

export interface ExpenseFailureResult {
  ok: false;
  reason: ExpenseFailure;
  /** For invalid_input, not_deletable and not_editable: which check failed. Never repeats the input. */
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

/**
 * A fingerprint of the checked request: category, method, exact kobo, trimmed texts, and the day
 * spent as sent. A request without a day hashes as before U.6b, so a retry of an expense saved
 * before the day existed still matches, and a retry after midnight too (as loans, A-214 item 3).
 */
function hashRequest(
  category: string,
  method: PaymentMethod,
  amount: Kobo,
  description: string,
  narration: string,
  spentOn: string | undefined,
): string {
  const canonical = JSON.stringify({
    category,
    method,
    amount: amount.toString(),
    description,
    narration,
    ...(spentOn !== undefined ? { spentOn } : {}),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function toView(e: ExpenseRecord): ExpenseView {
  return {
    id: e.id,
    category: e.category,
    amount: koboToNairaString(e.amount),
    method: e.method,
    spentOn: e.spentOn,
    description: e.description,
    narration: e.narration,
    createdById: e.createdById,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Raw expense fields as they arrive from a request. Anything may be wrong; this code checks it. */
export interface ExpenseFieldsInput {
  category?: unknown;
  amount?: unknown;
  method?: unknown;
  /** "YYYY-MM-DD", the day in Lagos. Missing means today for a new expense, the saved day for an edit (D-92). */
  spentOn?: unknown;
  description?: unknown;
  narration?: unknown;
}

export interface NewExpenseInput extends ExpenseFieldsInput {
  idempotencyKey?: unknown;
}

interface CheckedFields {
  category: ExpenseCategory;
  amount: Kobo;
  method: PaymentMethod;
  /** As sent, or undefined when missing. */
  spentOn: string | undefined;
  description: string;
  narration: string;
}

type FieldsCheck = { ok: true; value: CheckedFields } | ExpenseFailureResult;

/**
 * Checks the fields of an expense picked by hand, for a new one and for an edit.
 * Order: category (unknown_category, system_only), method, day spent (a real day, not after today
 * in Lagos; no earliest day; as D-88 and D-91), amount (a naira string above ₦0), description,
 * narration. "Others" needs a narration; every other category must leave it empty (A-169).
 */
function checkFields(input: ExpenseFieldsInput, today: string): FieldsCheck {
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

  const spentOn = input.spentOn;
  if (spentOn !== undefined && !isCalendarDay(spentOn)) return failure("invalid_input", "invalid_spent_on");
  // Both are "YYYY-MM-DD", so text order is day order.
  if (spentOn !== undefined && spentOn > today) return failure("invalid_input", "future_spent_on");

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

  return {
    ok: true,
    value: { category, amount, method, spentOn, description: description.value, narration: narration.value },
  };
}

/**
 * Records an expense picked by hand and one audit entry "expense.created".
 * Order: permission, idempotency key shape, category (unknown_category, system_only), method,
 * day spent (missing means today in Lagos), amount (a naira string above ₦0), description,
 * narration. "Others" needs a narration; every other category must leave it empty (A-169). Then
 * one transaction looks the key up (a repeat returns the first expense, a different request with
 * the same key is refused), saves the expense with its key and writes the audit entry. If either
 * write fails, nothing is saved (D-45). A refused request does not use up the key (as D-48). The
 * expense is not linked to a loan (DR-10, A-148).
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

  const today = lagosDay(new Date());
  const checked = checkFields(input, today);
  if (!checked.ok) return checked;
  const { category, amount, method, description, narration } = checked.value;

  const requestHash = hashRequest(category, method, amount, description, narration, checked.value.spentOn);
  const spentOn = checked.value.spentOn ?? today;

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
        description,
        narration,
        spentOn,
        idempotencyKey: key,
        requestHash,
        createdById: actor.id,
      });
      await tx.audit.append({
        actorId: actor.id,
        action: "expense.created",
        entityType: "Expense",
        entityId: saved.id,
        detail: `category=${category} amount_kobo=${amount.toString()} spent_on=${spentOn}`,
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

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface ExpenseListInput {
  createdById?: unknown;
  category?: unknown;
  method?: unknown;
  /** First day spent to list, "YYYY-MM-DD", included (U.6b2). */
  fromDay?: unknown;
  /** Last day spent to list, "YYYY-MM-DD", included (U.6b2). */
  toDay?: unknown;
}

export interface ExpenseList {
  expenses: ExpenseView[];
  /** The sum of the listed amounts, naira as text with 2 decimals ("totals reconcile"). */
  total: string;
}

export type ExpenseListResult = { ok: true; value: ExpenseList } | ExpenseFailureResult;

/**
 * Expenses by day spent, then time recorded, oldest first, with their total (step 5.8b, days since
 * U.6b2). Read only: no audit entry (as A-134).
 * Order: permission, createdById, category (any of DR-11, Loan too), method, fromDay, toDay, range.
 * The day range is on spentOn and includes both days (D-94); fromDay after toDay is refused.
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
  const fromDay = input.fromDay;
  if (fromDay !== undefined && !isCalendarDay(fromDay)) return failure("invalid_input", "invalid_from_day");
  const toDay = input.toDay;
  if (toDay !== undefined && !isCalendarDay(toDay)) return failure("invalid_input", "invalid_to_day");
  // Both are "YYYY-MM-DD", so text order is day order.
  if (fromDay !== undefined && toDay !== undefined && fromDay > toDay) {
    return failure("invalid_input", "invalid_range");
  }

  const createdById = actor.subject.role === "SUPER_ADMIN" ? userFilter : actor.id;
  const rows = await store.expenses.list({
    ...(createdById !== undefined ? { createdById } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(method !== undefined ? { method } : {}),
    ...(fromDay !== undefined ? { spentFrom: fromDay } : {}),
    ...(toDay !== undefined ? { spentTo: toDay } : {}),
  });
  return {
    ok: true,
    value: { expenses: rows.map(toView), total: koboToNairaString(sumKobo(rows.map((e) => e.amount))) },
  };
}

/** Set only by giving a loan (DR-10) and by pay-off (DR-05). */
const LOAN_EXPENSE_CATEGORY = "Loan";
const PAY_OFF_EXPENSE_CATEGORY = "Membership Withdrawal";

export type ExpenseDeleteResult = { ok: true } | ExpenseFailureResult;

/**
 * Soft-deletes one expense and writes one audit entry "expense.deleted" (step 5.9b, DR-12).
 * Order: permission, then the expense. An unknown id, a deleted expense and, for Staff, an expense
 * someone else recorded all give not_found, so the answer does not reveal that it exists (DR-13,
 * as getMember). A Loan-linked expense gives not_deletable "loan_linked", a pay-off expense
 * (Membership Withdrawal, or any expense that names a pay-off, step 6.4c) not_deletable "pay_off". The lookup, the delete and the audit entry run
 * in one store transaction (D-45). If another request deleted it first, the answer is not_found.
 * Audit details hold the category and the amount in kobo, as expense.created (A-176).
 */
export async function deleteExpense(store: Store, actor: ExpenseActor, id: unknown): Promise<ExpenseDeleteResult> {
  if (!hasPermission(actor.subject, "expenses.delete")) return failure("forbidden");
  if (typeof id !== "string" || id.length === 0) return failure("not_found");

  return store.transaction<ExpenseDeleteResult>(async (tx) => {
    const expense = await tx.expenses.findById(id);
    if (expense === null || expense.deletedAt !== null) return failure("not_found");
    if (actor.subject.role !== "SUPER_ADMIN" && expense.createdById !== actor.id) return failure("not_found");
    if (expense.loanId !== null || expense.category === LOAN_EXPENSE_CATEGORY) {
      return failure("not_deletable", "loan_linked");
    }
    if (expense.payOffId !== null || expense.category === PAY_OFF_EXPENSE_CATEGORY) {
      return failure("not_deletable", "pay_off");
    }

    const deleted = await tx.expenses.softDelete(expense.id, actor.id);
    if (deleted === null) return failure("not_found");
    await tx.audit.append({
      actorId: actor.id,
      action: "expense.deleted",
      entityType: "Expense",
      entityId: deleted.id,
      detail: `category=${deleted.category} amount_kobo=${deleted.amount.toString()}`,
    });
    return { ok: true };
  });
}

/** Raw values as they arrive from a request. Anything may be wrong; this code checks it. */
export type ExpenseEditInput = ExpenseFieldsInput;

export type ExpenseUpdateResult = { ok: true; value: ExpenseView } | ExpenseFailureResult;

/**
 * Edits one expense (step 5.9c, OQ-08 default). PUT: every field is sent again and checked as
 * for a new expense (checkFields); a field left out of the body counts as empty (A-177), except
 * the day spent: left out, the saved day is kept (D-92).
 * Order: permission, id, fields, then the expense. An unknown id, a deleted expense and, for
 * Staff, an expense someone else recorded give not_found (DR-13, as deleteExpense). A Loan-linked
 * expense gives not_editable "loan_linked", a pay-off expense (Membership Withdrawal, or any
 * expense that names a pay-off, step 6.4c) not_editable "pay_off".
 * The lookup, the change and one audit entry "expense.updated" run in one store transaction
 * (D-45). An edit that changes nothing writes nothing and returns the expense. The audit detail
 * holds the old and new category, kobo amount and method, only whether the description and the
 * narration changed, as they may hold personal details (A-169, A-177), then the old and new day spent.
 */
export async function updateExpense(
  store: Store,
  actor: ExpenseActor,
  id: unknown,
  input: ExpenseEditInput,
): Promise<ExpenseUpdateResult> {
  if (!hasPermission(actor.subject, "expenses.edit")) return failure("forbidden");
  if (typeof id !== "string" || id.length === 0) return failure("not_found");

  const checked = checkFields(input, lagosDay(new Date()));
  if (!checked.ok) return checked;
  const { spentOn: sentSpentOn, ...next } = checked.value;

  return store.transaction<ExpenseUpdateResult>(async (tx) => {
    const expense = await tx.expenses.findById(id);
    if (expense === null || expense.deletedAt !== null) return failure("not_found");
    if (actor.subject.role !== "SUPER_ADMIN" && expense.createdById !== actor.id) return failure("not_found");
    if (expense.loanId !== null || expense.category === LOAN_EXPENSE_CATEGORY) {
      return failure("not_editable", "loan_linked");
    }
    if (expense.payOffId !== null || expense.category === PAY_OFF_EXPENSE_CATEGORY) {
      return failure("not_editable", "pay_off");
    }

    const descriptionChanged = expense.description !== next.description;
    const narrationChanged = expense.narration !== next.narration;
    const spentOn = sentSpentOn ?? expense.spentOn;
    if (
      expense.category === next.category &&
      expense.amount === next.amount &&
      expense.method === next.method &&
      expense.spentOn === spentOn &&
      !descriptionChanged &&
      !narrationChanged
    ) {
      return { ok: true, value: toView(expense) };
    }

    const updated = await tx.expenses.update(expense.id, { ...next, spentOn });
    if (updated === null) return failure("not_found");
    await tx.audit.append({
      actorId: actor.id,
      action: "expense.updated",
      entityType: "Expense",
      entityId: updated.id,
      detail:
        `old_category=${expense.category} old_amount_kobo=${expense.amount.toString()} old_method=${expense.method} ` +
        `new_category=${updated.category} new_amount_kobo=${updated.amount.toString()} new_method=${updated.method} ` +
        `description_changed=${String(descriptionChanged)} narration_changed=${String(narrationChanged)} ` +
        `old_spent_on=${expense.spentOn} new_spent_on=${updated.spentOn}`,
    });
    return { ok: true, value: toView(updated) };
  });
}
