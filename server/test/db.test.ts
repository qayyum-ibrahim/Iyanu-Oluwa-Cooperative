import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const serverDir = fileURLToPath(new URL("..", import.meta.url));
let dir: string;
let url: string;
let db: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "io-db-"));
  url = `file:${join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  db = createPrismaClient(url);
}, 120_000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const newUser = (email: string) =>
  db.user.create({
    data: { email, passwordHash: "not-a-real-hash", displayName: "Test User" },
  });

const newMember = (seq: number, createdById: string) =>
  db.member.create({ data: { seq, fullName: "Test Member", createdById } });

// Runs first: a later test adds a table, which would show as drift (A-143).
describe("schema.prisma matches the migrations (no drift, A-143)", () => {
  it("prisma migrate diff finds nothing between the migrated database and the schema", () => {
    // --exit-code: 0 empty, 1 error, 2 not empty (prisma 7.10.0 CLI help).
    const r = spawnSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
      { cwd: serverDir, env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
    );
    // The diff text is in the object so a failure shows what differs.
    expect({ status: r.status, diff: r.stdout }).toMatchObject({ status: 0 });
  }, 60_000);
});

describe("database (real migration, temporary SQLite file)", () => {
  it("creates a user with default role STAFF and active status", async () => {
    const u = await newUser("a@example.test");
    expect(u.role).toBe("STAFF");
    expect(u.isActive).toBe(true);
    expect(u.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate email", async () => {
    await newUser("dup@example.test");
    await expect(newUser("dup@example.test")).rejects.toMatchObject({ code: "P2002" });
  });

  it("stores an audit entry with its actor and reads the actor back", async () => {
    const u = await newUser("actor@example.test");
    const row = await db.auditLog.create({
      data: { actorId: u.id, action: "test.action", entityType: "User", entityId: u.id },
      include: { actor: true },
    });
    expect(row.actor?.email).toBe("actor@example.test");
  });

  it("allows an audit entry with no actor (system or setup script)", async () => {
    const row = await db.auditLog.create({
      data: { action: "system.setup", entityType: "System" },
    });
    expect(row.actorId).toBeNull();
  });

  it("rejects an audit entry whose actor does not exist", async () => {
    await expect(
      db.auditLog.create({
        data: { actorId: "no-such-user", action: "x", entityType: "User" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("refuses to delete a user who has audit entries", async () => {
    const u = await newUser("keep@example.test");
    await db.auditLog.create({
      data: { actorId: u.id, action: "x", entityType: "User" },
    });
    await expect(db.user.delete({ where: { id: u.id } })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it("SQLite INTEGER holds the A-17 cap and the largest 64-bit value (A-03)", async () => {
    await db.$executeRawUnsafe("CREATE TABLE kobo_check (v INTEGER NOT NULL)");
    const cap = 99_999_999_999_999n;
    const max = 9_223_372_036_854_775_807n;
    await db.$executeRaw`INSERT INTO kobo_check (v) VALUES (${cap})`;
    await db.$executeRaw`INSERT INTO kobo_check (v) VALUES (${max})`;
    const rows = await db.$queryRaw<{ s: string }[]>`
      SELECT CAST(v AS TEXT) AS s FROM kobo_check ORDER BY v`;
    expect(rows.map((r) => r.s)).toEqual([cap.toString(), max.toString()]);
  });

  // The payment store reads the member and the creator first (A-102), so only these
  // tests reach the database rules (A-143).
  it("rejects a payment whose member does not exist", async () => {
    const u = await newUser("pay-member@example.test");
    await expect(
      db.payment.create({
        data: {
          memberId: "no-such-member",
          createdById: u.id,
          method: "CASH",
          paidOn: "2026-10-20",
          totalKobo: 100n,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a payment whose creator does not exist", async () => {
    const u = await newUser("pay-creator@example.test");
    const m = await newMember(9001, u.id);
    await expect(
      db.payment.create({
        data: {
          memberId: m.id,
          createdById: "no-such-user",
          method: "CASH",
          paidOn: "2026-10-20",
          totalKobo: 100n,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  // The stores read the loan first (5.3b), so only these tests reach the loan foreign keys.
  it("rejects a payment line whose loan does not exist", async () => {
    const u = await newUser("line-loan@example.test");
    const m = await newMember(9003, u.id);
    const p = await db.payment.create({
      data: {
        memberId: m.id,
        createdById: u.id,
        method: "CASH",
        paidOn: "2026-10-20",
        totalKobo: 100n,
      },
    });
    await expect(
      db.paymentLine.create({
        data: { paymentId: p.id, position: 0, category: "Loan Repaid", amountKobo: 100n, loanId: "no-such-loan" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects an expense whose loan does not exist", async () => {
    const u = await newUser("expense-loan@example.test");
    await expect(
      db.expense.create({
        data: { category: "Loan", amountKobo: 100n, method: "CASH", loanId: "no-such-loan", createdById: u.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("refuses to delete a loan that has a repayment line or an expense", async () => {
    const u = await newUser("loan-keep@example.test");
    const m = await newMember(9004, u.id);
    const repaid = await db.loan.create({ data: { memberId: m.id, principalKobo: 100n, givenOn: "2026-10-20", createdById: u.id } });
    const paidOut = await db.loan.create({ data: { memberId: m.id, principalKobo: 100n, givenOn: "2026-10-20", createdById: u.id } });
    await db.payment.create({
      data: {
        memberId: m.id,
        createdById: u.id,
        method: "CASH",
        paidOn: "2026-10-20",
        totalKobo: 100n,
        lines: { create: [{ position: 0, category: "Loan Repaid", amountKobo: 100n, loanId: repaid.id }] },
      },
    });
    await db.expense.create({
      data: { category: "Loan", amountKobo: 100n, method: "CASH", loanId: paidOut.id, createdById: u.id },
    });
    await expect(db.loan.delete({ where: { id: repaid.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.loan.delete({ where: { id: paidOut.id } })).rejects.toMatchObject({ code: "P2003" });
  });

  // The expense store reads the pay-off first (6.3b), so only these tests reach the pay-off link rules.
  it("rejects an expense whose pay-off does not exist", async () => {
    const u = await newUser("expense-payoff@example.test");
    await expect(
      db.expense.create({
        data: { category: "Membership Withdrawal", amountKobo: 100n, method: "CASH", payOffId: "no-such-pay-off", createdById: u.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects a second expense for one pay-off and refuses to delete a pay-off that has an expense", async () => {
    const u = await newUser("payoff-keep@example.test");
    const m = await newMember(9005, u.id);
    const p = await db.payOff.create({ data: { memberId: m.id, method: "CASH", totalKobo: 100n, createdById: u.id } });
    const data = { category: "Membership Withdrawal", amountKobo: 100n, method: "CASH" as const, payOffId: p.id, createdById: u.id };
    await db.expense.create({ data });
    await expect(db.expense.create({ data })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.payOff.delete({ where: { id: p.id } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects two lines with the same position in one payment", async () => {
    const u = await newUser("pay-lines@example.test");
    const m = await newMember(9002, u.id);
    const p = await db.payment.create({
      data: {
        memberId: m.id,
        createdById: u.id,
        method: "CASH",
        paidOn: "2026-10-20",
        totalKobo: 200n,
      },
    });
    await db.paymentLine.create({
      data: { paymentId: p.id, position: 0, category: "Savings", amountKobo: 100n },
    });
    await expect(
      db.paymentLine.create({
        data: { paymentId: p.id, position: 0, category: "Savings", amountKobo: 100n },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});