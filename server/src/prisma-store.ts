import type { PrismaClient } from "./generated/prisma/client.js";
import {
  DuplicateEmailError,
  UnknownActorError,
  type AuditRecord,
  type Store,
  type UserRecord,
} from "./store.js";

function hasCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === code;
}

const toUser = (r: UserRecord): UserRecord => ({
  id: r.id,
  email: r.email,
  passwordHash: r.passwordHash,
  displayName: r.displayName,
  role: r.role,
  isActive: r.isActive,
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

/** Real adapter: stores data through Prisma. */
export function createPrismaStore(prisma: PrismaClient): Store {
  return {
    users: {
      async create(input) {
        try {
          const row = await prisma.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
              displayName: input.displayName,
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
    },
  };
}