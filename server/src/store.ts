// Storage interface. Logic code talks to this, never to Prisma directly.
// Two adapters implement it: prisma-store.ts (real) and memory-store.ts (tests).
// Both must pass the same contract tests (test/helpers/store-contract.ts).

export type Role = "SUPER_ADMIN" | "STAFF";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  /**
   * Permission names granted to a Staff user (D-34). Stored as given: the logic code cleans the
   * list before saving, and hasPermission checks every name against the table on every call (A-27).
   */
  permissions: string[];
  createdAt: Date;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string;
  role?: Role;
  /** Defaults to an empty list. */
  permissions?: readonly string[];
}

/** Sign-in lockout state of one user (D-30). Kept apart from UserRecord on purpose. */
export interface LockoutState {
  /** Failed sign-ins in a row. Reset by a correct password or when a lock has expired. */
  failedCount: number;
  /** While this is in the future, the user cannot sign in. Null when not locked. */
  lockedUntil: Date | null;
}

export interface AuditRecord {
  id: string;
  createdAt: Date;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
}

export interface NewAuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
}

/**
 * A stored refresh token. Only the SHA-256 hash of the token is kept, never the token (A-33).
 * Tokens made by one sign-in and its rotations share a familyId.
 */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  /** Set once, when the token is exchanged for a new one. */
  usedAt: Date | null;
  /** Set when the token (or its whole family) is cancelled. */
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A user with email ${email} already exists`);
    this.name = "DuplicateEmailError";
  }
}

export class UnknownActorError extends Error {
  constructor(actorId: string) {
    super(`No user with id ${actorId}`);
    this.name = "UnknownActorError";
  }
}

export class UnknownUserError extends Error {
  constructor(userId: string) {
    super(`No user with id ${userId}`);
    this.name = "UnknownUserError";
  }
}

export class DuplicateTokenHashError extends Error {
  constructor() {
    super("A refresh token with this hash already exists");
    this.name = "DuplicateTokenHashError";
  }
}

export interface UserStore {
  /** Throws DuplicateEmailError if the email is taken. Email match is exact (case-sensitive). */
  create(input: NewUser): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Every user (any role, active or not), oldest first. Ties are in no fixed order. */
  list(): Promise<UserRecord[]>;
  /**
   * Replaces the stored permission list of a user. Returns false if there is no such user.
   * The list is saved exactly as given (cleaning is the logic code's job).
   */
  setPermissions(userId: string, permissions: readonly string[]): Promise<boolean>;
  /**
   * Sets isActive. Returns false if there is no such user. It does not touch tokens or the
   * lockout state: ending sessions is the logic code's job (staff.ts).
   */
  setActive(userId: string, isActive: boolean): Promise<boolean>;
  /**
   * Replaces the stored password hash of a user. Returns false if there is no such user.
   * The caller passes a finished hash, never a password. It does not touch tokens or the
   * lockout state: ending sessions and clearing the lockout are the logic code's job
   * (account.ts, staff.ts).
   */
  setPasswordHash(userId: string, passwordHash: string): Promise<boolean>;
  /** True if any user has role SUPER_ADMIN, active or not. Staff do not count. */
  hasSuperAdmin(): Promise<boolean>;
  /**
   * The lockout state of a user, or null if there is no such user.
   * A lock that has expired is still reported as stored: the caller compares lockedUntil with its clock.
   */
  getLockout(userId: string): Promise<LockoutState | null>;
  /**
   * Counts one failed sign-in and returns the new state. Throws UnknownUserError for an unknown user.
   * - A lock that has expired (lockedUntil <= now) is cleared first, so counting starts again at 1.
   * - While locked (lockedUntil > now) nothing changes.
   * - When the count reaches maxFailures, lockedUntil becomes now + lockSeconds.
   */
  recordFailedLogin(
    userId: string,
    now: Date,
    maxFailures: number,
    lockSeconds: number,
  ): Promise<LockoutState>;
  /** Sets the count to 0 and removes any lock. Does nothing for an unknown user. */
  clearLockout(userId: string): Promise<void>;
}

/** What to list from the audit log. Filters match exactly (letter case counts). */
export interface AuditListQuery {
  actorId?: string;
  action?: string;
  /** At most this many entries. A whole number, at least 1. The logic code checks it. */
  limit: number;
  /** Skip this many of the newest matching entries. A whole number, at least 0. */
  offset: number;
}

export interface AuditStore {
  /** Throws UnknownActorError if actorId is given but no such user exists. */
  append(entry: NewAuditEntry): Promise<AuditRecord>;
  /** Entries by one actor. Order is not guaranteed yet. */
  listByActor(actorId: string): Promise<AuditRecord[]>;
  /**
   * Entries newest first (by createdAt; entries with equal times are in no fixed order),
   * narrowed by the exact filters in the query. Entries with no actor are included unless
   * actorId is given. Returns copies.
   */
  list(query: AuditListQuery): Promise<AuditRecord[]>;
}

export interface RefreshTokenStore {
  /**
   * Saves a new, unused, unrevoked token record.
   * Throws UnknownUserError if the user does not exist, DuplicateTokenHashError if the hash is taken.
   */
  create(input: NewRefreshToken): Promise<RefreshTokenRecord>;
  /** Exact match on the stored hash. Returns the record whatever its state (used, revoked, expired). */
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Marks a token used, once. Returns true only if the token exists, is not used, is not revoked
   * and `now` is before its expiry (a token is expired at its expiry instant). It is one atomic
   * step, so two callers racing on one token get exactly one true.
   */
  consume(id: string, now: Date): Promise<boolean>;
  /** Revokes every not-yet-revoked token of one family (used or not). Returns how many changed. */
  revokeFamily(familyId: string, now: Date): Promise<number>;
  /** Revokes every not-yet-revoked token of one user. Returns how many changed. */
  revokeAllForUser(userId: string, now: Date): Promise<number>;
}

export type MemberStatus = "ACTIVE" | "INACTIVE";

/** A cooperative member. Balances are not stored here: they are derived later (D-17). */
export interface MemberRecord {
  id: string;
  /** IO-001, IO-002 and so on. Made from the member's number and never reused. */
  membershipId: string;
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
  status: MemberStatus;
  /** The user who recorded the member. DR-13 uses it to decide who sees the member (DR-15: the actor). */
  createdById: string;
  createdAt: Date;
}

export interface NewMember {
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
  createdById: string;
}

/** What to list. Filters match exactly. No filter means all members. */
export interface MemberListQuery {
  createdById?: string;
  status?: MemberStatus;
}

/** 1 gives "IO-001", 1000 gives "IO-1000". Throws RangeError unless n is a whole number of at least 1. */
export function formatMembershipId(n: number): string {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError("A membership number must be a whole number of at least 1.");
  }
  return `IO-${String(n).padStart(3, "0")}`;
}

export interface MemberStore {
  /**
   * Saves a new ACTIVE member with the next Membership ID. Throws UnknownActorError if createdById
   * is not a user. Text is saved exactly as given (cleaning is the logic code's job).
   */
  create(input: NewMember): Promise<MemberRecord>;
  findById(id: string): Promise<MemberRecord | null>;
  /** Members in Membership ID order, oldest first, narrowed by the exact filters. Returns copies. */
  list(query: MemberListQuery): Promise<MemberRecord[]>;
  /** Sets the status. Returns false if there is no such member. */
  setStatus(id: string, status: MemberStatus): Promise<boolean>;
}

export type PaymentMethod = "CASH" | "BANK_TRANSFER";

/** One category and amount inside a payment. The amount is whole kobo. */
export interface PaymentLineRecord {
  id: string;
  category: string;
  amount: bigint;
  /** The loan this line pays back (A-145), or null. Which lines get one is the logic code's job. */
  loanId: string | null;
}

/** A saved payment. Append-only: nothing changes it after it is saved (D-17). */
export interface PaymentRecord {
  id: string;
  memberId: string;
  method: PaymentMethod;
  /** Whole kobo. */
  total: bigint;
  /** The day the member paid, "YYYY-MM-DD" in Lagos time (step U.4a). */
  paidOn: string;
  /** In the order given when the payment was saved. */
  lines: PaymentLineRecord[];
  /** The caller's idempotency key, or null (step 4.5). Unique per user. */
  idempotencyKey: string | null;
  /** SHA-256 of the checked request, or null. Used to tell a repeat from a different request. */
  requestHash: string | null;
  /** The user who recorded the payment (DR-15). */
  createdById: string;
  createdAt: Date;
}

export interface NewPayment {
  memberId: string;
  method: PaymentMethod;
  total: bigint;
  /** "YYYY-MM-DD". The store saves it as given: checking it is the logic code's job. */
  paidOn: string;
  lines: { category: string; amount: bigint; loanId?: string }[];
  idempotencyKey?: string;
  requestHash?: string;
  createdById: string;
}

export class UnknownMemberError extends Error {
  constructor(memberId: string) {
    super(`No member with id ${memberId}`);
    this.name = "UnknownMemberError";
  }
}

export class UnknownLoanError extends Error {
  constructor(loanId: string) {
    super(`No loan with id ${loanId}`);
    this.name = "UnknownLoanError";
  }
}

export class DuplicateIdempotencyKeyError extends Error {
  constructor() {
    super("A payment with this idempotency key already exists for this user");
    this.name = "DuplicateIdempotencyKeyError";
  }
}

/**
 * What to list across members (step 7.1). Every filter given must hold. memberCreatedById is the
 * user who recorded the member, not the payment (A-133). The day range is on paidOn and includes
 * both paidFrom and paidTo ("YYYY-MM-DD", so text order is day order). No filter means all payments.
 */
export interface PaymentListQuery {
  memberCreatedById?: string;
  paidFrom?: string;
  paidTo?: string;
}

export interface PaymentStore {
  /**
   * Saves a payment and all its lines together, or nothing. Throws UnknownMemberError if the
   * member does not exist, then UnknownActorError if createdById is not a user, then
   * UnknownLoanError if a line's loanId is not a loan. It saves the values as given: checking the
   * breakdown (checkBreakdown) and which loan a line may name are the logic code's job.
   */
  create(input: NewPayment): Promise<PaymentRecord>;
  findById(id: string): Promise<PaymentRecord | null>;
  /** Payments of one member, oldest first. Payments with equal times are in no fixed order. Returns copies. */
  listByMember(memberId: string): Promise<PaymentRecord[]>;
  /** Payments that match the query, by paidOn, then oldest first. Returns copies. */
  list(query: PaymentListQuery): Promise<PaymentRecord[]>;
  /** The payment this user saved with this key, or null. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<PaymentRecord | null>;
}

/**
 * Money going out (DR-11, D-54). Soft-delete only (D-10): deletedAt and deletedById are set once,
 * by softDelete (step 5.9), and are null until then.
 */
export interface ExpenseRecord {
  id: string;
  /** Stored as given. Checking it (parseManualExpenseCategory) is the logic code's job (A-150). */
  category: string;
  /** Whole kobo. */
  amount: bigint;
  method: PaymentMethod;
  description: string;
  /** The free text for "Others" (DR-11). Empty for other categories. */
  narration: string;
  /** The day the money left, "YYYY-MM-DD" in Lagos time (step U.6a). */
  spentOn: string;
  /** The loan this expense pays out (DR-10), or null. At most one expense per loan (A-148). */
  loanId: string | null;
  /** The pay-off this Membership Withdrawal pays out (DR-05, step 6.3b), or null. At most one expense per pay-off. */
  payOffId: string | null;
  /** The caller's idempotency key, or null (step 5.7c). Unique per user. Loan expenses have none. */
  idempotencyKey: string | null;
  /** SHA-256 of the checked request, or null. Used to tell a repeat from a different request. */
  requestHash: string | null;
  /** The user who recorded the expense (DR-15). */
  createdById: string;
  createdAt: Date;
  deletedAt: Date | null;
  deletedById: string | null;
}

export interface NewExpense {
  category: string;
  amount: bigint;
  method: PaymentMethod;
  /** Defaults to "". */
  description?: string;
  /** Defaults to "". */
  narration?: string;
  /** "YYYY-MM-DD". The store saves it as given: checking it is the logic code's job. */
  spentOn: string;
  loanId?: string;
  payOffId?: string;
  idempotencyKey?: string;
  requestHash?: string;
  createdById: string;
}

/**
 * What to list (step 5.8; days spent since U.6b2). Every filter given must hold. Text filters match
 * exactly. The day range is on spentOn and includes both spentFrom and spentTo ("YYYY-MM-DD", so
 * text order is day order). No filter means all expenses that are not soft-deleted: deleted ones
 * are never listed (DR-12, step 5.9).
 */
export interface ExpenseListQuery {
  createdById?: string;
  category?: string;
  method?: PaymentMethod;
  spentFrom?: string;
  spentTo?: string;
}

/**
 * The fields an edit may change (step 5.9; spentOn since U.6a). A field left out keeps its value.
 * The creator, the time recorded, the loan link, the pay-off link, the key and the request hash never change.
 */
export interface ExpenseChanges {
  category?: string;
  amount?: bigint;
  method?: PaymentMethod;
  description?: string;
  narration?: string;
  spentOn?: string;
}

export class DuplicateExpenseLoanError extends Error {
  constructor() {
    super("An expense for this loan already exists");
    this.name = "DuplicateExpenseLoanError";
  }
}

export class UnknownPayOffError extends Error {
  constructor(payOffId: string) {
    super(`No pay-off with id ${payOffId}`);
    this.name = "UnknownPayOffError";
  }
}

export class DuplicateExpensePayOffError extends Error {
  constructor() {
    super("An expense for this pay-off already exists");
    this.name = "DuplicateExpensePayOffError";
  }
}

export class DuplicateExpenseKeyError extends Error {
  constructor() {
    super("An expense with this idempotency key already exists for this user");
    this.name = "DuplicateExpenseKeyError";
  }
}

export interface ExpenseStore {
  /**
   * Saves a new expense. Throws UnknownActorError if createdById is not a user, then
   * UnknownLoanError if loanId is not a loan, then DuplicateExpenseLoanError if another expense
   * has the same loanId, then UnknownPayOffError if payOffId is not a pay-off, then
   * DuplicateExpensePayOffError if another expense has the same payOffId, then
   * DuplicateExpenseKeyError if this user already saved an expense with the same idempotency key.
   * Values are saved as given: checking the category, amount and narration, and which loan or
   * pay-off an expense may name, is the logic code's job (A-150, A-183).
   */
  create(input: NewExpense): Promise<ExpenseRecord>;
  /** Returns a deleted expense too, with deletedAt and deletedById set. */
  findById(id: string): Promise<ExpenseRecord | null>;
  /**
   * Expenses that are not soft-deleted, narrowed by the exact filters, by day spent and then by
   * time recorded, oldest first (U.6b2). Equal days and times are in no fixed order. Returns copies.
   */
  list(query: ExpenseListQuery): Promise<ExpenseRecord[]>;
  /** The expense this user saved with this key, or null, deleted or not. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<ExpenseRecord | null>;
  /**
   * Changes the given fields of an expense that is not deleted and returns it. Returns null, and
   * changes nothing, if there is no such expense or it is deleted. Values are saved as given:
   * who may edit and what is allowed are the logic code's job (A-150).
   */
  update(id: string, changes: ExpenseChanges): Promise<ExpenseRecord | null>;
  /**
   * Marks an expense deleted, once: deletedAt becomes now and deletedById the given user. Throws
   * UnknownActorError if deletedById is not a user. Returns null, and changes nothing, if there is
   * no such expense or it is already deleted, so two callers racing get one record. Whether an
   * expense may be deleted (Loan-linked, pay-off: DR-12) is the logic code's job.
   */
  softDelete(id: string, deletedById: string): Promise<ExpenseRecord | null>;
}

/**
 * A loan given to a member (D-54). The repaid and outstanding amounts and the status are not
 * stored: they are worked out on read (D-17, A-144). Nothing changes a loan after it is saved (OQ-16).
 */
export interface LoanRecord {
  id: string;
  memberId: string;
  /** Whole kobo. */
  principal: bigint;
  /** Information only, no formula (D-02, A-146). Empty when not given. */
  interestNote: string;
  notes: string;
  /** The day the loan was given, "YYYY-MM-DD" in Lagos (step U.5a). */
  givenOn: string;
  /** The caller's idempotency key, or null (step 5.4c, D-60). Unique per user. */
  idempotencyKey: string | null;
  /** SHA-256 of the checked request, or null. Used to tell a repeat from a different request. */
  requestHash: string | null;
  /** The user who gave the loan (DR-15). */
  createdById: string;
  createdAt: Date;
}

export interface NewLoan {
  memberId: string;
  principal: bigint;
  /** Defaults to "". */
  interestNote?: string;
  /** Defaults to "". */
  notes?: string;
  /** "YYYY-MM-DD". The store saves it as given: checking it is the logic code's job. */
  givenOn: string;
  idempotencyKey?: string;
  requestHash?: string;
  createdById: string;
}

export class DuplicateLoanKeyError extends Error {
  constructor() {
    super("A loan with this idempotency key already exists for this user");
    this.name = "DuplicateLoanKeyError";
  }
}

/**
 * What to list across members (step 7.2). memberCreatedById is the user who recorded the member,
 * not the loan (A-133, D-99). No filter means all loans.
 */
export interface LoanListQuery {
  memberCreatedById?: string;
}

export interface LoanStore {
  /**
   * Saves a new loan. Throws UnknownMemberError if the member does not exist, then
   * UnknownActorError if createdById is not a user, then DuplicateLoanKeyError if this user
   * already saved a loan with the same idempotency key. Values are saved as given: the amount,
   * the member's status and the one-active-loan rule are the logic code's job (A-156).
   */
  create(input: NewLoan): Promise<LoanRecord>;
  findById(id: string): Promise<LoanRecord | null>;
  /** Loans of one member, oldest first. Equal times are in no fixed order. Returns copies. */
  listByMember(memberId: string): Promise<LoanRecord[]>;
  /** Loans that match the query, by givenOn, then oldest first. Returns copies. */
  list(query: LoanListQuery): Promise<LoanRecord[]>;
  /** The loan this user saved with this key, or null. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<LoanRecord | null>;
}

/** What a pay-off paid out of one refundable category. The amount is whole kobo. */
export interface PayOffLineRecord {
  id: string;
  category: string;
  amount: bigint;
}

/**
 * A saved pay-off (DR-05, step 6.3). Append-only: nothing changes it after it is saved (D-17).
 * The lines let the balances take off what was paid out (A-180).
 */
export interface PayOffRecord {
  id: string;
  memberId: string;
  method: PaymentMethod;
  /** Whole kobo: the payout. */
  total: bigint;
  /** In the order given when the pay-off was saved. */
  lines: PayOffLineRecord[];
  /** The caller's idempotency key, or null. Unique per user. */
  idempotencyKey: string | null;
  /** SHA-256 of the checked request, or null. Used to tell a repeat from a different request. */
  requestHash: string | null;
  /** The user who processed the pay-off (DR-15). */
  createdById: string;
  createdAt: Date;
}

export interface NewPayOff {
  memberId: string;
  method: PaymentMethod;
  total: bigint;
  lines: { category: string; amount: bigint }[];
  idempotencyKey?: string;
  requestHash?: string;
  createdById: string;
}

export class DuplicatePayOffKeyError extends Error {
  constructor() {
    super("A pay-off with this idempotency key already exists for this user");
    this.name = "DuplicatePayOffKeyError";
  }
}

/**
 * What to list across members (step 7.4). memberCreatedById is the user who recorded the member,
 * not the pay-off (A-133, D-99). No filter means all pay-offs.
 */
export interface PayOffListQuery {
  memberCreatedById?: string;
}

export interface PayOffStore {
  /**
   * Saves a pay-off and all its lines together, or nothing. Throws UnknownMemberError if the
   * member does not exist, then UnknownActorError if createdById is not a user, then
   * DuplicatePayOffKeyError if this user already saved a pay-off with the same idempotency key.
   * Values are saved as given: the amounts, the categories, the member's status and the active
   * loan rule (DR-06) are the logic code's job.
   */
  create(input: NewPayOff): Promise<PayOffRecord>;
  findById(id: string): Promise<PayOffRecord | null>;
  /** Pay-offs of one member, oldest first. Equal times are in no fixed order. Returns copies. */
  listByMember(memberId: string): Promise<PayOffRecord[]>;
  /** Pay-offs that match the query, oldest first, each with its lines. Returns copies. */
  list(query: PayOffListQuery): Promise<PayOffRecord[]>;
  /** The pay-off this user saved with this key, or null. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<PayOffRecord | null>;
}

export interface Store {
  users: UserStore;
  audit: AuditStore;
  refreshTokens: RefreshTokenStore;
  members: MemberStore;
  payments: PaymentStore;
  expenses: ExpenseStore;
  loans: LoanStore;
  payOffs: PayOffStore;
  /**
   * Runs fn with a store bound to one transaction. If fn returns, every write inside it is saved.
   * If fn throws, every write inside it is undone and the same error is thrown again.
   * Use only the store passed to fn inside fn. A nested call on that store joins the same
   * transaction (no savepoint), so a nested failure that fn catches does NOT undo the nested writes.
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
}