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
  /** The user who recorded the payment (DR-15). */
  createdById: string;
  createdAt: Date;
}

export interface NewPayment {
  memberId: string;
  method: PaymentMethod;
  total: bigint;
  lines: { category: string; amount: bigint }[];
  createdById: string;
}

export class UnknownMemberError extends Error {
  constructor(memberId: string) {
    super(`No member with id ${memberId}`);
    this.name = "UnknownMemberError";
  }
}

export interface PaymentStore {
  /**
   * Saves a payment and all its lines together, or nothing. Throws UnknownMemberError if the
   * member does not exist, then UnknownActorError if createdById is not a user. It saves the
   * values as given: checking the breakdown (checkBreakdown) is the logic code's job.
   */
  create(input: NewPayment): Promise<PaymentRecord>;
  findById(id: string): Promise<PaymentRecord | null>;
  /** Payments of one member, oldest first. Payments with equal times are in no fixed order. Returns copies. */
  listByMember(memberId: string): Promise<PaymentRecord[]>;
}

export interface Store {
  users: UserStore;
  audit: AuditStore;
  refreshTokens: RefreshTokenStore;
  members: MemberStore;
  payments: PaymentStore;
  /**
   * Runs fn with a store bound to one transaction. If fn returns, every write inside it is saved.
   * If fn throws, every write inside it is undone and the same error is thrown again.
   * Use only the store passed to fn inside fn. A nested call on that store joins the same
   * transaction (no savepoint), so a nested failure that fn catches does NOT undo the nested writes.
   */
  transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T>;
}