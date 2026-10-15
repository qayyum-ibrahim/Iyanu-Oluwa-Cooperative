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
  createdAt: Date;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string;
  role?: Role;
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
  /** True if any user has role SUPER_ADMIN, active or not. Staff do not count. */
  hasSuperAdmin(): Promise<boolean>;
}

export interface AuditStore {
  /** Throws UnknownActorError if actorId is given but no such user exists. */
  append(entry: NewAuditEntry): Promise<AuditRecord>;
  /** Entries by one actor. Order is not guaranteed yet. */
  listByActor(actorId: string): Promise<AuditRecord[]>;
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

export interface Store {
  users: UserStore;
  audit: AuditStore;
  refreshTokens: RefreshTokenStore;
}