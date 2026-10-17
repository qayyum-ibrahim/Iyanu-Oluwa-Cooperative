import { beforeAll, describe, expect, it } from "vitest";
import { LOCKOUT_MAX_FAILURES, authenticate } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { MultipleOwnersError, NoOwnerError, resetOwnerPassword } from "../src/owner-reset.js";
import { PasswordPolicyError, hashPassword } from "../src/password.js";
import { issueSession, refreshSession } from "../src/sessions.js";
import type { Store } from "../src/store.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-owner-reset-0123456789";
const PASSWORD = "test-only-password-123";
const NEW_PASSWORD = "brand-new-owner-password-9";
const WRONG = "wrong-password-123";
const OWNER_EMAIL = "owner@example.test";
const STAFF_EMAIL = "staff@example.test";
const T0 = new Date("2026-10-17T10:00:00.000Z");

// argon2 is slow on purpose, and the owner's computer may be slower than mine.
const slow = { timeout: 30_000 };

let HASH = "";
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

async function setup() {
  const store = createMemoryStore();
  const owner = await store.users.create({
    email: OWNER_EMAIL,
    passwordHash: HASH,
    displayName: "Owner",
    role: "SUPER_ADMIN",
  });
  const staff = await store.users.create({
    email: STAFF_EMAIL,
    passwordHash: HASH,
    displayName: "Staff",
  });
  return { store, owner, staff };
}

const hashOf = async (store: Store, id: string) => (await store.users.findById(id))?.passwordHash;

describe("resetOwnerPassword: success", () => {
  it("changes the owner password: the old one stops working and the new one works", slow, async () => {
    const { store } = await setup();
    const result = await resetOwnerPassword(store, NEW_PASSWORD, T0);
    expect(result).toEqual({ email: OWNER_EMAIL, isActive: true, tokensRevoked: 0 });
    expect(await authenticate(store, OWNER_EMAIL, PASSWORD, T0)).toEqual({ ok: false });
    expect((await authenticate(store, OWNER_EMAIL, NEW_PASSWORD, T0)).ok).toBe(true);
  });

  it("stores an argon2id hash that does not contain the password", slow, async () => {
    const { store, owner } = await setup();
    await resetOwnerPassword(store, NEW_PASSWORD, T0);
    const stored = await hashOf(store, owner.id);
    expect(stored?.startsWith("$argon2id$")).toBe(true);
    expect(stored).not.toContain(NEW_PASSWORD);
    expect(stored).not.toBe(HASH);
  });

  it("ends every refresh token of the owner and no one else's", slow, async () => {
    const { store, owner, staff } = await setup();
    const a = await issueSession(store, SECRET, owner.id, T0);
    const b = await issueSession(store, SECRET, owner.id, T0);
    const c = await issueSession(store, SECRET, staff.id, T0);
    const result = await resetOwnerPassword(store, NEW_PASSWORD, T0);
    expect(result.tokensRevoked).toBe(2);
    expect(await refreshSession(store, SECRET, a.refreshToken, T0)).toEqual({ ok: false });
    expect(await refreshSession(store, SECRET, b.refreshToken, T0)).toEqual({ ok: false });
    expect((await refreshSession(store, SECRET, c.refreshToken, T0)).ok).toBe(true);
  });

  it("clears a lock so the owner can sign in at once with the new password", slow, async () => {
    const { store, owner } = await setup();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      await authenticate(store, OWNER_EMAIL, WRONG, T0);
    }
    expect(await authenticate(store, OWNER_EMAIL, PASSWORD, T0)).toEqual({ ok: false });
    expect((await store.users.getLockout(owner.id))?.lockedUntil).not.toBeNull();
    await resetOwnerPassword(store, NEW_PASSWORD, T0);
    expect(await store.users.getLockout(owner.id)).toEqual({ failedCount: 0, lockedUntil: null });
    expect((await authenticate(store, OWNER_EMAIL, NEW_PASSWORD, T0)).ok).toBe(true);
  });

  it("writes one owner.password_reset entry with the owner as actor and no password text", slow, async () => {
    const { store, owner } = await setup();
    await issueSession(store, SECRET, owner.id, T0);
    await resetOwnerPassword(store, NEW_PASSWORD, T0);
    const list = await store.audit.listByActor(owner.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      actorId: owner.id,
      action: "owner.password_reset",
      entityType: "User",
      entityId: owner.id,
      detail: "tokens_revoked=1",
    });
    const text = JSON.stringify(list);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(NEW_PASSWORD);
  });

  it("does not change a Staff password", slow, async () => {
    const { store, staff } = await setup();
    await resetOwnerPassword(store, NEW_PASSWORD, T0);
    expect(await hashOf(store, staff.id)).toBe(HASH);
  });

  it("does not reactivate an inactive owner and reports it", slow, async () => {
    const { store, owner } = await setup();
    await store.users.setActive(owner.id, false);
    const result = await resetOwnerPassword(store, NEW_PASSWORD, T0);
    expect(result.isActive).toBe(false);
    expect((await store.users.findById(owner.id))?.isActive).toBe(false);
    expect(await hashOf(store, owner.id)).not.toBe(HASH);
  });

  it("does not hide an audit failure; the password is already changed by then (A-62)", slow, async () => {
    const { store, owner } = await setup();
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
    await expect(resetOwnerPassword(broken, NEW_PASSWORD, T0)).rejects.toThrow("audit down");
    expect(await hashOf(store, owner.id)).not.toBe(HASH);
  });
});

describe("resetOwnerPassword: refusals", () => {
  it("throws NoOwnerError when there is no user at all", async () => {
    const store = createMemoryStore();
    await expect(resetOwnerPassword(store, NEW_PASSWORD, T0)).rejects.toBeInstanceOf(NoOwnerError);
  });

  it("throws NoOwnerError when there are only Staff, and changes nothing", slow, async () => {
    const store = createMemoryStore();
    const staff = await store.users.create({
      email: STAFF_EMAIL,
      passwordHash: HASH,
      displayName: "Staff",
    });
    await expect(resetOwnerPassword(store, NEW_PASSWORD, T0)).rejects.toBeInstanceOf(NoOwnerError);
    expect(await hashOf(store, staff.id)).toBe(HASH);
  });

  it("throws MultipleOwnersError for two Super Admins and changes neither", slow, async () => {
    const { store, owner } = await setup();
    const second = await store.users.create({
      email: "second@example.test",
      passwordHash: HASH,
      displayName: "Second",
      role: "SUPER_ADMIN",
    });
    await expect(resetOwnerPassword(store, NEW_PASSWORD, T0)).rejects.toBeInstanceOf(
      MultipleOwnersError,
    );
    expect(await hashOf(store, owner.id)).toBe(HASH);
    expect(await hashOf(store, second.id)).toBe(HASH);
    expect(await store.audit.listByActor(owner.id)).toHaveLength(0);
  });

  it.each(["short", "a".repeat(129), undefined, 12345678901234])(
    "throws PasswordPolicyError for the bad password %s and changes nothing",
    async (bad) => {
      const { store, owner } = await setup();
      await expect(resetOwnerPassword(store, bad, T0)).rejects.toBeInstanceOf(PasswordPolicyError);
      expect(await hashOf(store, owner.id)).toBe(HASH);
      expect(await store.audit.listByActor(owner.id)).toHaveLength(0);
    },
  );
});