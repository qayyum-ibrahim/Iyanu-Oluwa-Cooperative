// Migration 20261023090000_payment_paid_on (step U.4a) rebuilds the Payment table. Old rows must
// keep every column and their lines, and get paidOn = the day of createdAt in Lagos.
// The database is built with the migrations before it, filled by plain SQL, then migrated.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const MIGRATION = "20261023090000_payment_paid_on";
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
  dir = mkdtempSync(join(tmpdir(), "io-mig-"));
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

  // Rows as the code before U.4a saved them. createdAt is ISO 8601 text, as the adapter writes it
  // (probe in step U.4a); the last row has the CURRENT_TIMESTAMP form of a hand-written row.
  db = createPrismaClient(url);
  const run = (sql: string) => db.$executeRawUnsafe(sql);
  await run(`INSERT INTO "User" ("id","email","passwordHash","displayName","updatedAt")
    VALUES ('u1','mig@example.test','not-a-real-hash','Mig User','2026-10-01T08:00:00.000+00:00')`);
  await run(`INSERT INTO "Member" ("id","seq","fullName","createdById")
    VALUES ('m1',1,'Mig Member','u1')`);
  await run(`INSERT INTO "Payment" ("id","memberId","method","totalKobo","idempotencyKey","requestHash","createdById","createdAt")
    VALUES ('p-late','m1','CASH',300000,'mig-key-0000000001','hash-1','u1','2026-10-31T23:30:00.000+00:00')`);
  await run(`INSERT INTO "Payment" ("id","memberId","method","totalKobo","createdById","createdAt")
    VALUES ('p-early','m1','BANK_TRANSFER',9007199254740993,'u1','2026-10-31T22:59:59.999+00:00')`);
  await run(`INSERT INTO "Payment" ("id","memberId","method","totalKobo","createdById","createdAt")
    VALUES ('p-plain','m1','CASH',100,'u1','2026-03-15 23:10:00')`);
  await run(`INSERT INTO "PaymentLine" ("id","paymentId","position","category","amountKobo")
    VALUES ('l1','p-late',0,'Shares',100000), ('l2','p-late',1,'Savings',200000)`);
  await db.$disconnect();

  deploy();
  db = createPrismaClient(url);
}, 180_000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe(`migration ${MIGRATION}`, () => {
  it("gives each old payment the day of createdAt in Lagos", async () => {
    const rows = await db.payment.findMany({ orderBy: { id: "asc" } });
    expect(rows.map((r) => [r.id, r.paidOn])).toEqual([
      ["p-early", "2026-10-31"],
      ["p-late", "2026-11-01"],
      ["p-plain", "2026-03-16"],
    ]);
  });

  it("keeps every other column of the old rows", async () => {
    const late = await db.payment.findUnique({ where: { id: "p-late" } });
    expect(late).toMatchObject({
      memberId: "m1",
      method: "CASH",
      totalKobo: 300000n,
      idempotencyKey: "mig-key-0000000001",
      requestHash: "hash-1",
      createdById: "u1",
    });
    expect(late?.createdAt.toISOString()).toBe("2026-10-31T23:30:00.000Z");
    const early = await db.payment.findUnique({ where: { id: "p-early" } });
    expect(early).toMatchObject({ method: "BANK_TRANSFER", totalKobo: 9007199254740993n });
    expect(early?.idempotencyKey).toBeNull();
  });

  it("keeps the lines of the old rows", async () => {
    const late = await db.payment.findUnique({ where: { id: "p-late" }, include: { lines: true } });
    expect(late?.lines.map((l) => [l.position, l.category, l.amountKobo]).sort()).toEqual([
      [0, "Shares", 100000n],
      [1, "Savings", 200000n],
    ]);
  });

  it("keeps the unique key per user", async () => {
    await expect(
      db.payment.create({
        data: {
          memberId: "m1",
          createdById: "u1",
          method: "CASH",
          paidOn: "2026-11-01",
          totalKobo: 1n,
          idempotencyKey: "mig-key-0000000001",
        },
      }),
    ).rejects.toThrow();
  });
});
