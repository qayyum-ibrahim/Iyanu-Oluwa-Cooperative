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
  /** The payment this user saved with this key, or null. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<PaymentRecord | null>;
}

/**
 * Money going out (DR-11, D-54). Soft-delete only (D-10): deletedAt and deletedById are set by a
 * later step (5.9); until then they are always null.
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
  /** The loan this expense pays out (DR-10), or null. At most one expense per loan (A-148). */
  loanId: string | null;
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
  loanId?: string;
  idempotencyKey?: string;
  requestHash?: string;
  createdById: string;
}

/** What to list. Filters match exactly. No filter means all expenses, soft-deleted ones too. */
export interface ExpenseListQuery {
  createdById?: string;
}

export class DuplicateExpenseLoanError extends Error {
  constructor() {
    super("An expense for this loan already exists");
    this.name = "DuplicateExpenseLoanError";
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
   * has the same loanId, then DuplicateExpenseKeyError if this user already saved an expense with
   * the same idempotency key. Values are saved as given:
   * checking the category, amount and narration is the logic code's job (A-150).
   */
  create(input: NewExpense): Promise<ExpenseRecord>;
  findById(id: string): Promise<ExpenseRecord | null>;
  /** Expenses oldest first, narrowed by the exact filters. Equal times are in no fixed order. Returns copies. */
  list(query: ExpenseListQuery): Promise<ExpenseRecord[]>;
  /** The expense this user saved with this key, or null. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<ExpenseRecord | null>;
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
  /** The loan this user saved with this key, or null. Returns a copy. */
  findByKey(createdById: string, idempotencyKey: string): Promise<LoanRecord | null>;
}

export interface Store {
  users: UserStore;
  audit: AuditStore;
  refreshTokens: RefreshTokenStore;
  members: MemberStore;
  payments: PaymentStore;
  expenses: ExpenseStore;
  loans: LoanStore;
  /**
   * Runs fn with a store bound to one transaction. If fn returns, every write inside it is saved.
   * If fn throws, every write inside it is undone and the same error is thrown again.
   * Use only the store passed to fn inside fn. A nested call on that store joins the same
   * transaction (no savepoint), so a nested failure that fn catches does NOT undo the nested writes.
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
}