import type { PrismaClient } from "./generated/prisma/client.js";
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
  type LoanRecord,
  type PaymentMethod,
  type PaymentRecord,
  type LockoutState,
  type MemberRecord,
  type RefreshTokenRecord,
  type Store,
  type UserRecord,
} from "./store.js";

/** How often a member create tries again when another create took the same number. */
const MEMBER_NUMBER_TRIES = 10;

/** A Member row as the database holds it. The Membership ID is made from seq. */
type MemberRow = Omit<MemberRecord, "membershipId"> & { seq: number };

const toMember = (r: MemberRow): MemberRecord => ({
  id: r.id,
  membershipId: formatMembershipId(r.seq),
  fullName: r.fullName,
  phone: r.phone,
  address: r.address,
  occupation: r.occupation,
  status: r.status,
  createdById: r.createdById,
  createdAt: r.createdAt,
});

/** A Payment row with its lines, as the database holds it. */
interface PaymentRow {
  id: string;
  memberId: string;
  method: PaymentMethod;
  totalKobo: bigint;
  idempotencyKey: string | null;
  requestHash: string | null;
  createdById: string;
  createdAt: Date;
  lines: { id: string; position: number; category: string; amountKobo: bigint }[];
}

const toPayment = (r: PaymentRow): PaymentRecord => ({
  id: r.id,
  memberId: r.memberId,
  method: r.method,
  total: r.totalKobo,
  idempotencyKey: r.idempotencyKey,
  requestHash: r.requestHash,
  lines: [...r.lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({ id: l.id, category: l.category, amount: l.amountKobo })),
  createdById: r.createdById,
  createdAt: r.createdAt,
});

/** An Expense row as the database holds it. */
type ExpenseRow = Omit<ExpenseRecord, "amount"> & { amountKobo: bigint };

const toExpense = (r: ExpenseRow): ExpenseRecord => ({
  id: r.id,
  category: r.category,
  amount: r.amountKobo,
  method: r.method,
  description: r.description,
  narration: r.narration,
  loanId: r.loanId,
  createdById: r.createdById,
  createdAt: r.createdAt,
  deletedAt: r.deletedAt,
  deletedById: r.deletedById,
});

/** A Loan row as the database holds it. */
type LoanRow = Omit<LoanRecord, "principal"> & { principalKobo: bigint };

const toLoan = (r: LoanRow): LoanRecord => ({
  id: r.id,
  memberId: r.memberId,
  principal: r.principalKobo,
  interestNote: r.interestNote,
  notes: r.notes,
  createdById: r.createdById,
  createdAt: r.createdAt,
});

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

/** What a query needs: the client, or the client Prisma hands to a transaction. */
type Db = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

/** Prisma's defaults (2 s wait, 5 s run) are short for a slow machine. My choice (A-108). */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/** Real adapter: stores data through Prisma. */
export function createPrismaStore(prisma: PrismaClient): Store {
  return buildStore(
    prisma,
    <T>(fn: (tx: Store) => Promise<T>): Promise<T> =>
      prisma.$transaction(async (tx) => {
        // A nested call joins this transaction.
        const txStore: Store = buildStore(tx, <U>(inner: (t: Store) => Promise<U>): Promise<U> =>
          inner(txStore),
        );
        return fn(txStore);
      }, TRANSACTION_OPTIONS),
  );
}

function buildStore(prisma: Db, runTransaction: Store["transaction"]): Store {
  const readLockout = (userId: string) =>
    prisma.user.findUnique({
      where: { id: userId },
      select: { failedLoginCount: true, lockedUntil: true },
    });

  return {
    transaction: runTransaction,
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
    members: {
      async create(input) {
        // The number is the highest one plus 1. The unique index on seq settles a race: the loser tries again.
        for (let attempt = 0; attempt < MEMBER_NUMBER_TRIES; attempt += 1) {
          const top = await prisma.member.aggregate({ _max: { seq: true } });
          const seq = (top._max.seq ?? 0) + 1;
          try {
            const row = await prisma.member.create({
              data: {
                seq,
                fullName: input.fullName,
                phone: input.phone,
                address: input.address,
                occupation: input.occupation,
                createdById: input.createdById,
              },
            });
            return toMember(row);
          } catch (e) {
            if (hasCode(e, "P2003")) throw new UnknownActorError(input.createdById);
            if (hasCode(e, "P2002")) continue;
            throw e;
          }
        }
        throw new Error("Could not assign a membership number");
      },
      async findById(id) {
        const row = await prisma.member.findUnique({ where: { id } });
        return row ? toMember(row) : null;
      },
      async list(query) {
        const rows = await prisma.member.findMany({
          where: {
            ...(query.createdById !== undefined ? { createdById: query.createdById } : {}),
            ...(query.status !== undefined ? { status: query.status } : {}),
          },
          orderBy: { seq: "asc" },
        });
        return rows.map(toMember);
      },
      async setStatus(id, status) {
        const result = await prisma.member.updateMany({ where: { id }, data: { status } });
        return result.count === 1;
      },
    },
    payments: {
      async create(input) {
        const member = await prisma.member.findUnique({
          where: { id: input.memberId },
          select: { id: true },
        });
        if (member === null) throw new UnknownMemberError(input.memberId);
        const actor = await prisma.user.findUnique({
          where: { id: input.createdById },
          select: { id: true },
        });
        if (actor === null) throw new UnknownActorError(input.createdById);
        // One nested create: the payment and its lines are saved together or not at all.
        const row = await prisma.payment.create({
          data: {
            memberId: input.memberId,
            method: input.method,
            totalKobo: input.total,
            idempotencyKey: input.idempotencyKey ?? null,
            requestHash: input.requestHash ?? null,
            createdById: input.createdById,
            lines: {
              create: input.lines.map((l, position) => ({
                position,
                category: l.category,
                amountKobo: l.amount,
              })),
            },
          },
          include: { lines: true },
        }).catch((e: unknown) => {
          // The only other unique index here is the line position, which cannot clash (A-121).
          if (hasCode(e, "P2002")) throw new DuplicateIdempotencyKeyError();
          throw e;
        });
        return toPayment(row);
      },
      async findById(id) {
        const row = await prisma.payment.findUnique({ where: { id }, include: { lines: true } });
        return row ? toPayment(row) : null;
      },
      async findByKey(createdById, idempotencyKey) {
        const row = await prisma.payment.findFirst({
          where: { createdById, idempotencyKey },
          include: { lines: true },
        });
        return row ? toPayment(row) : null;
      },
      async listByMember(memberId) {
        const rows = await prisma.payment.findMany({
          where: { memberId },
          include: { lines: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toPayment);
      },
    },
    expenses: {
      async create(input) {
        // Read the creator first, so an unknown creator wins over a repeated loanId (same order as memory).
        const actor = await prisma.user.findUnique({
          where: { id: input.createdById },
          select: { id: true },
        });
        if (actor === null) throw new UnknownActorError(input.createdById);
        try {
          const row = await prisma.expense.create({
            data: {
              category: input.category,
              amountKobo: input.amount,
              method: input.method,
              description: input.description ?? "",
              narration: input.narration ?? "",
              loanId: input.loanId ?? null,
              createdById: input.createdById,
            },
          });
          return toExpense(row);
        } catch (e) {
          // loanId is the only unique column besides id.
          if (hasCode(e, "P2002")) throw new DuplicateExpenseLoanError();
          if (hasCode(e, "P2003")) throw new UnknownActorError(input.createdById);
          throw e;
        }
      },
      async findById(id) {
        const row = await prisma.expense.findUnique({ where: { id } });
        return row ? toExpense(row) : null;
      },
      async list(query) {
        const rows = await prisma.expense.findMany({
          where: query.createdById !== undefined ? { createdById: query.createdById } : {},
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toExpense);
      },
    },
    loans: {
      async create(input) {
        // Read the member, then the creator, so the error order is the same as in memory (A-156).
        const member = await prisma.member.findUnique({
          where: { id: input.memberId },
          select: { id: true },
        });
        if (member === null) throw new UnknownMemberError(input.memberId);
        const actor = await prisma.user.findUnique({
          where: { id: input.createdById },
          select: { id: true },
        });
        if (actor === null) throw new UnknownActorError(input.createdById);
        const row = await prisma.loan.create({
          data: {
            memberId: input.memberId,
            principalKobo: input.principal,
            interestNote: input.interestNote ?? "",
            notes: input.notes ?? "",
            createdById: input.createdById,
          },
        });
        return toLoan(row);
      },
      async findById(id) {
        const row = await prisma.loan.findUnique({ where: { id } });
        return row ? toLoan(row) : null;
      },
      async listByMember(memberId) {
        const rows = await prisma.loan.findMany({
          where: { memberId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return rows.map(toLoan);
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