import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../../src/db.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

const serverDir = fileURLToPath(new URL("../..", import.meta.url));

export interface TempDb {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

/** A new SQLite file in the system temp folder, built by running the real migrations. */
export function createTempDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), "io-store-"));
  const url = `file:${join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  const prisma = createPrismaClient(url);
  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}