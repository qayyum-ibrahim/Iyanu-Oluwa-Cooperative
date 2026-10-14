import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/db.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const serverDir = fileURLToPath(new URL("..", import.meta.url));
let dir: string;
let db: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "io-db-"));
  const url = `file:${join(dir, "test.db")}`;
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
});