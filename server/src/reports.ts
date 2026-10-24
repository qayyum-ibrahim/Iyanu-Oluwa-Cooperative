// Category report logic (step 7.4b; D-99, A-233 item 5, A-238, DR-13). Rules over the Store: no HTTP here.
// For a day range: the total of payment lines per category (DR-04), and beside it what pay-offs paid
// out of each category. Pay-offs are shown, not taken off, so the total of the report still matches
// income on the dashboard. Read only: nothing is written, not even an audit entry (as A-134).

import { PAYMENT_CATEGORY_TABLE } from "./categories.js";
import { sumKobo, type Kobo } from "./money.js";
import { isCalendarDay, koboToNairaString, lagosDay } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { Store } from "./store.js";

/** Longest createdById filter accepted (as USER_FILTER_MAX in members.ts and expenses.ts). */
const USER_FILTER_MAX = 100;

/** Who is acting: the user id and what they may do. */
export interface ReportActor {
  id: string;
  subject: PermissionSubject;
}

/** One category of the report. Naira as text, always 2 decimals. */
export interface CategoryRow {
  category: string;
  /** Paid out at pay-off (DR-03). */
  refundable: boolean;
  /** Sum of the payment lines of this category in the range. */
  paid: string;
  /** Sum of the pay-off lines of this category in the range. "0.00" for a category not refundable. */
  paidOut: string;
}

export interface CategoryReportView {
  /** "YYYY-MM-DD", both included; null when not given (no bound). */
  fromDay: string | null;
  toDay: string | null;
  /** Every DR-04 category in DR-04 order, zeros included. */
  categories: CategoryRow[];
  /** Sum of every payment line in the range: the income figure. */
  totalPaid: string;
  /** Sum of every pay-off line in the range. */
  totalPaidOut: string;
}

export type CategoryReportFailure = "forbidden" | "invalid_input";

export interface CategoryReportFailureResult {
  ok: false;
  reason: CategoryReportFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

export type CategoryReportResult = { ok: true; value: CategoryReportView } | CategoryReportFailureResult;

function failure(reason: CategoryReportFailure, code?: string): CategoryReportFailureResult {
  return { ok: false, reason, ...(code !== undefined ? { code } : {}) };
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface CategoryReportInput {
  fromDay?: unknown;
  toDay?: unknown;
  createdById?: unknown;
}

/**
 * The category report (R-17).
 * Order: permission (reports.view), createdById, fromDay, toDay, range (as listExpenses). A missing
 * day means no bound on that side. One store transaction reads payments and pay-offs, so both
 * columns come from one snapshot. A pay-off's day is the Lagos day of its createdAt (A-238).
 * Scope (DR-13, D-99): Staff see the payments and pay-offs of members they recorded; a createdById
 * filter is checked but ignored. The Super Admin sees all, or one user's members with createdById.
 */
export async function getCategoryReport(
  store: Store,
  actor: ReportActor,
  input: CategoryReportInput,
): Promise<CategoryReportResult> {
  if (!hasPermission(actor.subject, "reports.view")) return failure("forbidden");

  const userFilter = input.createdById;
  if (
    userFilter !== undefined &&
    (typeof userFilter !== "string" || userFilter.length === 0 || userFilter.length > USER_FILTER_MAX)
  ) {
    return failure("invalid_input", "invalid_created_by_id");
  }
  const fromDay = input.fromDay;
  if (fromDay !== undefined && !isCalendarDay(fromDay)) return failure("invalid_input", "invalid_from_day");
  const toDay = input.toDay;
  if (toDay !== undefined && !isCalendarDay(toDay)) return failure("invalid_input", "invalid_to_day");
  if (fromDay !== undefined && toDay !== undefined && fromDay > toDay) {
    return failure("invalid_input", "invalid_range");
  }

  const scopeId = actor.subject.role === "SUPER_ADMIN" ? userFilter : actor.id;
  const memberScope = scopeId !== undefined ? { memberCreatedById: scopeId } : {};

  return store.transaction(async (tx): Promise<CategoryReportResult> => {
    const payments = await tx.payments.list({
      ...memberScope,
      ...(fromDay !== undefined ? { paidFrom: fromDay } : {}),
      ...(toDay !== undefined ? { paidTo: toDay } : {}),
    });
    // Both are "YYYY-MM-DD", so text order is day order.
    const inRange = (day: string) =>
      (fromDay === undefined || day >= fromDay) && (toDay === undefined || day <= toDay);
    const payOffs = (await tx.payOffs.list(memberScope)).filter((p) => inRange(lagosDay(p.createdAt)));

    // Seeded in DR-04 order. A stored category not in the table gets a row after them, so the
    // rows still add up to the totals.
    const rows = new Map<string, { refundable: boolean; paid: Kobo[]; paidOut: Kobo[] }>(
      PAYMENT_CATEGORY_TABLE.map((c) => [c.name, { refundable: c.refundable, paid: [], paidOut: [] }]),
    );
    const rowOf = (category: string) => {
      let row = rows.get(category);
      if (row === undefined) {
        row = { refundable: false, paid: [], paidOut: [] };
        rows.set(category, row);
      }
      return row;
    };
    const paidLines = payments.flatMap((p) => p.lines);
    const paidOutLines = payOffs.flatMap((p) => p.lines);
    for (const l of paidLines) rowOf(l.category).paid.push(l.amount);
    for (const l of paidOutLines) rowOf(l.category).paidOut.push(l.amount);

    return {
      ok: true,
      value: {
        fromDay: fromDay ?? null,
        toDay: toDay ?? null,
        categories: [...rows].map(([category, r]) => ({
          category,
          refundable: r.refundable,
          paid: koboToNairaString(sumKobo(r.paid)),
          paidOut: koboToNairaString(sumKobo(r.paidOut)),
        })),
        totalPaid: koboToNairaString(sumKobo(paidLines.map((l) => l.amount))),
        totalPaidOut: koboToNairaString(sumKobo(paidOutLines.map((l) => l.amount))),
      },
    };
  });
}
