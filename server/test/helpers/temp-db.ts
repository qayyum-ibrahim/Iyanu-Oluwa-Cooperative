import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../../src/db.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

const serverDir = fileURLToPath(new URL("../..", import.meta.url));

/** The local test PostgreSQL of scripts/test-db.sh (D-118). TEST_DATABASE_URL may name another local one. */
const BASE_URL = process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres@127.0.0.1:54329/postgres";

export interface TempDb {
  prisma: PrismaClient;
  url: string;
  cleanup: () => Promise<void>;
}

/**
 * The address of a new, empty schema on the test database. Only a database on this machine is
 * allowed, so a test can never reach the Neon database named in server/.env.
 */
export function newTestDbUrl(): string {
  const url = new URL(BASE_URL);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("The test database must run on this machine (127.0.0.1 or localhost).");
  }
  url.searchParams.set("schema", `test_${randomUUID().replaceAll("-", "")}`);
  return url.toString();
}

/**
 * Settings for a Prisma CLI run against `url`. Both names are set: the CLI reads DIRECT_URL, and
 * dotenv never overrides a setting that is already set, so the values in server/.env are not used.
 */
export function testDbEnv(url: string): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
}

/** Runs the real migrations on `url`. The Prisma CLI makes the schema if it is missing. */
export function migrateTestDb(url: string): void {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: serverDir, env: testDbEnv(url), stdio: "pipe" });
}

/** A new schema on the local test PostgreSQL, built by running the real migrations. */
export function createTempDb(): TempDb {
  const url = newTestDbUrl();
  migrateTestDb(url);
  const prisma = createPrismaClient(url);
  const schema = new URL(url).searchParams.get("schema");
  return {
    prisma,
    url,
    cleanup: async () => {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await prisma.$disconnect();
    },
  };
}
