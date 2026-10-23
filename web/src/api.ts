// API client for the auth routes (server/src/auth-routes.ts), the member routes
// (server/src/members-routes.ts, U.3d), the payment and loan lists (U.3f), recording a payment
// (server/src/payments-routes.ts, U.4d), giving a loan (server/src/loans-routes.ts, U.5b), the
// expense calls (server/src/expenses-routes.ts: list U.6c, record U.6d, edit and delete U.6e) and
// paying a member out (server/src/payoffs-routes.ts, U.7a), reactivating a member (U.7b) and the
// staff list and add staff (server/src/staff-routes.ts, U.8a) and a staff account's permissions
// (U.8b). Tokens travel in the JSON body
// and the Authorization header, never in the URL. Never log a body, a token or a password.
// A 401 on a signed-in call triggers one refresh and one retry; a refused refresh signs out.
// Amounts arrive as naira strings (A-18) and are kept as strings; this file does no money sums.
// The payment form's breakdown check sums whole kobo as BigInt (Members.tsx, A-209).

import { API_PREFIX } from "./api-proxy.ts";
import type { SessionKeeper } from "./session.ts";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface Me {
  user: User;
  permissions: string[];
}

export type LoginResult =
  | { ok: true; me: Me }
  | { ok: false; reason: "invalid_credentials" | "network" | "server" };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong_password" | "invalid_input" | "signed_out" | "network" | "server" };

/** A member as GET /members and GET /members/:id send it (MemberView in server/src/members.ts). */
export interface Member {
  id: string;
  membershipId: string;
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
  status: "ACTIVE" | "INACTIVE";
  createdById: string;
  createdAt: string;
}

export interface NewMember {
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
}

/** GET /members/:id/balances (D-86). Amounts are naira strings such as "25000.05". */
export interface MemberBalances {
  memberId: string;
  categories: { category: string; balance: string; refundable: boolean }[];
  refundableTotal: string;
  nonRefundableTotal: string;
}

export type PaymentMethod = "CASH" | "BANK_TRANSFER";

/** A payment as GET /payments?memberId= sends it (PaymentView in server/src/payments.ts). */
export interface Payment {
  id: string;
  memberId: string;
  membershipId: string;
  method: PaymentMethod;
  total: string;
  /** The day the member paid, "YYYY-MM-DD" in Lagos (D-87). */
  paidOn: string;
  lines: { category: string; amount: string }[];
  createdById: string;
  createdAt: string;
}

/** The body of POST /payments plus its Idempotency-Key header. Amounts are naira strings (A-18). */
export interface NewPayment {
  /** Made by the caller once per payment attempt; a retry sends the same key (D-46). */
  idempotencyKey: string;
  memberId: string;
  method: PaymentMethod;
  paidOn: string;
  total: string;
  lines: { category: string; amount: string }[];
  sendSms: boolean;
}

/** The sms part of the POST /payments reply (SmsOutcome in server/src/payment-sms.ts). */
export type SmsOutcome =
  | { status: "not_requested" }
  | { status: "skipped_repeat" }
  | { status: "sent" }
  | { status: "failed"; reason: "invalid_number" | "invalid_message" | "provider_error" };

/** The 409 answers of POST /payments (PaymentFailure in server/src/payments.ts). */
export type PaymentConflict =
  | "member_inactive"
  | "idempotency_conflict"
  | "no_active_loan"
  | "loan_overpayment";

/** A loan as POST /loans sends it (LoanView in server/src/loans.ts). */
export interface GivenLoan {
  id: string;
  memberId: string;
  membershipId: string;
  principal: string;
  interestNote: string;
  notes: string;
  /** The day the loan was given, "YYYY-MM-DD" in Lagos (D-91). */
  givenOn: string;
  expenseId: string;
  createdById: string;
  createdAt: string;
}

/** A loan as GET /loans?memberId= sends it (LoanListView in server/src/loans.ts). */
export interface Loan extends GivenLoan {
  repaid: string;
  outstanding: string;
  status: "ACTIVE" | "FULLY_REPAID";
}

/** The body of POST /loans plus its Idempotency-Key header. The principal is a naira string (A-18). */
export interface NewLoan {
  /** Made by the caller once per loan attempt; a retry sends the same key (D-60). */
  idempotencyKey: string;
  memberId: string;
  method: PaymentMethod;
  givenOn: string;
  principal: string;
  interestNote: string;
  notes: string;
}

/** The 409 answers of POST /loans (LoanFailure in server/src/loans.ts). */
export type LoanConflict = "member_inactive" | "active_loan" | "idempotency_conflict";

/** An expense as GET /expenses sends it (ExpenseView in server/src/expenses.ts). */
export interface Expense {
  id: string;
  category: string;
  amount: string;
  method: PaymentMethod;
  /** The day the money left, "YYYY-MM-DD" in Lagos (D-92). */
  spentOn: string;
  description: string;
  narration: string;
  createdById: string;
  createdAt: string;
}

/** The body of POST /expenses plus its Idempotency-Key header. The amount is a naira string (A-18). */
export interface NewExpense {
  /** Made by the caller once per expense attempt; a retry sends the same key (D-65). */
  idempotencyKey: string;
  category: string;
  method: PaymentMethod;
  spentOn: string;
  amount: string;
  description: string;
  narration: string;
}

/** The body of PUT /expenses/:id: every field again (A-177). No key: the same edit sent twice is the same. */
export type ExpenseEdit = Omit<NewExpense, "idempotencyKey">;

/** The query of GET /expenses (D-94). A field left out is not filtered on. */
export interface ExpenseFilter {
  category?: string;
  method?: PaymentMethod;
  /** First day spent, "YYYY-MM-DD", included. */
  fromDay?: string;
  /** Last day spent, "YYYY-MM-DD", included. */
  toDay?: string;
}

/** GET /expenses: oldest first by day spent, and the server's sum of the listed amounts. */
export interface ExpenseList {
  expenses: Expense[];
  total: string;
}

/** A pay-off as POST /payoffs sends it (PayOffView in server/src/payoffs.ts). */
export interface PayOff {
  id: string;
  memberId: string;
  membershipId: string;
  method: PaymentMethod;
  total: string;
  /** One line per refundable category paid out (DR-05). */
  lines: { category: string; amount: string }[];
  /** The Membership Withdrawal expense saved with the pay-off. */
  expenseId: string;
  createdById: string;
  createdAt: string;
}

/**
 * The body of POST /payoffs plus its Idempotency-Key header. total is the payout the user saw and
 * confirmed, a naira string; the server refuses it if the balances changed since (A-185).
 */
export interface NewPayOff {
  /** Made by the caller once per pay-off attempt; a retry sends the same key (D-76). */
  idempotencyKey: string;
  memberId: string;
  method: PaymentMethod;
  total: string;
}

/** The 409 answers of POST /payoffs (PayOffFailure in server/src/payoffs.ts). */
export type PayOffConflict =
  | "member_inactive"
  | "active_loan"
  | "nothing_to_pay_off"
  | "payout_changed"
  | "idempotency_conflict";

/** A staff account as GET /staff and POST /staff send it (StaffView in server/src/staff.ts). */
export interface StaffAccount {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
}

/** The body of POST /staff. The password is sent as typed and never kept by this file. */
export interface NewStaff {
  displayName: string;
  email: string;
  password: string;
  permissions: string[];
}

export type MemberStatusFilter = "active" | "inactive" | "all";

/** "signed_out": the session is gone (onSignedOut was called). "server": any other answer. */
export type CallFailure =
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "signed_out"
  | "network"
  | "server";

export type CallResult<T> = { ok: true; value: T } | { ok: false; reason: CallFailure };

/**
 * replayed: the key had been used and the server sent back the first payment.
 * code and lineIndex come with invalid_input when the server names the check that failed.
 */
export type CreatePaymentResult =
  | { ok: true; payment: Payment; replayed: boolean; sms: SmsOutcome }
  | { ok: false; reason: CallFailure | PaymentConflict; code?: string; lineIndex?: number };

/** replayed: the key had been used and the server sent back the first loan. */
export type CreateLoanResult =
  | { ok: true; loan: GivenLoan; replayed: boolean }
  | { ok: false; reason: CallFailure | LoanConflict; code?: string };

/** replayed: the key had been used and the server sent back the first expense. */
export type CreateExpenseResult =
  | { ok: true; expense: Expense; replayed: boolean }
  | { ok: false; reason: CallFailure | "idempotency_conflict"; code?: string };

/** code comes with not_editable ("loan_linked", "pay_off") and with invalid_input. */
export type UpdateExpenseResult =
  | { ok: true; expense: Expense }
  | { ok: false; reason: CallFailure | "not_editable"; code?: string };

/** code comes with not_deletable ("loan_linked", "pay_off"). */
export type DeleteExpenseResult =
  | { ok: true }
  | { ok: false; reason: CallFailure | "not_deletable"; code?: string };

/** replayed: the key had been used and the server sent back the first pay-off. */
export type CreatePayOffResult =
  | { ok: true; payOff: PayOff; replayed: boolean }
  | { ok: false; reason: CallFailure | PayOffConflict; code?: string };

/** already_active: the member was Active already, nothing saved (D-80). */
export type ReactivateMemberResult =
  | { ok: true; member: Member }
  | { ok: false; reason: CallFailure | "already_active" };

/** email_taken: another account has this email, nothing saved (staff.ts). */
export type CreateStaffResult =
  | { ok: true; staff: StaffAccount }
  | { ok: false; reason: CallFailure | "email_taken" };

/** "rejected": the server refused the refresh token. "failed": no answer or an odd answer. */
type RefreshOutcome = "ok" | "rejected" | "failed";

export type RefreshLock = <T>(run: () => Promise<T>) => Promise<T>;

export const REFRESH_LOCK_NAME = "iyanu.refresh";

/** The part of the LockManager interface we use, so tests can pass a fake. */
export interface LockRequester {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * A Web Lock shared by every tab of this origin. The refresh token is shared through
 * localStorage and the server revokes the whole session when a used token comes back, so two
 * tabs must never refresh at once. Without Web Locks (no secure context) the refresh runs at once.
 */
export function browserRefreshLock(
  locks: LockRequester | undefined = globalThis.navigator?.locks,
): RefreshLock {
  if (locks === undefined) return (run) => run();
  return (run) => locks.request(REFRESH_LOCK_NAME, run);
}

export interface ApiDeps {
  fetch: typeof fetch;
  keeper: SessionKeeper;
  /** Runs a refresh so that no other tab refreshes at the same time. Default: runs it now. */
  lock?: RefreshLock;
  /** Called when a signed-in call finds the session gone (refresh refused). */
  onSignedOut?: () => void;
  base?: string;
}

export interface Api {
  login(email: string, password: string): Promise<LoginResult>;
  /** Signs in again from the stored refresh token, if any. Null if there is no session. */
  restore(): Promise<Me | null>;
  me(): Promise<Me | null>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult>;
  listMembers(status: MemberStatusFilter): Promise<CallResult<Member[]>>;
  getMember(id: string): Promise<CallResult<Member>>;
  createMember(input: NewMember): Promise<CallResult<Member>>;
  memberBalances(id: string): Promise<CallResult<MemberBalances>>;
  listPayments(memberId: string): Promise<CallResult<Payment[]>>;
  createPayment(input: NewPayment): Promise<CreatePaymentResult>;
  listLoans(memberId: string): Promise<CallResult<Loan[]>>;
  createLoan(input: NewLoan): Promise<CreateLoanResult>;
  listExpenses(filter: ExpenseFilter): Promise<CallResult<ExpenseList>>;
  createExpense(input: NewExpense): Promise<CreateExpenseResult>;
  updateExpense(id: string, input: ExpenseEdit): Promise<UpdateExpenseResult>;
  deleteExpense(id: string): Promise<DeleteExpenseResult>;
  createPayOff(input: NewPayOff): Promise<CreatePayOffResult>;
  reactivateMember(id: string): Promise<ReactivateMemberResult>;
  listStaff(): Promise<CallResult<StaffAccount[]>>;
  createStaff(input: NewStaff): Promise<CreateStaffResult>;
  setStaffPermissions(id: string, permissions: string[]): Promise<CallResult<StaffAccount>>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokensOf(body: unknown): { accessToken: string; refreshToken: string } | null {
  if (!isObject(body)) return null;
  const { accessToken, refreshToken } = body;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return null;
  return { accessToken, refreshToken };
}

function meOf(body: unknown): Me | null {
  if (!isObject(body) || !isObject(body["user"]) || !Array.isArray(body["permissions"])) {
    return null;
  }
  const user = body["user"];
  const { id, email, displayName, role } = user;
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof displayName !== "string" ||
    typeof role !== "string"
  ) {
    return null;
  }
  const permissions = body["permissions"].filter((p): p is string => typeof p === "string");
  return { user: { id, email, displayName, role }, permissions };
}

const MEMBER_TEXT_FIELDS = [
  "id",
  "membershipId",
  "fullName",
  "phone",
  "address",
  "occupation",
  "createdById",
  "createdAt",
] as const;

function memberOf(value: unknown): Member | null {
  if (!isObject(value)) return null;
  for (const field of MEMBER_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const status = value["status"];
  if (status !== "ACTIVE" && status !== "INACTIVE") return null;
  const v = value as Record<(typeof MEMBER_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    membershipId: v.membershipId,
    fullName: v.fullName,
    phone: v.phone,
    address: v.address,
    occupation: v.occupation,
    status,
    createdById: v.createdById,
    createdAt: v.createdAt,
  };
}

/** Naira as koboToNairaString (server/src/payments.ts) writes it: never negative, two decimals. */
const NAIRA = /^\d+\.\d{2}$/;

function balancesOf(value: unknown): MemberBalances | null {
  if (!isObject(value) || !Array.isArray(value["categories"])) return null;
  const { memberId, refundableTotal, nonRefundableTotal } = value;
  if (
    typeof memberId !== "string" ||
    typeof refundableTotal !== "string" ||
    typeof nonRefundableTotal !== "string" ||
    !NAIRA.test(refundableTotal) ||
    !NAIRA.test(nonRefundableTotal)
  ) {
    return null;
  }
  const categories: MemberBalances["categories"] = [];
  for (const row of value["categories"]) {
    if (!isObject(row)) return null;
    const { category, balance, refundable } = row;
    if (
      typeof category !== "string" ||
      typeof balance !== "string" ||
      !NAIRA.test(balance) ||
      typeof refundable !== "boolean"
    ) {
      return null;
    }
    categories.push({ category, balance, refundable });
  }
  return { memberId, categories, refundableTotal, nonRefundableTotal };
}

const PAYMENT_TEXT_FIELDS = ["id", "memberId", "membershipId", "createdById", "createdAt"] as const;

/** The shape of a day as the server writes it; the server checks that it is a real day. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function paymentOf(value: unknown): Payment | null {
  if (!isObject(value) || !Array.isArray(value["lines"])) return null;
  for (const field of PAYMENT_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const { method, total } = value;
  if (method !== "CASH" && method !== "BANK_TRANSFER") return null;
  if (typeof total !== "string" || !NAIRA.test(total)) return null;
  const paidOn = value["paidOn"];
  if (typeof paidOn !== "string" || !DAY.test(paidOn)) return null;
  const lines: Payment["lines"] = [];
  for (const line of value["lines"]) {
    if (!isObject(line)) return null;
    const { category, amount } = line;
    if (typeof category !== "string" || typeof amount !== "string" || !NAIRA.test(amount)) {
      return null;
    }
    lines.push({ category, amount });
  }
  const v = value as Record<(typeof PAYMENT_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    memberId: v.memberId,
    membershipId: v.membershipId,
    method,
    total,
    paidOn,
    lines,
    createdById: v.createdById,
    createdAt: v.createdAt,
  };
}

const LOAN_TEXT_FIELDS = [
  "id",
  "memberId",
  "membershipId",
  "interestNote",
  "notes",
  "expenseId",
  "createdById",
  "createdAt",
] as const;

function givenLoanOf(value: unknown): GivenLoan | null {
  if (!isObject(value)) return null;
  for (const field of LOAN_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const { principal, givenOn } = value;
  if (typeof principal !== "string" || !NAIRA.test(principal)) return null;
  if (typeof givenOn !== "string" || !DAY.test(givenOn)) return null;
  const v = value as Record<(typeof LOAN_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    memberId: v.memberId,
    membershipId: v.membershipId,
    principal,
    interestNote: v.interestNote,
    notes: v.notes,
    givenOn,
    expenseId: v.expenseId,
    createdById: v.createdById,
    createdAt: v.createdAt,
  };
}

function loanOf(value: unknown): Loan | null {
  const loan = givenLoanOf(value);
  if (loan === null || !isObject(value)) return null;
  const { repaid, outstanding, status } = value;
  if (typeof repaid !== "string" || !NAIRA.test(repaid)) return null;
  if (typeof outstanding !== "string" || !NAIRA.test(outstanding)) return null;
  if (status !== "ACTIVE" && status !== "FULLY_REPAID") return null;
  return { ...loan, repaid, outstanding, status };
}

const EXPENSE_TEXT_FIELDS = [
  "id",
  "category",
  "description",
  "narration",
  "createdById",
  "createdAt",
] as const;

function expenseOf(value: unknown): Expense | null {
  if (!isObject(value)) return null;
  for (const field of EXPENSE_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const { amount, method, spentOn } = value;
  if (typeof amount !== "string" || !NAIRA.test(amount)) return null;
  if (method !== "CASH" && method !== "BANK_TRANSFER") return null;
  if (typeof spentOn !== "string" || !DAY.test(spentOn)) return null;
  const v = value as Record<(typeof EXPENSE_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    category: v.category,
    amount,
    method,
    spentOn,
    description: v.description,
    narration: v.narration,
    createdById: v.createdById,
    createdAt: v.createdAt,
  };
}

const PAY_OFF_TEXT_FIELDS = ["id", "memberId", "membershipId", "expenseId", "createdById", "createdAt"] as const;

function payOffOf(value: unknown): PayOff | null {
  if (!isObject(value) || !Array.isArray(value["lines"])) return null;
  for (const field of PAY_OFF_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const { method, total } = value;
  if (method !== "CASH" && method !== "BANK_TRANSFER") return null;
  if (typeof total !== "string" || !NAIRA.test(total)) return null;
  const lines: PayOff["lines"] = [];
  for (const line of value["lines"]) {
    if (!isObject(line)) return null;
    const { category, amount } = line;
    if (typeof category !== "string" || typeof amount !== "string" || !NAIRA.test(amount)) {
      return null;
    }
    lines.push({ category, amount });
  }
  const v = value as Record<(typeof PAY_OFF_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    memberId: v.memberId,
    membershipId: v.membershipId,
    method,
    total,
    lines,
    expenseId: v.expenseId,
    createdById: v.createdById,
    createdAt: v.createdAt,
  };
}

const STAFF_TEXT_FIELDS = ["id", "email", "displayName", "role", "createdAt"] as const;

function staffOf(value: unknown): StaffAccount | null {
  if (!isObject(value) || !Array.isArray(value["permissions"])) return null;
  for (const field of STAFF_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const { isActive } = value;
  if (typeof isActive !== "boolean") return null;
  const permissions: string[] = [];
  for (const permission of value["permissions"]) {
    if (typeof permission !== "string") return null;
    permissions.push(permission);
  }
  const v = value as Record<(typeof STAFF_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    email: v.email,
    displayName: v.displayName,
    role: v.role,
    isActive,
    permissions,
    createdAt: v.createdAt,
  };
}

/** The query string for GET /expenses, fields in a fixed order, each value made safe. */
function expenseQuery(filter: ExpenseFilter): string {
  const parts: string[] = [];
  for (const name of ["category", "method", "fromDay", "toDay"] as const) {
    const value = filter[name];
    if (value !== undefined) parts.push(`${name}=${encodeURIComponent(value)}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

/** Every item read by `read`, or null if any one is of the wrong shape. */
function listOf<T>(read: (value: unknown) => T | null): (value: unknown) => T[] | null {
  return (value) => {
    if (!Array.isArray(value)) return null;
    const items: T[] = [];
    for (const item of value) {
      const parsed = read(item);
      if (parsed === null) return null;
      items.push(parsed);
    }
    return items;
  };
}

function failureOf(status: number): CallFailure {
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid_input";
  if (status === 404) return "not_found";
  return "server";
}

const SMS_FAILURES = ["invalid_number", "invalid_message", "provider_error"] as const;

function smsOf(value: unknown): SmsOutcome | null {
  if (!isObject(value)) return null;
  const { status, reason } = value;
  if (status === "not_requested" || status === "skipped_repeat" || status === "sent") {
    return { status };
  }
  if (status !== "failed") return null;
  const known = SMS_FAILURES.find((r) => r === reason);
  return known === undefined ? null : { status, reason: known };
}

const PAYMENT_CONFLICTS = [
  "member_inactive",
  "idempotency_conflict",
  "no_active_loan",
  "loan_overpayment",
] as const;

/** A refused POST /payments. A 409 with an error we do not know answers server. */
function paymentFailureOf(
  status: number,
  body: unknown,
): Extract<CreatePaymentResult, { ok: false }> {
  const reply = isObject(body) ? body : {};
  if (status === 409) {
    const conflict = PAYMENT_CONFLICTS.find((c) => c === reply["error"]);
    return { ok: false, reason: conflict ?? "server" };
  }
  if (status !== 400) return { ok: false, reason: failureOf(status) };
  const { code, lineIndex } = reply;
  return {
    ok: false,
    reason: "invalid_input",
    ...(typeof code === "string" ? { code } : {}),
    ...(Number.isInteger(lineIndex) && (lineIndex as number) >= 0
      ? { lineIndex: lineIndex as number }
      : {}),
  };
}

const LOAN_CONFLICTS = ["member_inactive", "active_loan", "idempotency_conflict"] as const;

/** A refused POST /loans. A 409 with an error we do not know answers server. */
function loanFailureOf(status: number, body: unknown): Extract<CreateLoanResult, { ok: false }> {
  const reply = isObject(body) ? body : {};
  if (status === 409) {
    const conflict = LOAN_CONFLICTS.find((c) => c === reply["error"]);
    return { ok: false, reason: conflict ?? "server" };
  }
  if (status !== 400) return { ok: false, reason: failureOf(status) };
  const { code } = reply;
  return { ok: false, reason: "invalid_input", ...(typeof code === "string" ? { code } : {}) };
}

const PAY_OFF_CONFLICTS = [
  "member_inactive",
  "active_loan",
  "nothing_to_pay_off",
  "payout_changed",
  "idempotency_conflict",
] as const;

/** A refused POST /payoffs. A 409 with an error we do not know answers server. */
function payOffFailureOf(status: number, body: unknown): Extract<CreatePayOffResult, { ok: false }> {
  const reply = isObject(body) ? body : {};
  if (status === 409) {
    const conflict = PAY_OFF_CONFLICTS.find((c) => c === reply["error"]);
    return { ok: false, reason: conflict ?? "server" };
  }
  if (status !== 400) return { ok: false, reason: failureOf(status) };
  const { code } = reply;
  return { ok: false, reason: "invalid_input", ...(typeof code === "string" ? { code } : {}) };
}

/** A refused POST /expenses. A 409 other than idempotency_conflict answers server. */
function expenseFailureOf(
  status: number,
  body: unknown,
): Extract<CreateExpenseResult, { ok: false }> {
  const reply = isObject(body) ? body : {};
  if (status === 409) {
    return { ok: false, reason: reply["error"] === "idempotency_conflict" ? "idempotency_conflict" : "server" };
  }
  if (status !== 400) return { ok: false, reason: failureOf(status) };
  const { code } = reply;
  return { ok: false, reason: "invalid_input", ...(typeof code === "string" ? { code } : {}) };
}

/**
 * A refused PUT or DELETE /expenses/:id. A 409 passes on only as `conflict` (not_editable or
 * not_deletable) with its code; any other 409 answers server.
 */
function expenseChangeFailureOf<C extends "not_editable" | "not_deletable">(
  status: number,
  body: unknown,
  conflict: C,
): { ok: false; reason: CallFailure | C; code?: string } {
  const reply = isObject(body) ? body : {};
  const { code } = reply;
  const withCode = typeof code === "string" ? { code } : {};
  if (status === 409) {
    return reply["error"] === conflict ? { ok: false, reason: conflict, ...withCode } : { ok: false, reason: "server" };
  }
  if (status !== 400) return { ok: false, reason: failureOf(status) };
  return { ok: false, reason: "invalid_input", ...withCode };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function createApi(deps: ApiDeps): Api {
  const base = deps.base ?? API_PREFIX;
  const { keeper } = deps;
  const lock = deps.lock ?? ((run) => run());
  let refreshing: Promise<RefreshOutcome> | null = null;

  function post(path: string, body: unknown): Promise<Response> {
    return deps.fetch(base + path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  }

  // Runs under the lock, so the stored token is read after any other tab has rotated it.
  async function doRefresh(): Promise<RefreshOutcome> {
    const refreshToken = keeper.refreshToken();
    if (refreshToken === null) return "rejected";
    let response: Response;
    try {
      response = await post("/refresh", { refreshToken });
    } catch {
      return "failed";
    }
    if (response.status === 401) {
      keeper.clear();
      return "rejected";
    }
    if (response.status !== 200) return "failed";
    const tokens = tokensOf(await readJson(response));
    if (tokens === null) return "failed";
    keeper.save(tokens);
    return "ok";
  }

  // One refresh at a time, in this tab and across tabs: the server rotates the refresh token,
  // so a second refresh with the old token would be read as reuse and end the session.
  function refresh(): Promise<RefreshOutcome> {
    refreshing ??= lock(doRefresh)
      .catch((): RefreshOutcome => "failed")
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  function signedOut(): void {
    keeper.clear();
    deps.onSignedOut?.();
  }

  /** A signed-in call. Null means the session is gone (onSignedOut was called). */
  async function authed(path: string, init: RequestInit = {}): Promise<Response | null> {
    const send = (token: string) =>
      deps.fetch(base + path, {
        ...init,
        headers: { ...JSON_HEADERS, ...init.headers, Authorization: `Bearer ${token}` },
      });

    let token = keeper.accessToken();
    if (token === null) {
      const outcome = await refresh();
      if (outcome === "rejected") {
        signedOut();
        return null;
      }
      token = keeper.accessToken();
      if (outcome !== "ok" || token === null) throw new Error("refresh_failed");
    }
    const first = await send(token);
    if (first.status !== 401) return first;

    const outcome = await refresh();
    if (outcome === "rejected") {
      signedOut();
      return null;
    }
    const next = keeper.accessToken();
    if (outcome !== "ok" || next === null) throw new Error("refresh_failed");
    const second = await send(next);
    if (second.status === 401) {
      signedOut();
      return null;
    }
    return second;
  }

  async function me(): Promise<Me | null> {
    const response = await authed("/me");
    if (response === null || response.status !== 200) return null;
    return meOf(await readJson(response));
  }

  /**
   * A signed-in call whose reply is read by `read` from the body's `key` field, or from the
   * whole body when `key` is null. `expected` is the success status; any other status maps
   * through failureOf.
   */
  async function call<T>(
    path: string,
    init: RequestInit,
    expected: number,
    key: string | null,
    read: (value: unknown) => T | null,
  ): Promise<CallResult<T>> {
    let response: Response | null;
    try {
      response = await authed(path, init);
    } catch {
      return { ok: false, reason: "network" };
    }
    if (response === null) return { ok: false, reason: "signed_out" };
    if (response.status !== expected) return { ok: false, reason: failureOf(response.status) };
    const body = await readJson(response);
    const value = isObject(body) ? read(key === null ? body : body[key]) : null;
    if (value === null) return { ok: false, reason: "server" };
    return { ok: true, value };
  }

  const memberPath = (id: string) => `/members/${encodeURIComponent(id)}`;
  const expensePath = (id: string) => `/expenses/${encodeURIComponent(id)}`;

  return {
    async login(email, password) {
      let response: Response;
      try {
        response = await post("/login", { email, password });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response.status === 401) return { ok: false, reason: "invalid_credentials" };
      if (response.status !== 200) return { ok: false, reason: "server" };
      const tokens = tokensOf(await readJson(response));
      if (tokens === null) return { ok: false, reason: "server" };
      keeper.save(tokens);
      try {
        const who = await me();
        if (who !== null) return { ok: true, me: who };
      } catch {
        // Fall through: treat as a server fault.
      }
      keeper.clear();
      return { ok: false, reason: "server" };
    },

    async restore() {
      if (keeper.refreshToken() === null) return null;
      const outcome = await refresh();
      if (outcome !== "ok") return null;
      try {
        return await me();
      } catch {
        return null;
      }
    },

    me,

    async logout() {
      const refreshToken = keeper.refreshToken();
      keeper.clear();
      if (refreshToken === null) return;
      try {
        await post("/logout", { refreshToken });
      } catch {
        // Signed out here anyway; the server token expires on its own.
      }
    },

    async changePassword(currentPassword, newPassword) {
      let response: Response | null;
      try {
        response = await authed("/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      if (response.status === 204) {
        // The server revoked every refresh token (D-36): sign in again.
        keeper.clear();
        return { ok: true };
      }
      if (response.status === 403) return { ok: false, reason: "wrong_password" };
      if (response.status === 400) return { ok: false, reason: "invalid_input" };
      return { ok: false, reason: "server" };
    },

    listMembers(status) {
      return call(`/members?status=${status}`, {}, 200, "members", (value) => {
        if (!Array.isArray(value)) return null;
        const members = value.map(memberOf);
        return members.every((m) => m !== null) ? (members as Member[]) : null;
      });
    },

    getMember(id) {
      return call(memberPath(id), {}, 200, "member", memberOf);
    },

    createMember(input) {
      return call(
        "/members",
        { method: "POST", body: JSON.stringify(input) },
        201,
        "member",
        memberOf,
      );
    },

    memberBalances(id) {
      return call(`${memberPath(id)}/balances`, {}, 200, "balances", balancesOf);
    },

    listPayments(memberId) {
      const query = `?memberId=${encodeURIComponent(memberId)}`;
      return call(`/payments${query}`, {}, 200, "payments", listOf(paymentOf));
    },

    async createPayment(input) {
      const { idempotencyKey, ...body } = input;
      let response: Response | null;
      try {
        response = await authed("/payments", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status !== 201) return paymentFailureOf(response.status, reply);
      const payment = isObject(reply) ? paymentOf(reply["payment"]) : null;
      const sms = isObject(reply) ? smsOf(reply["sms"]) : null;
      if (payment === null || sms === null) return { ok: false, reason: "server" };
      const replayed = response.headers.get("Idempotent-Replayed") === "true";
      return { ok: true, payment, replayed, sms };
    },

    listLoans(memberId) {
      const query = `?memberId=${encodeURIComponent(memberId)}`;
      return call(`/loans${query}`, {}, 200, "loans", listOf(loanOf));
    },

    async createLoan(input) {
      const { idempotencyKey, ...body } = input;
      let response: Response | null;
      try {
        response = await authed("/loans", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status !== 201) return loanFailureOf(response.status, reply);
      const loan = isObject(reply) ? givenLoanOf(reply["loan"]) : null;
      if (loan === null) return { ok: false, reason: "server" };
      const replayed = response.headers.get("Idempotent-Replayed") === "true";
      return { ok: true, loan, replayed };
    },

    listExpenses(filter) {
      return call(`/expenses${expenseQuery(filter)}`, {}, 200, null, (value) => {
        if (!isObject(value)) return null;
        const expenses = listOf(expenseOf)(value["expenses"]);
        const { total } = value;
        if (expenses === null || typeof total !== "string" || !NAIRA.test(total)) return null;
        return { expenses, total };
      });
    },

    async createExpense(input) {
      const { idempotencyKey, ...body } = input;
      let response: Response | null;
      try {
        response = await authed("/expenses", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status !== 201) return expenseFailureOf(response.status, reply);
      const expense = isObject(reply) ? expenseOf(reply["expense"]) : null;
      if (expense === null) return { ok: false, reason: "server" };
      const replayed = response.headers.get("Idempotent-Replayed") === "true";
      return { ok: true, expense, replayed };
    },

    async updateExpense(id, input) {
      let response: Response | null;
      try {
        response = await authed(expensePath(id), { method: "PUT", body: JSON.stringify(input) });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status !== 200) return expenseChangeFailureOf(response.status, reply, "not_editable");
      const expense = isObject(reply) ? expenseOf(reply["expense"]) : null;
      if (expense === null) return { ok: false, reason: "server" };
      return { ok: true, expense };
    },

    async deleteExpense(id) {
      let response: Response | null;
      try {
        response = await authed(expensePath(id), { method: "DELETE" });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      if (response.status === 204) return { ok: true };
      return expenseChangeFailureOf(response.status, await readJson(response), "not_deletable");
    },

    async createPayOff(input) {
      const { idempotencyKey, ...body } = input;
      let response: Response | null;
      try {
        response = await authed("/payoffs", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status !== 201) return payOffFailureOf(response.status, reply);
      const payOff = isObject(reply) ? payOffOf(reply["payOff"]) : null;
      if (payOff === null) return { ok: false, reason: "server" };
      const replayed = response.headers.get("Idempotent-Replayed") === "true";
      return { ok: true, payOff, replayed };
    },

    // No body and no key: reactivation moves no money, and a repeat answers already_active (D-80).
    async reactivateMember(id) {
      let response: Response | null;
      try {
        response = await authed(`${memberPath(id)}/reactivate`, { method: "POST" });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status === 409) {
        const known = isObject(reply) && reply["error"] === "already_active";
        return { ok: false, reason: known ? "already_active" : "server" };
      }
      if (response.status !== 200) return { ok: false, reason: failureOf(response.status) };
      const member = isObject(reply) ? memberOf(reply["member"]) : null;
      if (member === null) return { ok: false, reason: "server" };
      return { ok: true, member };
    },

    listStaff() {
      return call("/staff", {}, 200, "staff", listOf(staffOf));
    },

    // No key: a second POST with the same email answers email_taken, so no account is made twice.
    async createStaff(input) {
      let response: Response | null;
      try {
        response = await authed("/staff", { method: "POST", body: JSON.stringify(input) });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      const reply = await readJson(response);
      if (response.status === 409) {
        const known = isObject(reply) && reply["error"] === "email_taken";
        return { ok: false, reason: known ? "email_taken" : "server" };
      }
      if (response.status !== 201) return { ok: false, reason: failureOf(response.status) };
      const staff = isObject(reply) ? staffOf(reply["staff"]) : null;
      if (staff === null) return { ok: false, reason: "server" };
      return { ok: true, staff };
    },

    // No key: the whole list replaces the old one, so the same request sent twice is the same.
    setStaffPermissions(id, permissions) {
      return call(
        `/staff/${encodeURIComponent(id)}/permissions`,
        { method: "PUT", body: JSON.stringify({ permissions }) },
        200,
        "staff",
        staffOf,
      );
    },
  };
}
