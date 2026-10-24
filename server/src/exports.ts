// Export logic (step 8.2; D-104, A-249, A-251, DR-13). Rules over the Store: no HTTP here.
// Each export reads its rows, builds one .xlsx file (workbook.ts) and writes one audit entry
// "export.created", all in one store transaction: a file that cannot be built writes no entry.
// The audit detail holds the kind, the scope and the days: no name, no phone.

import { lagosDay, isCalendarDay } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { MemberStatus, PaymentMethod, Store } from "./store.js";
import { buildWorkbook, type Sheet, type SheetColumn } from "./workbook.js";

/** Longest createdById filter accepted (as USER_FILTER_MAX in members.ts and expenses.ts). */
const USER_FILTER_MAX = 100;

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface ExportActor {
  id: string;
  subject: PermissionSubject;
}

export type ExportKind = "members" | "transactions" | "expenses";

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

interface Checked {
  /** The user whose records are exported, or undefined for everyone (Super Admin only). */
  scopeId: string | undefined;
  fromDay: string | undefined;
  toDay: string | undefined;
}

type CheckResult = { ok: true; value: Checked } | ExportFailureResult;

/**
 * Order: permission (reports.export alone, A-249 item 2), createdById, fromDay, toDay, range (as
 * listExpenses). Staff always get their own records; a createdById from Staff is checked but
 * ignored (DR-13, D-67). The Super Admin gets all, or one user's with createdById.
 */
function check(actor: ExportActor, input: DayExportInput): CheckResult {
  if (!hasPermission(actor.subject, "reports.export")) return failure("forbidden");

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
  // Both are "YYYY-MM-DD", so text order is day order.
  if (fromDay !== undefined && toDay !== undefined && fromDay > toDay) {
    return failure("invalid_input", "invalid_range");
  }

  const scopeId = actor.subject.role === "SUPER_ADMIN" ? userFilter : actor.id;
  return { ok: true, value: { scopeId, fromDay, toDay } };
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
    await tx.audit.append({
      actorId: actor.id,
      action: "export.created",
      entityType: "Export",
      entityId: null,
      detail: `kind=${kind} scope=${checked.scopeId ?? "all"}${days}`,
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
  const { scopeId, fromDay, toDay } = checked.value;

  return run(store, actor, "transactions", checked.value, async (tx) => {
    const nameOf = await namesOf(tx);
    const members = new Map(
      (await tx.members.list(scopeId !== undefined ? { createdById: scopeId } : {})).map((m) => [m.id, m]),
    );
    const payments = await tx.payments.list({
      ...(scopeId !== undefined ? { memberCreatedById: scopeId } : {}),
      ...(fromDay !== undefined ? { paidFrom: fromDay } : {}),
      ...(toDay !== undefined ? { paidTo: toDay } : {}),
    });
    return {
      name: "Transactions",
      columns: TRANSACTION_COLUMNS,
      rows: payments.flatMap((p) => {
        const member = members.get(p.memberId);
        if (member === undefined) throw new Error("The member of a saved payment is missing");
        return p.lines.map((l) => ({
          paidOn: p.paidOn,
          membershipId: member.membershipId,
          member: member.fullName,
          category: l.category,
          amount: l.amount,
          method: METHOD_LABEL[p.method],
          recordedBy: nameOf(p.createdById),
        }));
      }),
    };
  });
}

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
  const { scopeId, fromDay, toDay } = checked.value;

  return run(store, actor, "expenses", checked.value, async (tx) => {
    const nameOf = await namesOf(tx);
    const expenses = await tx.expenses.list({
      ...(scopeId !== undefined ? { createdById: scopeId } : {}),
      ...(fromDay !== undefined ? { spentFrom: fromDay } : {}),
      ...(toDay !== undefined ? { spentTo: toDay } : {}),
    });
    return {
      name: "Expenses",
      columns: EXPENSE_COLUMNS,
      rows: expenses.map((e) => ({
        spentOn: e.spentOn,
        category: e.category,
        description: e.description,
        narration: e.narration,
        amount: e.amount,
        method: METHOD_LABEL[e.method],
        recordedBy: nameOf(e.createdById),
      })),
    };
  });
}
