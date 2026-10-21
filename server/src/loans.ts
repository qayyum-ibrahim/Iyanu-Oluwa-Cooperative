// Loan logic (step 5.4, D-54, DR-08, DR-10, DR-13, DR-14, DR-15). Rules over the Store: no HTTP here.
// Giving a loan needs loans.disburse (A-149). The member checks, the one-active-loan check, the
// loan, its one Loan expense and the audit entry run inside one store transaction, so all of
// them are saved or none (D-45).
// Audit details hold the Membership ID, the principal in kobo and the expense id: no name, no phone.

import { MoneyError, parseNaira, sumKobo, type Kobo } from "./money.js";
import { koboToNairaString } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { LoanRecord, PaymentMethod, PaymentRecord, Store } from "./store.js";

/** Longest interest note or notes accepted (A-161: my choice, same as A-82). */
export const LOAN_TEXT_MAX = 200;

/** The expense category a loan disbursement is recorded under (DR-10, A-148). */
export const LOAN_EXPENSE_CATEGORY = "Loan";

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface LoanActor {
  id: string;
  subject: PermissionSubject;
}

/** A loan as it may leave this module. */
export interface LoanView {
  id: string;
  memberId: string;
  membershipId: string;
  /** Naira as text, always 2 decimals, for example "300000.00". */
  principal: string;
  interestNote: string;
  notes: string;
  /** The Loan expense saved with the loan (DR-10). */
  expenseId: string;
  createdById: string;
  createdAt: string;
}

export type LoanFailure =
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "member_inactive"
  | "active_loan";

export interface LoanFailureResult {
  ok: false;
  reason: LoanFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

export type LoanResult = { ok: true; value: LoanView } | LoanFailureResult;

function failure(reason: LoanFailure, code?: string): LoanFailureResult {
  return { ok: false, reason, ...(code !== undefined ? { code } : {}) };
}

/**
 * Principal minus the payment lines linked to this loan (A-144, A-145). Worked out on read,
 * never stored (D-17). `payments` are the member's payments; lines of other loans are ignored.
 */
export function loanOutstanding(loan: LoanRecord, payments: readonly PaymentRecord[]): Kobo {
  const repaid = payments.flatMap((p) => p.lines.filter((l) => l.loanId === loan.id).map((l) => l.amount));
  return loan.principal - sumKobo(repaid);
}

/** A loan is active while anything is outstanding (DR-08). */
export function isLoanActive(loan: LoanRecord, payments: readonly PaymentRecord[]): boolean {
  return loanOutstanding(loan, payments) > 0n;
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
  if (trimmed.length > LOAN_TEXT_MAX) return { ok: false };
  return { ok: true, value: trimmed };
}

/** Raw values as they arrive from a request. Anything may be wrong; this code checks it. */
export interface NewLoanInput {
  memberId?: unknown;
  principal?: unknown;
  method?: unknown;
  interestNote?: unknown;
  notes?: unknown;
}

/**
 * Gives a loan to a member: saves the loan, its one Loan expense (DR-10) and one audit entry
 * "loan.disbursed".
 * Order: permission, member id, method, principal (a naira string above ₦0), interest note and
 * notes, then one transaction: find the member, check who may see it, check it is Active
 * (A-147), check it has no active loan (DR-08), save the loan, save the expense, write the audit
 * entry. Staff may give loans only to members they recorded (A-147); other members answer
 * not_found. If any write fails, nothing is saved (D-45).
 */
export async function disburseLoan(
  store: Store,
  actor: LoanActor,
  input: NewLoanInput,
): Promise<LoanResult> {
  if (!hasPermission(actor.subject, "loans.disburse")) return failure("forbidden");

  const memberId = input.memberId;
  if (typeof memberId !== "string" || memberId.length === 0) {
    return failure("invalid_input", "invalid_member_id");
  }
  const method = parseMethod(input.method);
  if (method === null) return failure("invalid_input", "invalid_method");

  let principal: Kobo;
  try {
    principal = parseNaira(input.principal);
  } catch (e) {
    if (e instanceof MoneyError) return failure("invalid_input", "invalid_principal");
    throw e;
  }
  if (principal <= 0n) return failure("invalid_input", "principal_not_positive");

  const interestNote = optionalText(input.interestNote);
  if (!interestNote.ok) return failure("invalid_input", "invalid_interest_note");
  const notes = optionalText(input.notes);
  if (!notes.ok) return failure("invalid_input", "invalid_notes");

  return store.transaction<LoanResult>(async (tx) => {
    const member = await tx.members.findById(memberId);
    if (member === null) return failure("not_found");
    if (actor.subject.role !== "SUPER_ADMIN" && member.createdById !== actor.id) {
      return failure("not_found");
    }
    if (member.status !== "ACTIVE") return failure("member_inactive");

    const loans = await tx.loans.listByMember(member.id);
    if (loans.length > 0) {
      const payments = await tx.payments.listByMember(member.id);
      if (loans.some((l) => isLoanActive(l, payments))) return failure("active_loan");
    }

    const loan = await tx.loans.create({
      memberId: member.id,
      principal,
      interestNote: interestNote.value,
      notes: notes.value,
      createdById: actor.id,
    });
    const expense = await tx.expenses.create({
      category: LOAN_EXPENSE_CATEGORY,
      amount: principal,
      method,
      loanId: loan.id,
      createdById: actor.id,
    });
    await tx.audit.append({
      actorId: actor.id,
      action: "loan.disbursed",
      entityType: "Loan",
      entityId: loan.id,
      detail: `membership_id=${member.membershipId} principal_kobo=${principal.toString()} expense_id=${expense.id}`,
    });
    return {
      ok: true,
      value: {
        id: loan.id,
        memberId: member.id,
        membershipId: member.membershipId,
        principal: koboToNairaString(loan.principal),
        interestNote: loan.interestNote,
        notes: loan.notes,
        expenseId: expense.id,
        createdById: loan.createdById,
        createdAt: loan.createdAt.toISOString(),
      },
    };
  });
}
