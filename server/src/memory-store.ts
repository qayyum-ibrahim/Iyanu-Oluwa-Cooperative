import { randomUUID } from "node:crypto";
import {
  DuplicateEmailError,
  DuplicateTokenHashError,
  UnknownActorError,
  UnknownUserError,
  UnknownMemberError,
  DuplicateIdempotencyKeyError,
  DuplicateExpenseLoanError,
  formatMembershipId,
  type AuditRecord,
  type ExpenseRecord,
  type ExpenseStore,
  type PaymentRecord,
  type PaymentStore,
  type LockoutState,
  type MemberRecord,
  type MemberStore,
  type RefreshTokenRecord,
  type Store,
  type UserRecord,
} from "./store.js";

const copyMember = (m: MemberRecord): MemberRecord => ({ ...m, createdAt: new Date(m.createdAt) });

const copyPayment = (p: PaymentRecord): PaymentRecord => ({
  ...p,
  createdAt: new Date(p.createdAt),
  lines: p.lines.map((l) => ({ ...l })),
});

const copyDate = (d: Date | null): Date | null => (d === null ? null : new Date(d));
const copyExpense = (e: ExpenseRecord): ExpenseRecord => ({
  ...e,
  createdAt: new Date(e.createdAt),
  deletedAt: copyDate(e.deletedAt),
});
const copyUser = (u: UserRecord): UserRecord => ({
  ...u,
  createdAt: new Date(u.createdAt),
  permissions: [...u.permissions],
});
const copyAudit = (a: AuditRecord): AuditRecord => ({ ...a, createdAt: new Date(a.createdAt) });
const copyLockout = (l: LockoutState): LockoutState => ({
  failedCount: l.failedCount,
  lockedUntil: copyDate(l.lockedUntil),
});
const copyToken = (t: RefreshTokenRecord): RefreshTokenRecord => ({
  ...t,
  createdAt: new Date(t.createdAt),
  expiresAt: new Date(t.expiresAt),
  usedAt: copyDate(t.usedAt),
  revokedAt: copyDate(t.revokedAt),
});

/**
 * In-memory adapter for tests. Nothing is saved to disk.
 * transaction() keeps a copy of all data and puts it back if the function throws (A-107).
 */
export function createMemoryStore(): Store {
  const users = new Map<string, UserRecord>();
  const lockouts = new Map<string, LockoutState>();
  const audit: AuditRecord[] = [];
  const memberRows: MemberRecord[] = [];
  const paymentRows: PaymentRecord[] = [];
  const expenseRows: ExpenseRecord[] = [];
  const tokens = new Map<string, RefreshTokenRecord>();

  function revokeWhere(match: (t: RefreshTokenRecord) => boolean, now: Date): number {
    let changed = 0;
    for (const t of tokens.values()) {
      if (t.revokedAt === null && match(t)) {
        t.revokedAt = new Date(now);
        changed += 1;
      }
    }
    return changed;
  }

  function takeSnapshot() {
    return {
      users: [...users.entries()].map(([id, u]) => [id, copyUser(u)] as const),
      lockouts: [...lockouts.entries()].map(([id, l]) => [id, copyLockout(l)] as const),
      audit: audit.map((a) => copyAudit(a)),
      members: memberRows.map((m) => copyMember(m)),
      payments: paymentRows.map((p) => copyPayment(p)),
      expenses: expenseRows.map((e) => copyExpense(e)),
      tokens: [...tokens.entries()].map(([id, t]) => [id, copyToken(t)] as const),
    };
  }
  type Snapshot = ReturnType<typeof takeSnapshot>;

  function restore(s: Snapshot): void {
    users.clear();
    for (const [id, u] of s.users) users.set(id, u);
    lockouts.clear();
    for (const [id, l] of s.lockouts) lockouts.set(id, l);
    audit.length = 0;
    audit.push(...s.audit);
    memberRows.length = 0;
    memberRows.push(...s.members);
    paymentRows.length = 0;
    paymentRows.push(...s.payments);
    expenseRows.length = 0;
    expenseRows.push(...s.expenses);
    tokens.clear();
    for (const [id, t] of s.tokens) tokens.set(id, t);
  }

  const parts: Omit<Store, "transaction"> = {
    users: {
      async create(input) {
        for (const u of users.values()) {
          if (u.email === input.email) throw new DuplicateEmailError(input.email);
        }
        const record: UserRecord = {
          id: randomUUID(),
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          role: input.role ?? "STAFF",
          isActive: true,
          permissions: [...(input.permissions ?? [])],
          createdAt: new Date(),
        };
        users.set(record.id, record);
        return copyUser(record);
      },
      async findByEmail(email) {
        for (const u of users.values()) {
          if (u.email === email) return copyUser(u);
        }
        return null;
      },
      async findById(id) {
        const u = users.get(id);
        return u ? copyUser(u) : null;
      },
      async list() {
        // Map keeps insertion order and sort is stable, so ties stay in creation order.
        return [...users.values()]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map(copyUser);
      },
      async setPermissions(userId, permissions) {
        const u = users.get(userId);
        if (!u) return false;
        u.permissions = [...permissions];
        return true;
      },
      async setActive(userId, isActive) {
        const u = users.get(userId);
        if (!u) return false;
        u.isActive = isActive;
        return true;
      },
      async setPasswordHash(userId, passwordHash) {
        const u = users.get(userId);
        if (!u) return false;
        u.passwordHash = passwordHash;
        return true;
      },
      async hasSuperAdmin() {
        for (const u of users.values()) {
          if (u.role === "SUPER_ADMIN") return true;
        }
        return false;
      },
      async getLockout(userId) {
        if (!users.has(userId)) return null;
        return copyLockout(lockouts.get(userId) ?? { failedCount: 0, lockedUntil: null });
      },
      async recordFailedLogin(userId, now, maxFailures, lockSeconds) {
        // No await in this method, so it cannot be interleaved with another call.
        if (!users.has(userId)) throw new UnknownUserError(userId);
        let state = lockouts.get(userId) ?? { failedCount: 0, lockedUntil: null };
        if (state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime()) {
          state = { failedCount: 0, lockedUntil: null };
        }
        if (state.lockedUntil === null) {
          state = { failedCount: state.failedCount + 1, lockedUntil: null };
          if (state.failedCount >= maxFailures) {
            state.lockedUntil = new Date(now.getTime() + lockSeconds * 1000);
          }
        }
        lockouts.set(userId, state);
        return copyLockout(state);
      },
      async clearLockout(userId) {
        lockouts.delete(userId);
      },
    },
    audit: {
      async append(entry) {
        const actorId = entry.actorId ?? null;
        if (actorId !== null && !users.has(actorId)) throw new UnknownActorError(actorId);
        const record: AuditRecord = {
          id: randomUUID(),
          createdAt: new Date(),
          actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          detail: entry.detail ?? null,
        };
        audit.push(record);
        return copyAudit(record);
      },
      async listByActor(actorId) {
        return audit.filter((a) => a.actorId === actorId).map(copyAudit);
      },
      async list(query) {
        // Equal times: the later entry counts as newer, so the order is the same on every run.
        const matched = audit
          .map((entry, index) => ({ entry, index }))
          .filter(
            ({ entry }) =>
              (query.actorId === undefined || entry.actorId === query.actorId) &&
              (query.action === undefined || entry.action === query.action),
          );
        matched.sort(
          (x, y) => y.entry.createdAt.getTime() - x.entry.createdAt.getTime() || y.index - x.index,
        );
        return matched.slice(query.offset, query.offset + query.limit).map(({ entry }) => copyAudit(entry));
      },
    },
    members: ((): MemberStore => {
      const rows = memberRows;
      return {
        async create(input) {
          // No await in this method, so two calls cannot get the same number.
          if (!users.has(input.createdById)) throw new UnknownActorError(input.createdById);
          const record: MemberRecord = {
            id: randomUUID(),
            membershipId: formatMembershipId(rows.length + 1),
            fullName: input.fullName,
            phone: input.phone,
            address: input.address,
            occupation: input.occupation,
            status: "ACTIVE",
            createdById: input.createdById,
            createdAt: new Date(),
          };
          rows.push(record);
          return copyMember(record);
        },
        async findById(id) {
          const found = rows.find((m) => m.id === id);
          return found ? copyMember(found) : null;
        },
        async list(query) {
          return rows
            .filter(
              (m) =>
                (query.createdById === undefined || m.createdById === query.createdById) &&
                (query.status === undefined || m.status === query.status),
            )
            .map(copyMember);
        },
        async setStatus(id, status) {
          const found = rows.find((m) => m.id === id);
          if (!found) return false;
          found.status = status;
          return true;
        },
      };
    })(),
    payments: ((): PaymentStore => {
      const rows = paymentRows;
      return {
        async create(input) {
          // No await in this method, so the checks and the save cannot be interleaved.
          if (!memberRows.some((m) => m.id === input.memberId)) {
            throw new UnknownMemberError(input.memberId);
          }
          if (!users.has(input.createdById)) throw new UnknownActorError(input.createdById);
          if (
            input.idempotencyKey !== undefined &&
            rows.some(
              (p) => p.createdById === input.createdById && p.idempotencyKey === input.idempotencyKey,
            )
          ) {
            throw new DuplicateIdempotencyKeyError();
          }
          const record: PaymentRecord = {
            id: randomUUID(),
            memberId: input.memberId,
            method: input.method,
            idempotencyKey: input.idempotencyKey ?? null,
            requestHash: input.requestHash ?? null,
            total: input.total,
            lines: input.lines.map((l) => ({
              id: randomUUID(),
              category: l.category,
              amount: l.amount,
            })),
            createdById: input.createdById,
            createdAt: new Date(),
          };
          rows.push(record);
          return copyPayment(record);
        },
        async findById(id) {
          const found = rows.find((p) => p.id === id);
          return found ? copyPayment(found) : null;
        },
        async findByKey(createdById, idempotencyKey) {
          const found = rows.find(
            (p) => p.createdById === createdById && p.idempotencyKey === idempotencyKey,
          );
          return found ? copyPayment(found) : null;
        },
        async listByMember(memberId) {
          return rows.filter((p) => p.memberId === memberId).map(copyPayment);
        },
      };
    })(),
    expenses: ((): ExpenseStore => {
      const rows = expenseRows;
      return {
        async create(input) {
          // No await in this method, so the checks and the save cannot be interleaved.
          if (!users.has(input.createdById)) throw new UnknownActorError(input.createdById);
          if (input.loanId !== undefined && rows.some((e) => e.loanId === input.loanId)) {
            throw new DuplicateExpenseLoanError();
          }
          const record: ExpenseRecord = {
            id: randomUUID(),
            category: input.category,
            amount: input.amount,
            method: input.method,
            description: input.description ?? "",
            narration: input.narration ?? "",
            loanId: input.loanId ?? null,
            createdById: input.createdById,
            createdAt: new Date(),
            deletedAt: null,
            deletedById: null,
          };
          rows.push(record);
          return copyExpense(record);
        },
        async findById(id) {
          const found = rows.find((e) => e.id === id);
          return found ? copyExpense(found) : null;
        },
        async list(query) {
          return rows
            .filter((e) => query.createdById === undefined || e.createdById === query.createdById)
            .map(copyExpense);
        },
      };
    })(),
    refreshTokens: {
      async create(input) {
        if (!users.has(input.userId)) throw new UnknownUserError(input.userId);
        for (const t of tokens.values()) {
          if (t.tokenHash === input.tokenHash) throw new DuplicateTokenHashError();
        }
        const record: RefreshTokenRecord = {
          id: randomUUID(),
          userId: input.userId,
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          createdAt: new Date(),
          expiresAt: new Date(input.expiresAt),
          usedAt: null,
          revokedAt: null,
        };
        tokens.set(record.id, record);
        return copyToken(record);
      },
      async findByHash(tokenHash) {
        for (const t of tokens.values()) {
          if (t.tokenHash === tokenHash) return copyToken(t);
        }
        return null;
      },
      async consume(id, now) {
        // No await between the check and the change, so this step cannot be interleaved.
        const t = tokens.get(id);
        if (!t) return false;
        if (t.usedAt !== null || t.revokedAt !== null) return false;
        if (now.getTime() >= t.expiresAt.getTime()) return false;
        t.usedAt = new Date(now);
        return true;
      },
      async revokeFamily(familyId, now) {
        return revokeWhere((t) => t.familyId === familyId, now);
      },
      async revokeAllForUser(userId, now) {
        return revokeWhere((t) => t.userId === userId, now);
      },
    },
  };

  // Transactions run one at a time. A call made outside a transaction while one is running is
  // not held back, and a rollback would undo its writes too (A-107).
  let queue: Promise<unknown> = Promise.resolve();

  function transaction<T>(fn: (tx: Store) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const snapshot = takeSnapshot();
      const tx: Store = {
        ...parts,
        // A nested call joins this transaction.
        transaction: <U>(inner: (t: Store) => Promise<U>): Promise<U> => inner(tx),
      };
      try {
        return await fn(tx);
      } catch (e) {
        restore(snapshot);
        throw e;
      }
    };
    const result = queue.then(run);
    queue = result.catch(() => undefined);
    return result;
  }

  return { ...parts, transaction };
}