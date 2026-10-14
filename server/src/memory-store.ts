import { randomUUID } from "node:crypto";
import {
  DuplicateEmailError,
  UnknownActorError,
  type AuditRecord,
  type Store,
  type UserRecord,
} from "./store.js";

const copyUser = (u: UserRecord): UserRecord => ({ ...u, createdAt: new Date(u.createdAt) });
const copyAudit = (a: AuditRecord): AuditRecord => ({ ...a, createdAt: new Date(a.createdAt) });

/** In-memory adapter for tests. Nothing is saved to disk. */
export function createMemoryStore(): Store {
  const users = new Map<string, UserRecord>();
  const audit: AuditRecord[] = [];

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
      async hasSuperAdmin() {
        for (const u of users.values()) {
          if (u.role === "SUPER_ADMIN") return true;
        }
        return false;
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
  };
}