// Dashboard logic (step 7.3; D-99, D-100, D-101, D-102, DR-13). Rules over the Store: no HTTP here.
// Months are Lagos months of the day fields (paidOn, spentOn), first to last day, both included.
// Income is every payment line (D-101). Expenditure is every expense that is not deleted, except
// Loan and Membership Withdrawal (D-100, D-102). Total Outflow is every expense that is not deleted,
// Loan and Membership Withdrawal included (D-106, D-107). Read only: nothing is written, not even an
// audit entry (as A-134).

import type { ExpenseView } from "./expenses.js";
import { isLoanActive, loanOutstanding, LOAN_EXPENSE_CATEGORY } from "./loans.js";
import { sumKobo, type Kobo } from "./money.js";
import { isCalendarDay, koboToNairaString, lagosDay } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { ExpenseRecord, PaymentRecord, Store } from "./store.js";

/** The expense category a pay-off is paid out under (DR-05). */
export const PAY_OFF_EXPENSE_CATEGORY = "Membership Withdrawal";

/** How many recent expenses the dashboard shows (A-233 item 6). */
export const RECENT_EXPENSES = 10;

/** Longest createdById filter accepted (as USER_FILTER_MAX in members.ts and expenses.ts). */
const USER_FILTER_MAX = 100;

const MONTH_PATTERN = /^([0-9]{4})-([0-9]{2})$/;

/** Who is acting: the user id and what they may do. */
export interface DashboardActor {
  id: string;
  subject: PermissionSubject;
}

/** One figure for the month and for all time. Naira as text, always 2 decimals. */
export interface MonthAndAllTime {
  month: string;
  allTime: string;
}

export interface DashboardView {
  /** "YYYY-MM". */
  month: string;
  /** First and last day of the month, "YYYY-MM-DD", both included. */
  fromDay: string;
  toDay: string;
  income: MonthAndAllTime;
  expenditure: MonthAndAllTime;
  membershipWithdrawal: MonthAndAllTime;
  /** Expenditure + loans given + Membership Withdrawals: every outflow not deleted (D-107). */
  totalOutflow: MonthAndAllTime;
  /** Sum of what is outstanding on loans that are Active now (all time only, A-233 item 8). */
  outstandingLoans: string;
  activeMembers: number;
  /** The newest running costs of the month, newest first: no Loan or Membership Withdrawal (D-107). */
  recentExpenses: ExpenseView[];
}

export type DashboardFailure = "forbidden" | "invalid_input";

export interface DashboardFailureResult {
  ok: false;
  reason: DashboardFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

export type DashboardResult = { ok: true; value: DashboardView } | DashboardFailureResult;

function failure(reason: DashboardFailure, code?: string): DashboardFailureResult {
  return { ok: false, reason, ...(code !== undefined ? { code } : {}) };
}

/** "2028-02" gives { fromDay: "2028-02-01", toDay: "2028-02-29" }; null for anything else. */
export function monthDays(month: unknown): { fromDay: string; toDay: string } | null {
  if (typeof month !== "string" || !MONTH_PATTERN.test(month)) return null;
  const fromDay = `${month}-01`;
  if (!isCalendarDay(fromDay)) return null;
  for (const last of ["31", "30", "29", "28"]) {
    const toDay = `${month}-${last}`;
    if (isCalendarDay(toDay)) return { fromDay, toDay };
  }
  return null;
}

function toExpenseView(e: ExpenseRecord): ExpenseView {
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

function lineTotal(payments: readonly PaymentRecord[]): Kobo {
  return sumKobo(payments.flatMap((p) => p.lines.map((l) => l.amount)));
}

function amountTotal(expenses: readonly ExpenseRecord[]): Kobo {
  return sumKobo(expenses.map((e) => e.amount));
}

function pair(month: Kobo, allTime: Kobo): MonthAndAllTime {
  return { month: koboToNairaString(month), allTime: koboToNairaString(allTime) };
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface DashboardInput {
  /** "YYYY-MM". Missing means the month of today in Lagos (A-236). */
  month?: unknown;
  createdById?: unknown;
}

/**
 * The dashboard figures (R-15 to R-17).
 * Order: permission (dashboard), month, createdById, then one store transaction reads members,
 * payments, loans and expenses, so the figures come from one snapshot.
 * Scope (DR-13, D-99): Staff see the payments, loans and members of members they recorded, and
 * the expenses they recorded; a createdById filter is checked but ignored. The Super Admin sees
 * all, or one user's with createdById (as listExpenses).
 */
export async function getDashboard(
  store: Store,
  actor: DashboardActor,
  input: DashboardInput,
): Promise<DashboardResult> {
  if (!hasPermission(actor.subject, "dashboard")) return failure("forbidden");

  const month = input.month === undefined ? lagosDay(new Date()).slice(0, 7) : input.month;
  const days = monthDays(month);
  if (days === null || typeof month !== "string") return failure("invalid_input", "invalid_month");
  const { fromDay, toDay } = days;

  const userFilter = input.createdById;
  if (
    userFilter !== undefined &&
    (typeof userFilter !== "string" || userFilter.length === 0 || userFilter.length > USER_FILTER_MAX)
  ) {
    return failure("invalid_input", "invalid_created_by_id");
  }
  const scopeId = actor.subject.role === "SUPER_ADMIN" ? userFilter : actor.id;
  const memberScope = scopeId !== undefined ? { memberCreatedById: scopeId } : {};
  const recorderScope = scopeId !== undefined ? { createdById: scopeId } : {};

  return store.transaction(async (tx): Promise<DashboardResult> => {
    const payments = await tx.payments.list(memberScope);
    const loans = await tx.loans.list(memberScope);
    const expenses = await tx.expenses.list(recorderScope);
    const activeMembers = (await tx.members.list({ ...recorderScope, status: "ACTIVE" })).length;

    // Both are "YYYY-MM-DD", so text order is day order.
    const inMonth = (day: string) => day >= fromDay && day <= toDay;
    const monthPayments = payments.filter((p) => inMonth(p.paidOn));
    const monthExpenses = expenses.filter((e) => inMonth(e.spentOn));
    const counted = (e: ExpenseRecord) =>
      e.category !== LOAN_EXPENSE_CATEGORY && e.category !== PAY_OFF_EXPENSE_CATEGORY;
    const withdrawal = (e: ExpenseRecord) => e.category === PAY_OFF_EXPENSE_CATEGORY;

    const byMember = new Map<string, PaymentRecord[]>();
    for (const p of payments) byMember.set(p.memberId, [...(byMember.get(p.memberId) ?? []), p]);
    const outstanding = sumKobo(
      loans
        .filter((l) => isLoanActive(l, byMember.get(l.memberId) ?? []))
        .map((l) => loanOutstanding(l, byMember.get(l.memberId) ?? [])),
    );

    return {
      ok: true,
      value: {
        month,
        fromDay,
        toDay,
        income: pair(lineTotal(monthPayments), lineTotal(payments)),
        expenditure: pair(amountTotal(monthExpenses.filter(counted)), amountTotal(expenses.filter(counted))),
        membershipWithdrawal: pair(
          amountTotal(monthExpenses.filter(withdrawal)),
          amountTotal(expenses.filter(withdrawal)),
        ),
        totalOutflow: pair(amountTotal(monthExpenses), amountTotal(expenses)),
        outstandingLoans: koboToNairaString(outstanding),
        activeMembers,
        // The store lists by day spent, then time recorded, oldest first.
        recentExpenses: monthExpenses.filter(counted).slice(-RECENT_EXPENSES).reverse().map(toExpenseView),
      },
    };
  });
}
