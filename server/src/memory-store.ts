import { randomUUID } from "node:crypto";
import {
  DuplicateEmailError,
  DuplicateTokenHashError,
  UnknownActorError,
  UnknownUserError,
  type AuditRecord,
  type LockoutState,
  type RefreshTokenRecord,
  type Store,
  type UserRecord,
} from "./store.js";

const copyDate = (d: Date | null): Date | null => (d === null ? null : new Date(d));
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

/** In-memory adapter for tests. Nothing is saved to disk. */
export function createMemoryStore(): Store {
  const users = new Map<string, UserRecord>();
  const lockouts = new Map<string, LockoutState>();
  const audit: AuditRecord[] = [];
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

  return {
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
    },
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
}