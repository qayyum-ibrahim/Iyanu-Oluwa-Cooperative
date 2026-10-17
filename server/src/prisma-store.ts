import type { PrismaClient } from "./generated/prisma/client.js";
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

function hasCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === code;
}

/** A User row as the database holds it: permissions are JSON text (D-34). */
type UserRow = Omit<UserRecord, "permissions"> & { permissions: string };

/** Reads the stored permission text. Anything that is not a JSON list of strings reads as empty (fail closed). */
export function parsePermissions(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return [];
  }
  return [];
}

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  passwordHash: r.passwordHash,
  displayName: r.displayName,
  role: r.role,
  isActive: r.isActive,
  permissions: parsePermissions(r.permissions),
  createdAt: r.createdAt,
});

const toAudit = (r: AuditRecord): AuditRecord => ({
  id: r.id,
  createdAt: r.createdAt,
  actorId: r.actorId,
  action: r.action,
  entityType: r.entityType,
  entityId: r.entityId,
  detail: r.detail,
});

const toToken = (r: RefreshTokenRecord): RefreshTokenRecord => ({
  id: r.id,
  userId: r.userId,
  familyId: r.familyId,
  tokenHash: r.tokenHash,
  createdAt: r.createdAt,
  expiresAt: r.expiresAt,
  usedAt: r.usedAt,
  revokedAt: r.revokedAt,
});

const toLockout = (r: { failedLoginCount: number; lockedUntil: Date | null }): LockoutState => ({
  failedCount: r.failedLoginCount,
  lockedUntil: r.lockedUntil,
});

/** Real adapter: stores data through Prisma. */
export function createPrismaStore(prisma: PrismaClient): Store {
  const readLockout = (userId: string) =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginCount: true, lockedUntil: true },
    });

  return {
    users: {
      async create(input) {
        try {
          const row = await prisma.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
              displayName: input.displayName,
              permissions: JSON.stringify(input.permissions ?? []),
              ...(input.role ? { role: input.role } : {}),
            },
          });
          return toUser(row);
        } catch (e) {
          if (hasCode(e, "P2002")) throw new DuplicateEmailError(input.email);
          throw e;
        }
      },
      async findByEmail(email) {
        const row = await prisma.user.findUnique({ where: { email } });
        return row ? toUser(row) : null;
      },
      async findById(id) {
        const row = await prisma.user.findUnique({ where: { id } });
        return row ? toUser(row) : null;
      },
      async list() {
        const rows = await prisma.user.findMany({
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toUser);
      },
      async setPermissions(userId, permissions) {
        const result = await prisma.user.updateMany({
          where: { id: userId },
          data: { permissions: JSON.stringify([...permissions]) },
        });
        return result.count === 1;
      },
      async setActive(userId, isActive) {
        const result = await prisma.user.updateMany({
          where: { id: userId },
          data: { isActive },
        });
        return result.count === 1;
      },
      async setPasswordHash(userId, passwordHash) {
        const result = await prisma.user.updateMany({
          where: { id: userId },
          data: { passwordHash },
        });
        return result.count === 1;
      },
      async hasSuperAdmin() {
        const row = await prisma.user.findFirst({
          where: { role: "SUPER_ADMIN" },
          select: { id: true },
        });
        return row !== null;
      },
      async getLockout(userId) {
        const row = await readLockout(userId);
        return row ? toLockout(row) : null;
      },
      async recordFailedLogin(userId, now, maxFailures, lockSeconds) {
        // Each statement has its own condition in its WHERE, so the database settles races.
        // 1. A lock that has expired is cleared.
        await prisma.user.updateMany({
          where: { id: userId, lockedUntil: { lte: now } },
          data: { failedLoginCount: 0, lockedUntil: null },
        });
        // 2. Count one failure, but only while not locked. The increment is atomic.
        await prisma.user.updateMany({
          where: { id: userId, lockedUntil: null },
          data: { failedLoginCount: { increment: 1 } },
        });
        let row = await readLockout(userId);
        if (!row) throw new UnknownUserError(userId);
        // 3. Lock when the count has reached the limit (only if not already locked).
        if (row.lockedUntil === null && row.failedLoginCount >= maxFailures) {
          await prisma.user.updateMany({
            where: { id: userId, lockedUntil: null },
            data: { lockedUntil: new Date(now.getTime() + lockSeconds * 1000) },
          });
          row = await readLockout(userId);
          if (!row) throw new UnknownUserError(userId);
        }
        return toLockout(row);
      },
      async clearLockout(userId) {
        await prisma.user.updateMany({
          where: { id: userId },
          data: { failedLoginCount: 0, lockedUntil: null },
        });
      },
    },
    audit: {
      async append(entry) {
        try {
          const row = await prisma.auditLog.create({
            data: {
              actorId: entry.actorId ?? null,
              action: entry.action,
              entityType: entry.entityType,
              entityId: entry.entityId ?? null,
              detail: entry.detail ?? null,
            },
          });
          return toAudit(row);
        } catch (e) {
          if (hasCode(e, "P2003") && entry.actorId) throw new UnknownActorError(entry.actorId);
          throw e;
        }
      },
      async listByActor(actorId) {
        const rows = await prisma.auditLog.findMany({ where: { actorId } });
        return rows.map(toAudit);
      },
      async list(query) {
        const rows = await prisma.auditLog.findMany({
          where: {
            ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
            ...(query.action !== undefined ? { action: query.action } : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: query.offset,
          take: query.limit,
        });
        return rows.map(toAudit);
      },
    },
    refreshTokens: {
      async create(input) {
        try {
          const row = await prisma.refreshToken.create({
            data: {
              userId: input.userId,
              familyId: input.familyId,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
          });
          return toToken(row);
        } catch (e) {
          if (hasCode(e, "P2002")) throw new DuplicateTokenHashError();
          if (hasCode(e, "P2003")) throw new UnknownUserError(input.userId);
          throw e;
        }
      },
      async findByHash(tokenHash) {
        const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });
        return row ? toToken(row) : null;
      },
      async consume(id, now) {
        // One UPDATE with every condition in its WHERE: the database decides who wins a race.
        const result = await prisma.refreshToken.updateMany({
          where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        return result.count === 1;
      },
      async revokeFamily(familyId, now) {
        const result = await prisma.refreshToken.updateMany({
          where: { familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        return result.count;
      },
      async revokeAllForUser(userId, now) {
        const result = await prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return result.count;
      },
    },
  };
}