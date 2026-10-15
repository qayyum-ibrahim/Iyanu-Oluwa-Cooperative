import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, LOCKOUT_MAX_FAILURES, LOCKOUT_SECONDS } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword, verifyPassword } from "../src/password.js";
import type { NewAuditEntry, Store } from "../src/store.js";

// Count calls to verifyPassword but keep its real behaviour.
vi.mock("../src/password.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/password.js")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

// Fake values for tests only.
const PASSWORD = "test-only-password-123";
const WRONG = "typed-wrong-password-777";
const EMAIL = "staff@example.test";
const T0 = new Date("2026-10-15T10:00:00.000Z");
const UNTIL = new Date(T0.getTime() + LOCKOUT_SECONDS * 1000);

// Password hashing is slow on a slow machine, and these tests hash many times.
const SLOW = { timeout: 60_000 };

let HASH: string;
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
}, 60_000);
beforeEach(() => {
  vi.mocked(verifyPassword).mockClear();
});

async function setup() {
  const base = createMemoryStore();
  const user = await base.users.create({ email: EMAIL, passwordHash: HASH, displayName: "Test" });
  const appended: NewAuditEntry[] = [];
  const store: Store = {
    ...base,
    audit: {
      append: async (entry) => {
        appended.push(entry);
        return base.audit.append(entry);
      },
      listByActor: (id) => base.audit.listByActor(id),
    },
  };
  return { base, store, appended, user };
}

async function wrong(store: Store, n: number, now: Date = T0) {
  for (let i = 0; i < n; i += 1) {
    expect(await authenticate(store, EMAIL, WRONG, now)).toEqual({ ok: false });
  }
}

describe("sign-in lockout", () => {
  it("uses 5 failures and 900 seconds", () => {
    expect(LOCKOUT_MAX_FAILURES).toBe(5);
    expect(LOCKOUT_SECONDS).toBe(900);
  });

  it("a correct password after 4 failures signs in and resets the count", SLOW, async () => {
    const { store, base, user } = await setup();
    await wrong(store, 4);
    expect((await authenticate(store, EMAIL, PASSWORD, T0)).ok).toBe(true);
    expect(await base.users.getLockout(user.id)).toEqual({ failedCount: 0, lockedUntil: null });
  });

  it("the fifth failure locks the user and writes account.locked", SLOW, async () => {
    const { store, base, appended, user } = await setup();
    await wrong(store, 4);
    expect(appended.some((e) => e.action === "account.locked")).toBe(false);
    await wrong(store, 1);
    expect((await base.users.getLockout(user.id))?.lockedUntil?.getTime()).toBe(UNTIL.getTime());
    expect(appended.map((e) => e.action)).toEqual([
      "login.failure",
      "login.failure",
      "login.failure",
      "login.failure",
      "login.failure",
      "account.locked",
    ]);
    expect(appended.at(-1)).toMatchObject({ actorId: user.id, entityId: user.id });
  });

  it("refuses even the right password while locked, logs locked, counts nothing", SLOW, async () => {
    const { store, base, appended, user } = await setup();
    await wrong(store, 5);
    const before = appended.length;
    const result = await authenticate(store, EMAIL, PASSWORD, new Date(T0.getTime() + 1000));
    expect(result).toEqual({ ok: false });
    expect(appended).toHaveLength(before + 1);
    expect(appended.at(-1)).toMatchObject({
      action: "login.failure",
      actorId: user.id,
      detail: "locked",
    });
    expect(appended.some((e) => e.action === "login.success")).toBe(false);
    expect((await base.users.getLockout(user.id))?.failedCount).toBe(5);
  });

  it("still checks the password hash while locked (timing)", SLOW, async () => {
    const { store } = await setup();
    await wrong(store, 5);
    vi.mocked(verifyPassword).mockClear();
    await authenticate(store, EMAIL, PASSWORD, new Date(T0.getTime() + 1000));
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("refuses 1 ms before the lock ends and accepts at the end", SLOW, async () => {
    const { store, base, user } = await setup();
    await wrong(store, 5);
    expect(await authenticate(store, EMAIL, PASSWORD, new Date(UNTIL.getTime() - 1))).toEqual({
      ok: false,
    });
    expect((await authenticate(store, EMAIL, PASSWORD, UNTIL)).ok).toBe(true);
    expect(await base.users.getLockout(user.id)).toEqual({ failedCount: 0, lockedUntil: null });
  });

  it("starts counting again after the lock ends, without a second account.locked", SLOW, async () => {
    const { store, base, appended, user } = await setup();
    await wrong(store, 5);
    await wrong(store, 1, UNTIL);
    expect(await base.users.getLockout(user.id)).toEqual({ failedCount: 1, lockedUntil: null });
    expect(appended.filter((e) => e.action === "account.locked")).toHaveLength(1);
  });

  it("a success in between resets the count (3 wrong, success, 4 wrong: not locked)", SLOW, async () => {
    const { store, base, user } = await setup();
    await wrong(store, 3);
    expect((await authenticate(store, EMAIL, PASSWORD, T0)).ok).toBe(true);
    await wrong(store, 4);
    expect(await base.users.getLockout(user.id)).toEqual({ failedCount: 4, lockedUntil: null });
  });

  it("does not lock other users", SLOW, async () => {
    const { store, base } = await setup();
    await base.users.create({
      email: "other@example.test",
      passwordHash: HASH,
      displayName: "Other",
    });
    await wrong(store, 5);
    expect((await authenticate(store, "other@example.test", PASSWORD, T0)).ok).toBe(true);
  });

  it("never puts the password or the typed email in the audit entries", SLOW, async () => {
    const { store, appended } = await setup();
    await wrong(store, 5);
    await authenticate(store, "someone-else@example.test", WRONG, T0);
    const text = JSON.stringify(appended);
    expect(text).not.toContain(WRONG);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("someone-else");
  });

  it("fails closed: if counting a failure fails, the error is thrown", SLOW, async () => {
    const { store } = await setup();
    const broken: Store = {
      ...store,
      users: {
        ...store.users,
        recordFailedLogin: async () => {
          throw new Error("lockout down");
        },
      },
    };
    await expect(authenticate(broken, EMAIL, WRONG, T0)).rejects.toThrow("lockout down");
  });
});