import { beforeAll, describe, expect, it } from "vitest";
import { changeOwnPassword } from "../src/account.js";
import { LOCKOUT_MAX_FAILURES, LOCKOUT_SECONDS, authenticate } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { issueSession, refreshSession } from "../src/sessions.js";
import type { Store } from "../src/store.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-account-0123456789abc";
const PASSWORD = "test-only-password-123";
const NEW_PASSWORD = "brand-new-test-password-9";
const WRONG = "wrong-password-123";
const EMAIL = "staff@example.test";
const OTHER_EMAIL = "other@example.test";
const T0 = new Date("2026-10-16T10:00:00.000Z");

// argon2 is slow on purpose, and the owner's computer may be slower than mine.
const slow = { timeout: 30_000 };

let HASH = "";
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

async function setup() {
  const store = createMemoryStore();
  const user = await store.users.create({
    email: EMAIL,
    passwordHash: HASH,
    displayName: "Staff",
  });
  const other = await store.users.create({
    email: OTHER_EMAIL,
    passwordHash: HASH,
    displayName: "Other",
  });
  return { store, user, other };
}

const entries = async (store: Store, actorId: string, action: string) =>
  (await store.audit.listByActor(actorId)).filter((e) => e.action === action);

const hashOf = async (store: Store, id: string) => (await store.users.findById(id))?.passwordHash;

async function wrongTimes(store: Store, userId: string, times: number, now: Date) {
  for (let i = 0; i < times; i += 1) {
    expect(await changeOwnPassword(store, userId, WRONG, NEW_PASSWORD, now)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
  }
}

describe("changeOwnPassword: success", () => {
  it("changes the password: the old one stops working and the new one works", slow, async () => {
    const { store, user } = await setup();
    const result = await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0);
    expect(result).toEqual({ ok: true, tokensRevoked: 0 });
    expect(await authenticate(store, EMAIL, PASSWORD, T0)).toEqual({ ok: false });
    expect((await authenticate(store, EMAIL, NEW_PASSWORD, T0)).ok).toBe(true);
  });

  it("stores an argon2id hash that does not contain the password", slow, async () => {
    const { store, user } = await setup();
    await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0);
    const stored = await hashOf(store, user.id);
    expect(stored?.startsWith("$argon2id$")).toBe(true);
    expect(stored).not.toContain(NEW_PASSWORD);
    expect(stored).not.toBe(HASH);
  });

  it("ends every refresh token of the user and no one else's", slow, async () => {
    const { store, user, other } = await setup();
    const a = await issueSession(store, SECRET, user.id, T0);
    const b = await issueSession(store, SECRET, user.id, T0);
    const c = await issueSession(store, SECRET, other.id, T0);
    const result = await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0);
    expect(result).toEqual({ ok: true, tokensRevoked: 2 });
    expect(await refreshSession(store, SECRET, a.refreshToken, T0)).toEqual({ ok: false });
    expect(await refreshSession(store, SECRET, b.refreshToken, T0)).toEqual({ ok: false });
    expect((await refreshSession(store, SECRET, c.refreshToken, T0)).ok).toBe(true);
  });

  it("does not change another user's password", slow, async () => {
    const { store, user, other } = await setup();
    await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0);
    expect(await hashOf(store, other.id)).toBe(HASH);
  });

  it("writes one password.changed entry with the user as actor and no password text", slow, async () => {
    const { store, user } = await setup();
    await issueSession(store, SECRET, user.id, T0);
    await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0);
    const list = await entries(store, user.id, "password.changed");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      detail: "tokens_revoked=1",
    });
    const text = JSON.stringify(await store.audit.listByActor(user.id));
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(NEW_PASSWORD);
  });

  it("works for the Super Admin too", slow, async () => {
    const { store } = await setup();
    const admin = await store.users.create({
      email: "admin@example.test",
      passwordHash: HASH,
      displayName: "Admin",
      role: "SUPER_ADMIN",
    });
    expect((await changeOwnPassword(store, admin.id, PASSWORD, NEW_PASSWORD, T0)).ok).toBe(true);
  });

  it("does not hide an audit failure; the password is already changed by then (A-62)", slow, async () => {
    const { store, user } = await setup();
    const broken: Store = {
      ...store,
      audit: {
        append: async () => {
          throw new Error("audit down");
        },
        listByActor: store.audit.listByActor,
        list: store.audit.list,
      },
    };
    await expect(changeOwnPassword(broken, user.id, PASSWORD, NEW_PASSWORD, T0)).rejects.toThrow(
      "audit down",
    );
    expect(await hashOf(store, user.id)).not.toBe(HASH);
  });
});

describe("changeOwnPassword: wrong current password and lockout", () => {
  it("refuses, changes nothing, keeps sessions, and audits without any password text", slow, async () => {
    const { store, user } = await setup();
    const session = await issueSession(store, SECRET, user.id, T0);
    expect(await changeOwnPassword(store, user.id, WRONG, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
    expect(await hashOf(store, user.id)).toBe(HASH);
    expect((await refreshSession(store, SECRET, session.refreshToken, T0)).ok).toBe(true);
    const failed = await entries(store, user.id, "password.change_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.detail).toBe("wrong_password");
    expect(await entries(store, user.id, "password.changed")).toHaveLength(0);
    const text = JSON.stringify(await store.audit.listByActor(user.id));
    expect(text).not.toContain(WRONG);
    expect(text).not.toContain(NEW_PASSWORD);
  });

  it("locks after repeated failures, refuses even the right password, and locks sign-in too", slow, async () => {
    const { store, user } = await setup();
    await wrongTimes(store, user.id, LOCKOUT_MAX_FAILURES, T0);
    expect(await entries(store, user.id, "account.locked")).toHaveLength(1);
    expect(await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
    expect(await hashOf(store, user.id)).toBe(HASH);
    const failed = await entries(store, user.id, "password.change_failed");
    expect(failed.map((e) => e.detail)).toEqual([
      ...Array.from({ length: LOCKOUT_MAX_FAILURES }, () => "wrong_password"),
      "locked",
    ]);
    expect(await authenticate(store, EMAIL, PASSWORD, T0)).toEqual({ ok: false });
  });

  it("accepts the right current password once the lock has ended", slow, async () => {
    const { store, user } = await setup();
    await wrongTimes(store, user.id, LOCKOUT_MAX_FAILURES, T0);
    const later = new Date(T0.getTime() + (LOCKOUT_SECONDS + 1) * 1000);
    expect((await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, later)).ok).toBe(true);
  });

  it("refuses 1 ms before the lock ends and accepts at the end instant", slow, async () => {
    const { store, user } = await setup();
    await wrongTimes(store, user.id, LOCKOUT_MAX_FAILURES, T0);
    const end = new Date(T0.getTime() + LOCKOUT_SECONDS * 1000);
    const justBefore = new Date(end.getTime() - 1);
    expect(await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, justBefore)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
    expect(await hashOf(store, user.id)).toBe(HASH);
    expect((await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, end)).ok).toBe(true);
  });

  it("resets the failure count after a success", slow, async () => {
    const { store, user } = await setup();
    await wrongTimes(store, user.id, LOCKOUT_MAX_FAILURES - 1, T0);
    expect((await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0)).ok).toBe(true);
    expect(await store.users.getLockout(user.id)).toEqual({ failedCount: 0, lockedUntil: null });
  });
});

describe("changeOwnPassword: bad input", () => {
  it("refuses a new password that is too short or too long, and counts no failure", slow, async () => {
    const { store, user } = await setup();
    for (const bad of ["short", "a".repeat(129)]) {
      expect(await changeOwnPassword(store, user.id, PASSWORD, bad, T0)).toEqual({
        ok: false,
        reason: "invalid_input",
      });
    }
    expect(await hashOf(store, user.id)).toBe(HASH);
    expect(await store.users.getLockout(user.id)).toEqual({ failedCount: 0, lockedUntil: null });
    expect(await entries(store, user.id, "password.change_failed")).toHaveLength(0);
  });

  it("refuses a new password equal to the current one", slow, async () => {
    const { store, user } = await setup();
    expect(await changeOwnPassword(store, user.id, PASSWORD, PASSWORD, T0)).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(await hashOf(store, user.id)).toBe(HASH);
  });

  const badInputs: [string, unknown, unknown][] = [
    ["current is missing", undefined, NEW_PASSWORD],
    ["current is a number", 12345, NEW_PASSWORD],
    ["new is missing", PASSWORD, undefined],
    ["new is a number", PASSWORD, 12345678901234],
  ];

  it.each(badInputs)("answers invalid_input when %s", async (_name, current, next) => {
    const { store, user } = await setup();
    expect(await changeOwnPassword(store, user.id, current, next, T0)).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect(await hashOf(store, user.id)).toBe(HASH);
  });

  it.each([undefined, "", 42, "no-such-id"])(
    "answers wrong_password for the user id %s",
    async (badId) => {
      const { store } = await setup();
      expect(await changeOwnPassword(store, badId, PASSWORD, NEW_PASSWORD, T0)).toEqual({
        ok: false,
        reason: "wrong_password",
      });
    },
  );

  it("answers wrong_password for an inactive user and changes nothing", async () => {
    const { store, user } = await setup();
    await store.users.setActive(user.id, false);
    expect(await changeOwnPassword(store, user.id, PASSWORD, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "wrong_password",
    });
    expect(await hashOf(store, user.id)).toBe(HASH);
  });
});