import { afterAll, beforeAll } from "vitest";
import { createPrismaStore } from "../src/prisma-store.js";
import type { Store } from "../src/store.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { runStoreContract } from "./helpers/store-contract.js";

let tmp: TempDb;
let store: Store;
const extraDbs: TempDb[] = [];

beforeAll(() => {
  tmp = createTempDb();
  store = createPrismaStore(tmp.prisma);
}, 120_000);

afterAll(async () => {
  for (const db of extraDbs) await db.cleanup();
  await tmp.cleanup();
});

// A brand new database, for tests that need to start from nothing.
function makeEmptyStore(): Store {
  const db = createTempDb();
  extraDbs.push(db);
  return createPrismaStore(db.prisma);
}

// One real database for the whole file. The contract uses unique emails, so tests do not collide.
runStoreContract("Prisma adapter (real PostgreSQL, real migrations)", () => store, makeEmptyStore);