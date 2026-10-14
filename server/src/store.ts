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

export interface UserStore {
  /** Throws DuplicateEmailError if the email is taken. Email match is exact (case-sensitive). */
  create(input: NewUser): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface AuditStore {
  /** Throws UnknownActorError if actorId is given but no such user exists. */
  append(entry: NewAuditEntry): Promise<AuditRecord>;
  /** Entries by one actor. Order is not guaranteed yet. */
  listByActor(actorId: string): Promise<AuditRecord[]>;
}

export interface Store {
  users: UserStore;
  audit: AuditStore;
}