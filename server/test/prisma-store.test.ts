import { afterAll, beforeAll } from "vitest";
import { createPrismaStore } from "../src/prisma-store.js";
import type { Store } from "../src/store.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { runStoreContract } from "./helpers/store-contract.js";

let tmp: TempDb;
let store: Store;

beforeAll(() => {
  tmp = createTempDb();
  store = createPrismaStore(tmp.prisma);
}, 120_000);

afterAll(async () => {
  await tmp.cleanup();
});

// One real database for the whole file. The contract uses unique emails, so tests do not collide.
runStoreContract("Prisma adapter (real SQLite, real migrations)", () => store);