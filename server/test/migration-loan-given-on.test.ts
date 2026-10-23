// Migration 20261023120000_loan_given_on (step U.5a) rebuilds the Loan table. Old rows must keep
// every column, their repayment lines and their Loan expense, and get givenOn = the day of
// createdAt in Lagos. The database is built with the migrations before it, filled by plain SQL,
// then migrated (as migration-paid-on.test.ts).

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const MIGRATION = "20261023120000_loan_given_on";
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
  dir = mkdtempSync(join(tmpdir(), "io-mig-loan-"));
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

  // Rows as the code before U.5a saved them. createdAt is ISO 8601 text, as the adapter writes it;
  // the last row has the CURRENT_TIMESTAMP form of a hand-written row.
  db = createPrismaClient(url);
  const run = (sql: string) => db.$executeRawUnsafe(sql);
  await run(`INSERT INTO "User" ("id","email","passwordHash","displayName","updatedAt")
    VALUES ('u1','mig-loan@example.test','not-a-real-hash','Mig User','2026-10-01T08:00:00.000+00:00')`);
  await run(`INSERT INTO "Member" ("id","seq","fullName","createdById")
    VALUES ('m1',1,'Mig Member','u1')`);
  await run(`INSERT INTO "Loan" ("id","memberId","principalKobo","interestNote","notes","idempotencyKey","requestHash","createdById","createdAt")
    VALUES ('l-late','m1',30000000,'5% flat','school fees','mig-loan-key-00001','hash-1','u1','2026-10-31T23:30:00.000+00:00')`);
  await run(`INSERT INTO "Loan" ("id","memberId","principalKobo","createdById","createdAt")
    VALUES ('l-early','m1',9007199254740993,'u1','2026-10-31T22:59:59.999+00:00')`);
  await run(`INSERT INTO "Loan" ("id","memberId","principalKobo","createdById","createdAt")
    VALUES ('l-plain','m1',100,'u1','2026-03-15 23:10:00')`);
  await run(`INSERT INTO "Payment" ("id","memberId","method","totalKobo","paidOn","createdById","createdAt")
    VALUES ('p1','m1','CASH',2000000,'2026-11-02','u1','2026-11-02T09:00:00.000+00:00')`);
  await run(`INSERT INTO "PaymentLine" ("id","paymentId","position","category","amountKobo","loanId")
    VALUES ('pl1','p1',0,'Loan Repaid',2000000,'l-late')`);
  await run(`INSERT INTO "Expense" ("id","category","amountKobo","method","loanId","createdById","createdAt")
    VALUES ('e1','Loan',30000000,'BANK_TRANSFER','l-late','u1','2026-10-31T23:30:00.000+00:00')`);
  await db.$disconnect();

  deploy();
  db = createPrismaClient(url);
}, 180_000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe(`migration ${MIGRATION}`, () => {
  it("gives each old loan the day of createdAt in Lagos", async () => {
    const rows = await db.loan.findMany({ orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.id, r.givenOn])).toEqual([
      ["l-early", "2026-10-31"],
      ["l-late", "2026-11-01"],
      ["l-plain", "2026-03-16"],
    ]);
  });

  it("keeps every other column of the old rows", async () => {
    const late = await db.loan.findUnique({ where: { id: "l-late" } });
    expect(late).toMatchObject({
      memberId: "m1",
      principalKobo: 30000000n,
      interestNote: "5% flat",
      notes: "school fees",
      idempotencyKey: "mig-loan-key-00001",
      requestHash: "hash-1",
      createdById: "u1",
    });
    expect(late?.createdAt.toISOString()).toBe("2026-10-31T23:30:00.000Z");
    const early = await db.loan.findUnique({ where: { id: "l-early" } });
    expect(early).toMatchObject({ principalKobo: 9007199254740993n, interestNote: "", notes: "" });
    expect(early?.idempotencyKey).toBeNull();
  });

  it("keeps the repayment line and the Loan expense linked to the old loan", async () => {
    const late = await db.loan.findUnique({
      where: { id: "l-late" },
      include: { repayments: true, expense: true },
    });
    expect(late?.repayments.map((l) => l.id)).toEqual(["pl1"]);
    expect(late?.expense?.id).toBe("e1");
  });

  it("keeps the foreign keys: a line naming an unknown loan is refused", async () => {
    await expect(
      db.$executeRawUnsafe(`INSERT INTO "PaymentLine" ("id","paymentId","position","category","amountKobo","loanId")
        VALUES ('pl2','p1',1,'Loan Repaid',1,'no-such-loan')`),
    ).rejects.toThrow();
  });

  it("keeps the unique key per user", async () => {
    await expect(
      db.loan.create({
        data: {
          memberId: "m1",
          createdById: "u1",
          principalKobo: 1n,
          givenOn: "2026-11-01",
          idempotencyKey: "mig-loan-key-00001",
        },
      }),
    ).rejects.toThrow();
  });
});
