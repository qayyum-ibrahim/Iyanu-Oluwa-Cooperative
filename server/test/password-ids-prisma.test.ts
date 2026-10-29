import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeOwnPassword } from "../src/account.js";
import { hashPassword } from "../src/password.js";
import { createPrismaStore } from "../src/prisma-store.js";
import { resetStaffPassword, type StaffActor } from "../src/staff.js";
import type { Store } from "../src/store.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// The non-text id guards (A-66) on the real Prisma store. On the memory store a bad id
// simply finds no user, so only this store can show what the guards protect against.

// Fake values for tests only.
const PASSWORD = "test-only-password-123";
const NEW_PASSWORD = "prisma-ids-test-password-5";
const T0 = new Date("2026-10-16T10:00:00.000Z");

// argon2 is slow on purpose, and the owner's computer may be slower than mine.
const slow = { timeout: 30_000 };

const BAD_IDS: [string, unknown][] = [
  ["undefined", undefined],
  ["null", null],
  ["an empty text", ""],
  ["a number", 42],
  ["an object", { not: "an id" }],
];

let tmp: TempDb;
let store: Store;
let HASH = "";
let staffId = "";
let adminActor: StaffActor;

beforeAll(async () => {
  tmp = createTempDb();
  store = createPrismaStore(tmp.prisma);
  HASH = await hashPassword(PASSWORD);
  const admin = await store.users.create({
    email: "admin@example.test",
    passwordHash: HASH,
    displayName: "Admin",
    role: "SUPER_ADMIN",
  });
  const staff = await store.users.create({
    email: "staff@example.test",
    passwordHash: HASH,
    displayName: "Staff",
  });
  staffId = staff.id;
  adminActor = { id: admin.id, subject: { role: "SUPER_ADMIN", isActive: true, permissions: [] } };
}, 120_000);

afterAll(async () => {
  await tmp.cleanup();
});

const hashOf = async (id: string) => (await store.users.findById(id))?.passwordHash;

describe("changeOwnPassword on the Prisma store", () => {
  it.each(BAD_IDS)("answers wrong_password for %s as the user id", slow, async (_name, badId) => {
    expect(await changeOwnPassword(store, badId, PASSWORD, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
    expect(await hashOf(staffId)).toBe(HASH);
    expect(await store.audit.listByActor(staffId)).toEqual([]);
  });
});

describe("resetStaffPassword on the Prisma store", () => {
  it.each(BAD_IDS)("answers not_found for %s as the user id", slow, async (_name, badId) => {
    expect(await resetStaffPassword(store, adminActor, badId, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await hashOf(staffId)).toBe(HASH);
    expect(await store.audit.listByActor(adminActor.id)).toEqual([]);
  });
});
