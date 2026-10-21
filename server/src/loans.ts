// Loan logic (step 5.4, idempotency key in 5.4c, list in 5.6; D-54, D-59, D-60, DR-08, DR-10, DR-13, DR-14,
// DR-15). Rules over the Store: no HTTP here.
// Giving a loan needs loans.disburse (A-149). The key lookup, the member checks, the
// one-active-loan check, the loan, its one Loan expense and the audit entry run inside one store
// transaction, so all of them are saved or none (D-45).
// Audit details hold the Membership ID, the principal in kobo and the expense id: no name, no
// phone, no key.

import { createHash } from "node:crypto";
import { MoneyError, parseNaira, sumKobo, type Kobo } from "./money.js";
import { IDEMPOTENCY_KEY_PATTERN, koboToNairaString } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import {
  DuplicateLoanKeyError,
  type LoanRecord,
  type PaymentMethod,
  type PaymentRecord,
  type Store,
} from "./store.js";

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
  | "active_loan"
  | "idempotency_conflict";

export interface LoanFailureResult {
  ok: false;
  reason: LoanFailure;
  /** For invalid_input: which check failed. Never repeats the input. */
  code?: string;
}

/** replayed is true when the key had been used before and the first loan is returned. */
export type LoanResult = { ok: true; value: LoanView; replayed: boolean } | LoanFailureResult;

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

/** A fingerprint of the checked request: member, method, exact kobo, trimmed texts. */
function hashRequest(
  memberId: string,
  method: PaymentMethod,
  principal: Kobo,
  interestNote: string,
  notes: string,
): string {
  const canonical = JSON.stringify({ memberId, method, principal: principal.toString(), interestNote, notes });
  return createHash("sha256").update(canonical).digest("hex");
}

function toView(loan: LoanRecord, membershipId: string, expenseId: string): LoanView {
  return {
    id: loan.id,
    memberId: loan.memberId,
    membershipId,
    principal: koboToNairaString(loan.principal),
    interestNote: loan.interestNote,
    notes: loan.notes,
    expenseId,
    createdById: loan.createdById,
    createdAt: loan.createdAt.toISOString(),
  };
}

/** Raw values as they arrive from a request. Anything may be wrong; this code checks it. */
export interface NewLoanInput {
  idempotencyKey?: unknown;
  memberId?: unknown;
  principal?: unknown;
  method?: unknown;
  interestNote?: unknown;
  notes?: unknown;
}

/**
 * Gives a loan to a member: saves the loan, its one Loan expense (DR-10) and one audit entry
 * "loan.disbursed".
 * Order: permission, idempotency key shape, member id, method, principal (a naira string above
 * ₦0), interest note and notes, then one transaction: look the key up (a repeat returns the first
 * loan, a different request with the same key is refused), find the member, check who may see
 * it, check it is Active (A-147), check it has no active loan (DR-08), save the loan with its key,
 * save the expense, write the audit entry. Staff may give loans only to members they recorded
 * (A-147); other members answer not_found. If any write fails, nothing is saved (D-45). A refused
 * request does not use up the key (as D-48).
 */
export async function disburseLoan(
  store: Store,
  actor: LoanActor,
  input: NewLoanInput,
): Promise<LoanResult> {
  if (!hasPermission(actor.subject, "loans.disburse")) return failure("forbidden");

  const key = input.idempotencyKey;
  if (key === undefined) return failure("invalid_input", "missing_idempotency_key");
  if (typeof key !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return failure("invalid_input", "invalid_idempotency_key");
  }

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
  const requestHash = hashRequest(memberId, method, principal, interestNote.value, notes.value);

  const attempt = (): Promise<LoanResult> =>
    store.transaction<LoanResult>(async (tx) => {
      const existing = await tx.loans.findByKey(actor.id, key);
      if (existing !== null) {
        if (existing.requestHash !== requestHash) return failure("idempotency_conflict");
        // A repeat returns what was saved, even if the member is now Inactive or the loan repaid.
        const original = await tx.members.findById(existing.memberId);
        if (original === null) throw new Error("The member of a saved loan is missing");
        const expense = (await tx.expenses.list({ createdById: existing.createdById })).find(
          (e) => e.loanId === existing.id,
        );
        if (expense === undefined) throw new Error("The Loan expense of a saved loan is missing");
        return { ok: true, value: toView(existing, original.membershipId, expense.id), replayed: true };
      }

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
        idempotencyKey: key,
        requestHash,
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
      return { ok: true, value: toView(loan, member.membershipId, expense.id), replayed: false };
    });

  try {
    return await attempt();
  } catch (e) {
    // Another request with the same key was saved between our lookup and our save. Our
    // transaction was undone, so one more attempt finds the first loan (as A-121).
    if (e instanceof DuplicateLoanKeyError) return attempt();
    throw e;
  }
}

/** ACTIVE while anything is outstanding, FULLY_REPAID at ₦0 (DR-08). */
export type LoanStatus = "ACTIVE" | "FULLY_REPAID";

/** A loan in a list, with what is worked out on read (A-144). Amounts as in LoanView. */
export interface LoanListView extends LoanView {
  repaid: string;
  outstanding: string;
  status: LoanStatus;
}

export interface LoanListInput {
  memberId?: unknown;
}

export type LoanListResult = { ok: true; value: LoanListView[] } | LoanFailureResult;

/**
 * The loans of one member, oldest first (step 5.6), Fully Repaid ones too. Read only: nothing is
 * written, not even an audit entry (as A-134).
 * Order: permission (loans.view), member id, find the member, check who may see it. Staff see
 * the loans of members they recorded, whoever gave the loan (A-133, A-147). An unknown member and
 * a member Staff may not see both answer not_found. An Inactive member's loans are listed too.
 */
export async function listLoans(
  store: Store,
  actor: LoanActor,
  input: LoanListInput,
): Promise<LoanListResult> {
  if (!hasPermission(actor.subject, "loans.view")) return failure("forbidden");

  const memberId = input.memberId;
  if (memberId === undefined) return failure("invalid_input", "missing_member_id");
  if (typeof memberId !== "string" || memberId.length === 0) {
    return failure("invalid_input", "invalid_member_id");
  }

  const member = await store.members.findById(memberId);
  if (member === null) return failure("not_found");
  if (actor.subject.role !== "SUPER_ADMIN" && member.createdById !== actor.id) {
    return failure("not_found");
  }

  const loans = await store.loans.listByMember(member.id);
  if (loans.length === 0) return { ok: true, value: [] };
  const payments = await store.payments.listByMember(member.id);
  // The Loan expense of each loan, looked up by the users who gave the loans.
  const expenseIds = new Map<string, string>();
  for (const creatorId of new Set(loans.map((l) => l.createdById))) {
    for (const e of await store.expenses.list({ createdById: creatorId })) {
      if (e.loanId !== null) expenseIds.set(e.loanId, e.id);
    }
  }

  const value = loans.map((loan): LoanListView => {
    const expenseId = expenseIds.get(loan.id);
    if (expenseId === undefined) throw new Error("The Loan expense of a saved loan is missing");
    const outstanding = loanOutstanding(loan, payments);
    return {
      ...toView(loan, member.membershipId, expenseId),
      repaid: koboToNairaString(loan.principal - outstanding),
      outstanding: koboToNairaString(outstanding),
      status: outstanding > 0n ? "ACTIVE" : "FULLY_REPAID",
    };
  });
  return { ok: true, value };
}
