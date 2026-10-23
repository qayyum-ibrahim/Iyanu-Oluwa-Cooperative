// Migration 20261023150000_expense_spent_on (step U.6a) rebuilds the Expense table. Old rows must keep
// every column and their loan and pay-off links. A Loan expense gets its loan's givenOn; every other
// row gets the day of createdAt in Lagos. The database is built with the migrations before it, filled
// by plain SQL, then migrated (as migration-loan-given-on.test.ts).

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const MIGRATION = "20261023150000_expense_spent_on";
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = join(serverDir, "prisma", "migrations");

let dir: string;
let url: string;
let db: PrismaClient;

function deploy(configPath?: string): void {
  execFileSync("npx", ["prisma", "migrate", "deploy", ...(configPath ? ["--config", configPath] : [])], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "io-mig-expense-"));
  url = `file:${join(dir, "test.db")}`;

  // Every migration before this one, in a folder of its own.
  const older = join(dir, "migrations");
  for (const name of readdirSync(migrationsDir)) {
    if (name >= MIGRATION && name !== "migration_lock.toml") continue;
    cpSync(join(migrationsDir, name), join(older, name), { recursive: true });
  }
  const config = join(dir, "prisma.config.mjs");
  writeFileSync(
    config,
    `export default ${JSON.stringify({
      schema: join(serverDir, "prisma", "schema.prisma"),
      migrations: { path: older },
      datasource: { url },
    })};\n`,
  );
  deploy(config);

  // Rows as the code before U.6a saved them. createdAt is ISO 8601 text, as the adapter writes it;
  // e-plain has the CURRENT_TIMESTAMP form of a hand-written row. Fictional data only (D-08).
  db = createPrismaClient(url);
  const run = (sql: string) => db.$executeRawUnsafe(sql);
  await run(`INSERT INTO "User" ("id","email","passwordHash","displayName","updatedAt")
    VALUES ('u1','mig-expense@example.test','not-a-real-hash','Mig User','2026-10-01T08:00:00.000+00:00')`);
  await run(`INSERT INTO "Member" ("id","seq","fullName","createdById")
    VALUES ('m1',1,'Mig Member','u1')`);
  // A loan given on 15 September and recorded on 2 October: its expense takes the loan's day.
  await run(`INSERT INTO "Loan" ("id","memberId","principalKobo","givenOn","createdById","createdAt")
    VALUES ('l1','m1',30000000,'2026-09-15','u1','2026-10-02T09:00:00.000+00:00')`);
  await run(`INSERT INTO "Expense" ("id","category","amountKobo","method","loanId","createdById","createdAt")
    VALUES ('e-loan','Loan',30000000,'BANK_TRANSFER','l1','u1','2026-10-02T09:00:00.000+00:00')`);
  await run(`INSERT INTO "PayOff" ("id","memberId","method","totalKobo","createdById","createdAt")
    VALUES ('p1','m1','CASH',2500000,'u1','2026-10-05T10:00:00.000+00:00')`);
  await run(`INSERT INTO "Expense" ("id","category","amountKobo","method","payOffId","createdById","createdAt")
    VALUES ('e-payoff','Membership Withdrawal',2500000,'CASH','p1','u1','2026-10-05T10:00:00.000+00:00')`);
  await run(`INSERT INTO "Expense" ("id","category","amountKobo","method","description","narration","idempotencyKey","requestHash","createdById","createdAt")
    VALUES ('e-late','Others',9007199254740993,'CASH','Generator','Fuel for the office','mig-expense-key-01','hash-1','u1','2026-10-31T23:30:00.000+00:00')`);
  await run(`INSERT INTO "Expense" ("id","category","amountKobo","method","createdById","createdAt","deletedAt","deletedById")
    VALUES ('e-early','Allowances',100,'BANK_TRANSFER','u1','2026-10-31T22:59:59.999+00:00','2026-11-02T08:00:00.000+00:00','u1')`);
  await run(`INSERT INTO "Expense" ("id","category","amountKobo","method","createdById","createdAt")
    VALUES ('e-plain','Expenses',100,'CASH','u1','2026-03-15 23:10:00')`);
  await db.$disconnect();

  deploy();
  db = createPrismaClient(url);
}, 180_000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe(`migration ${MIGRATION}`, () => {
  it("gives a Loan expense its loan's date and every other old expense the day of createdAt in Lagos", async () => {
    const rows = await db.expense.findMany({ orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.id, r.spentOn])).toEqual([
      ["e-early", "2026-10-31"],
      ["e-late", "2026-11-01"],
      ["e-loan", "2026-09-15"],
      ["e-payoff", "2026-10-05"],
      ["e-plain", "2026-03-16"],
    ]);
  });

  it("keeps every other column of the old rows", async () => {
    const late = await db.expense.findUnique({ where: { id: "e-late" } });
    expect(late).toMatchObject({
      category: "Others",
      amountKobo: 9007199254740993n,
      method: "CASH",
      description: "Generator",
      narration: "Fuel for the office",
      idempotencyKey: "mig-expense-key-01",
      requestHash: "hash-1",
      loanId: null,
      payOffId: null,
      createdById: "u1",
      deletedAt: null,
      deletedById: null,
    });
    expect(late?.createdAt.toISOString()).toBe("2026-10-31T23:30:00.000Z");
    const early = await db.expense.findUnique({ where: { id: "e-early" } });
    expect(early).toMatchObject({ description: "", narration: "", deletedById: "u1" });
    expect(early?.deletedAt?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("keeps the loan and pay-off links", async () => {
    const loan = await db.loan.findUnique({ where: { id: "l1" }, include: { expense: true } });
    expect(loan?.expense?.id).toBe("e-loan");
    const payOff = await db.payOff.findUnique({ where: { id: "p1" }, include: { expense: true } });
    expect(payOff?.expense?.id).toBe("e-payoff");
  });

  it("keeps the foreign keys and the one-expense-per-loan rule", async () => {
    await expect(
      db.$executeRawUnsafe(`INSERT INTO "Expense" ("id","category","amountKobo","method","spentOn","loanId","createdById")
        VALUES ('e-bad','Loan',1,'CASH','2026-11-01','no-such-loan','u1')`),
    ).rejects.toThrow();
    await expect(
      db.expense.create({
        data: { category: "Loan", amountKobo: 1n, method: "CASH", spentOn: "2026-11-01", loanId: "l1", createdById: "u1" },
      }),
    ).rejects.toThrow();
  });

  it("keeps the unique key per user", async () => {
    await expect(
      db.expense.create({
        data: {
          category: "Expenses",
          amountKobo: 1n,
          method: "CASH",
          spentOn: "2026-11-01",
          idempotencyKey: "mig-expense-key-01",
          createdById: "u1",
        },
      }),
    ).rejects.toThrow();
  });
});
