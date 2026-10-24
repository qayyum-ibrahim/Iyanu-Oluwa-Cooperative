// Export logic (steps 8.2 and 8.3; D-104, A-249, A-251, A-252, DR-13). Rules over the Store: no HTTP here.
// Each export reads its rows, builds one .xlsx file (workbook.ts) and writes one audit entry
// "export.created", all in one store transaction: a file that cannot be built writes no entry.
// The audit detail holds the kind, the scope, the days and the category: no name, no phone.

import { isPaymentCategory } from "./categories.js";
import { isExpenseCategory } from "./expense-categories.js";
import { lagosDay, isCalendarDay } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { MemberStatus, PaymentMethod, Store } from "./store.js";
import { buildWorkbook, type Sheet, type SheetColumn, type SheetRow } from "./workbook.js";

/** Longest createdById filter accepted (as USER_FILTER_MAX in members.ts and expenses.ts). */
const USER_FILTER_MAX = 100;

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface ExportActor {
  id: string;
  subject: PermissionSubject;
}

export type ExportKind = "members" | "transactions" | "expenses" | "cashflow" | "category";

export type ExportFailure = "forbidden" | "invalid_input";

export interface ExportFailureResult {
  ok: false;
  reason: ExportFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

/** The .xlsx file. */
export type ExportResult = { ok: true; value: Buffer } | ExportFailureResult;

function failure(reason: ExportFailure, code?: string): ExportFailureResult {
  return { ok: false, reason, ...(code !== undefined ? { code } : {}) };
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface MembersExportInput {
  createdById?: unknown;
}

export interface DayExportInput extends MembersExportInput {
  /** First day to export, "YYYY-MM-DD", included. */
  fromDay?: unknown;
  /** Last day to export, "YYYY-MM-DD", included. */
  toDay?: unknown;
}

export interface CategoryExportInput extends DayExportInput {
  /** One payment category (DR-04) or one expense category (DR-11). Required. */
  category?: unknown;
}

interface Checked {
  /** The user whose records are exported, or undefined for everyone (Super Admin only). */
  scopeId: string | undefined;
  fromDay: string | undefined;
  toDay: string | undefined;
  /** Only for the category kind. */
  category: string | undefined;
}

type CheckResult = { ok: true; value: Checked } | ExportFailureResult;

/**
 * Order: permission (reports.export alone, A-249 item 2), createdById, category (category kind
 * only: required, an exact name of DR-04 or DR-11), fromDay, toDay, range (as listExpenses).
 * Staff always get their own records; a createdById from Staff is checked but ignored (DR-13,
 * D-67). The Super Admin gets all, or one user's with createdById.
 */
function check(actor: ExportActor, input: CategoryExportInput, withCategory = false): CheckResult {
  if (!hasPermission(actor.subject, "reports.export")) return failure("forbidden");

  const userFilter = input.createdById;
  if (
    userFilter !== undefined &&
    (typeof userFilter !== "string" || userFilter.length === 0 || userFilter.length > USER_FILTER_MAX)
  ) {
    return failure("invalid_input", "invalid_created_by_id");
  }
  const category = withCategory ? input.category : undefined;
  if (withCategory && !isPaymentCategory(category) && !isExpenseCategory(category)) {
    return failure("invalid_input", "invalid_category");
  }
  const fromDay = input.fromDay;
  if (fromDay !== undefined && !isCalendarDay(fromDay)) return failure("invalid_input", "invalid_from_day");
  const toDay = input.toDay;
  if (toDay !== undefined && !isCalendarDay(toDay)) return failure("invalid_input", "invalid_to_day");
  // Both are "YYYY-MM-DD", so text order is day order.
  if (fromDay !== undefined && toDay !== undefined && fromDay > toDay) {
    return failure("invalid_input", "invalid_range");
  }

  const scopeId = actor.subject.role === "SUPER_ADMIN" ? userFilter : actor.id;
  return { ok: true, value: { scopeId, fromDay, toDay, category: category as string | undefined } };
}

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer" };
const STATUS_LABEL: Record<MemberStatus, string> = { ACTIVE: "Active", INACTIVE: "Inactive" };

/** Display names of every user, for the "Recorded by" column. */
async function namesOf(tx: Store): Promise<(id: string) => string> {
  const names = new Map((await tx.users.list()).map((u) => [u.id, u.displayName]));
  return (id) => {
    const name = names.get(id);
    if (name === undefined) throw new Error("The recorder of a saved row is missing");
    return name;
  };
}

/**
 * Reads the rows, builds the file and writes the audit entry in one transaction. If the file
 * cannot be built (WorkbookError, for example an amount too large for a cell), it throws and
 * nothing is written.
 */
function run(
  store: Store,
  actor: ExportActor,
  kind: ExportKind,
  checked: Checked,
  sheetOf: (tx: Store) => Promise<Sheet>,
): Promise<ExportResult> {
  return store.transaction(async (tx): Promise<ExportResult> => {
    const file = await buildWorkbook([await sheetOf(tx)]);
    const days =
      kind === "members" ? "" : ` from_day=${checked.fromDay ?? "none"} to_day=${checked.toDay ?? "none"}`;
    // Last, because a category name may hold spaces.
    const category = checked.category !== undefined ? ` category=${checked.category}` : "";
    await tx.audit.append({
      actorId: actor.id,
      action: "export.created",
      entityType: "Export",
      entityId: null,
      detail: `kind=${kind} scope=${checked.scopeId ?? "all"}${days}${category}`,
    });
    return { ok: true, value: file };
  });
}

const MEMBER_COLUMNS: readonly SheetColumn[] = [
  { key: "name", header: "Name", kind: "text", width: 30 },
  { key: "membershipId", header: "Membership ID", kind: "text" },
  { key: "phone", header: "Phone", kind: "text" },
  { key: "occupation", header: "Occupation", kind: "text" },
  { key: "status", header: "Status", kind: "text" },
  { key: "joined", header: "Date joined", kind: "text" },
  { key: "recordedBy", header: "Recorded by", kind: "text", width: 24 },
];

/**
 * Every member in scope, Active and Inactive, in Membership ID order (A-249 item 4). No day filter.
 * Date joined is the Lagos day the member was recorded.
 */
export async function exportMembers(
  store: Store,
  actor: ExportActor,
  input: MembersExportInput,
): Promise<ExportResult> {
  const checked = check(actor, { createdById: input.createdById });
  if (!checked.ok) return checked;
  const { scopeId } = checked.value;

  return run(store, actor, "members", checked.value, async (tx) => {
    const nameOf = await namesOf(tx);
    const members = await tx.members.list(scopeId !== undefined ? { createdById: scopeId } : {});
    return {
      name: "Members",
      columns: MEMBER_COLUMNS,
      rows: members.map((m) => ({
        name: m.fullName,
        membershipId: m.membershipId,
        phone: m.phone,
        occupation: m.occupation,
        status: STATUS_LABEL[m.status],
        joined: lagosDay(m.createdAt),
        recordedBy: nameOf(m.createdById),
      })),
    };
  });
}

const TRANSACTION_COLUMNS: readonly SheetColumn[] = [
  { key: "paidOn", header: "Date paid", kind: "text" },
  { key: "membershipId", header: "Membership ID", kind: "text" },
  { key: "member", header: "Member", kind: "text", width: 30 },
  { key: "category", header: "Category", kind: "text", width: 24 },
  { key: "amount", header: "Amount (₦)", kind: "money" },
  { key: "method", header: "Method", kind: "text" },
  { key: "recordedBy", header: "Recorded by", kind: "text", width: 24 },
];

/**
 * One row per payment line whose payment was paid in the day range (paidOn, both days included),
 * by paidOn, then time recorded; lines in their saved order. Payment lines only: pay-offs show in
 * the expenses file as their Membership Withdrawal expense (A-249 item 5), so the Total equals
 * the Categories report Total (Paid). Scope is the member's recorder (A-133); "Recorded by" is
 * who recorded the payment.
 */
export async function exportTransactions(
  store: Store,
  actor: ExportActor,
  input: DayExportInput,
): Promise<ExportResult> {
  const checked = check(actor, input);
  if (!checked.ok) return checked;

  return run(store, actor, "transactions", checked.value, async (tx) => ({
    name: "Transactions",
    columns: TRANSACTION_COLUMNS,
    rows: (await linesOf(tx, checked.value)).map(transactionRow),
  }));
}

/** One payment line with what its row shows. */
interface LineRow {
  paidOn: string;
  membershipId: string;
  member: string;
  category: string;
  amount: bigint;
  method: string;
  recordedBy: string;
}

/**
 * The payment lines in scope and in the day range, by paidOn, then time recorded; lines in their
 * saved order. With a category, only the lines of that category.
 */
async function linesOf(tx: Store, checked: Checked): Promise<LineRow[]> {
  const { scopeId, fromDay, toDay, category } = checked;
  const nameOf = await namesOf(tx);
  const members = new Map(
    (await tx.members.list(scopeId !== undefined ? { createdById: scopeId } : {})).map((m) => [m.id, m]),
  );
  const payments = await tx.payments.list({
    ...(scopeId !== undefined ? { memberCreatedById: scopeId } : {}),
    ...(fromDay !== undefined ? { paidFrom: fromDay } : {}),
    ...(toDay !== undefined ? { paidTo: toDay } : {}),
  });
  return payments.flatMap((p) => {
    const member = members.get(p.memberId);
    if (member === undefined) throw new Error("The member of a saved payment is missing");
    return p.lines
      .filter((l) => category === undefined || l.category === category)
      .map((l) => ({
        paidOn: p.paidOn,
        membershipId: member.membershipId,
        member: member.fullName,
        category: l.category,
        amount: l.amount,
        method: METHOD_LABEL[p.method],
        recordedBy: nameOf(p.createdById),
      }));
  });
}

const transactionRow = (l: LineRow): SheetRow => ({ ...l });

const EXPENSE_COLUMNS: readonly SheetColumn[] = [
  { key: "spentOn", header: "Date spent", kind: "text" },
  { key: "category", header: "Category", kind: "text", width: 24 },
  { key: "description", header: "Description", kind: "text", width: 30 },
  { key: "narration", header: "Narration", kind: "text", width: 30 },
  { key: "amount", header: "Amount (₦)", kind: "money" },
  { key: "method", header: "Method", kind: "text" },
  { key: "recordedBy", header: "Recorded by", kind: "text", width: 24 },
];

/**
 * Every expense not deleted, every category (Loan and Membership Withdrawal too), spent in the day
 * range (spentOn, both days included), in the store's order, so the Total equals the Expenses page
 * total (A-249 item 6). Scope is the expense's recorder, as listExpenses (D-67).
 */
export async function exportExpenses(
  store: Store,
  actor: ExportActor,
  input: DayExportInput,
): Promise<ExportResult> {
  const checked = check(actor, input);
  if (!checked.ok) return checked;

  return run(store, actor, "expenses", checked.value, async (tx) => ({
    name: "Expenses",
    columns: EXPENSE_COLUMNS,
    rows: (await expensesOf(tx, checked.value)).map(expenseRow),
  }));
}

/** One expense with what its row shows. */
interface OutRow {
  spentOn: string;
  category: string;
  description: string;
  narration: string;
  amount: bigint;
  method: string;
  recordedBy: string;
}

/**
 * The expenses not deleted, in scope and in the day range, in the store's order (day spent, then
 * time recorded). With a category, only that category, as the Expenses page filter.
 */
async function expensesOf(tx: Store, checked: Checked): Promise<OutRow[]> {
  const { scopeId, fromDay, toDay, category } = checked;
  const nameOf = await namesOf(tx);
  const expenses = await tx.expenses.list({
    ...(scopeId !== undefined ? { createdById: scopeId } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(fromDay !== undefined ? { spentFrom: fromDay } : {}),
    ...(toDay !== undefined ? { spentTo: toDay } : {}),
  });
  return expenses.map((e) => ({
    spentOn: e.spentOn,
    category: e.category,
    description: e.description,
    narration: e.narration,
    amount: e.amount,
    method: METHOD_LABEL[e.method],
    recordedBy: nameOf(e.createdById),
  }));
}

const expenseRow = (e: OutRow): SheetRow => ({ ...e });

const CASHFLOW_COLUMNS: readonly SheetColumn[] = [
  { key: "day", header: "Date", kind: "text" },
  { key: "flow", header: "Flow", kind: "text" },
  { key: "category", header: "Category", kind: "text", width: 24 },
  { key: "membershipId", header: "Membership ID", kind: "text" },
  { key: "member", header: "Member", kind: "text", width: 30 },
  { key: "description", header: "Description", kind: "text", width: 30 },
  { key: "narration", header: "Narration", kind: "text", width: 30 },
  { key: "in", header: "In (₦)", kind: "money" },
  { key: "out", header: "Out (₦)", kind: "money" },
  { key: "method", header: "Method", kind: "text" },
  { key: "recordedBy", header: "Recorded by", kind: "text", width: 24 },
];

/**
 * Payment lines as In and expenses as Out, by day; on the same day In rows come first, each side
 * in its own order (A-252). The Total row has both totals: In equals the transactions Total, Out
 * the expenses Total (every category not deleted, so the Expenses page total, not the dashboard's
 * Total Expenditures, A-249 item 6). Scope as the two files it joins.
 */
export async function exportCashflow(
  store: Store,
  actor: ExportActor,
  input: DayExportInput,
): Promise<ExportResult> {
  const checked = check(actor, input);
  if (!checked.ok) return checked;

  return run(store, actor, "cashflow", checked.value, async (tx) => {
    const ins: SheetRow[] = (await linesOf(tx, checked.value)).map((l) => ({
      day: l.paidOn,
      flow: "In",
      category: l.category,
      membershipId: l.membershipId,
      member: l.member,
      description: null,
      narration: null,
      in: l.amount,
      out: null,
      method: l.method,
      recordedBy: l.recordedBy,
    }));
    const outs: SheetRow[] = (await expensesOf(tx, checked.value)).map((e) => ({
      day: e.spentOn,
      flow: "Out",
      category: e.category,
      membershipId: null,
      member: null,
      description: e.description,
      narration: e.narration,
      in: null,
      out: e.amount,
      method: e.method,
      recordedBy: e.recordedBy,
    }));
    // Both lists are in day order; merge them, In first on the same day.
    const rows: SheetRow[] = [];
    let i = 0;
    let o = 0;
    while (i < ins.length || o < outs.length) {
      const nextIn = ins[i];
      const nextOut = outs[o];
      if (nextIn !== undefined && (nextOut === undefined || (nextIn.day as string) <= (nextOut.day as string))) {
        rows.push(nextIn);
        i += 1;
      } else if (nextOut !== undefined) {
        rows.push(nextOut);
        o += 1;
      }
    }
    return { name: "Cashflow", columns: CASHFLOW_COLUMNS, rows };
  });
}

/**
 * One category in the day range (A-249 item 7, A-252). A payment category (DR-04) gives its
 * payment lines, in the transactions columns, so the Total equals that category's Paid in the
 * Categories report. Any other name of DR-11 (Membership Withdrawal and Loan too) gives its
 * expenses, in the expenses columns, so the Total equals the Expenses page with that filter.
 * The two lists share no name. The sheet is named after the category.
 */
export async function exportCategory(
  store: Store,
  actor: ExportActor,
  input: CategoryExportInput,
): Promise<ExportResult> {
  const checked = check(actor, input, true);
  if (!checked.ok) return checked;
  const category = checked.value.category as string;

  return run(store, actor, "category", checked.value, async (tx) =>
    isPaymentCategory(category)
      ? { name: category, columns: TRANSACTION_COLUMNS, rows: (await linesOf(tx, checked.value)).map(transactionRow) }
      : { name: category, columns: EXPENSE_COLUMNS, rows: (await expensesOf(tx, checked.value)).map(expenseRow) },
  );
}
