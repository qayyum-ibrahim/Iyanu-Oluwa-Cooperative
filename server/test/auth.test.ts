import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword, verifyPassword } from "../src/password.js";
import type { NewAuditEntry, Store, UserRecord } from "../src/store.js";

// Count calls to verifyPassword but keep its real behaviour.
vi.mock("../src/password.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/password.js")>();
  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

// Fake values for tests only.
const PASSWORD = "test-only-password-123";
const EMAIL = "staff@example.test";

let HASH: string;
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});
beforeEach(() => {
  vi.mocked(verifyPassword).mockClear();
});

/** Records every audit entry and passes it on to the real memory store. */
function withSpy(base: Store) {
  const appended: NewAuditEntry[] = [];
  const store: Store = {
    users: base.users,
    audit: {
      append: async (entry) => {
        appended.push(entry);
        return base.audit.append(entry);
      },
      listByActor: (id) => base.audit.listByActor(id),
      list: (q) => base.audit.list(q),
    },
    refreshTokens: base.refreshTokens,
  };
  return { store, appended };
}

async function setup(over: { role?: "STAFF" | "SUPER_ADMIN" } = {}) {
  const base = createMemoryStore();
  const user = await base.users.create({
    email: EMAIL,
    passwordHash: HASH,
    displayName: "Test Staff",
    role: over.role ?? "STAFF",
  });
  const { store, appended } = withSpy(base);
  return { store, appended, user, base };
}

/** A store that reports the user as inactive. The Store has no deactivate call yet. */
function asInactive(store: Store): Store {
  return {
    audit: store.audit,
    refreshTokens: store.refreshTokens,
    users: {
      ...store.users,
      findByEmail: async (email) => {
        const u = await store.users.findByEmail(email);
        return u ? ({ ...u, isActive: false } satisfies UserRecord) : null;
      },
    },
  };
}

describe("authenticate: success", () => {
  it("returns the user without the password hash", async () => {
    const { store, user } = await setup();
    const result = await authenticate(store, EMAIL, PASSWORD);
    expect(result).toEqual({
      ok: true,
      user: { id: user.id, email: EMAIL, displayName: "Test Staff", role: "STAFF" },
    });
    expect(JSON.stringify(result)).not.toContain("argon2");
  });

  it("writes one login.success entry with the user as actor", async () => {
    const { store, appended, user } = await setup();
    await authenticate(store, EMAIL, PASSWORD);
    expect(appended).toEqual([
      { actorId: user.id, action: "login.success", entityType: "User", entityId: user.id },
    ]);
  });

  it("normalises the email (spaces and capitals)", async () => {
    const { store } = await setup();
    const result = await authenticate(store, "  STAFF@Example.TEST ", PASSWORD);
    expect(result.ok).toBe(true);
  });

  it("works for the Super Admin and returns the role", async () => {
    const { store } = await setup({ role: "SUPER_ADMIN" });
    const result = await authenticate(store, EMAIL, PASSWORD);
    expect(result.ok && result.user.role).toBe("SUPER_ADMIN");
  });
});

describe("authenticate: failure", () => {
  it("refuses a wrong password and logs bad_password with the user as actor", async () => {
    const { store, appended, user } = await setup();
    expect(await authenticate(store, EMAIL, "wrong-password-123")).toEqual({ ok: false });
    expect(appended).toEqual([
      {
        actorId: user.id,
        action: "login.failure",
        entityType: "User",
        entityId: user.id,
        detail: "bad_password",
      },
    ]);
  });

  it("refuses an unknown email and logs unknown_email with no actor", async () => {
    const { store, appended } = await setup();
    expect(await authenticate(store, "nobody@example.test", PASSWORD)).toEqual({ ok: false });
    expect(appended).toEqual([
      {
        actorId: null,
        action: "login.failure",
        entityType: "User",
        entityId: null,
        detail: "unknown_email",
      },
    ]);
  });

  it("refuses an inactive user even with the right password", async () => {
    const { store, appended, user } = await setup();
    expect(await authenticate(asInactive(store), EMAIL, PASSWORD)).toEqual({ ok: false });
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      action: "login.failure",
      actorId: user.id,
      detail: "inactive",
    });
    expect(appended.some((e) => e.action === "login.success")).toBe(false);
  });

  it("logs bad_password, not inactive, for an inactive user with a wrong password", async () => {
    const { store, appended } = await setup();
    await authenticate(asInactive(store), EMAIL, "wrong-password-123");
    expect(appended[0]?.detail).toBe("bad_password");
  });

  it("gives the same result for every kind of failure", async () => {
    const { store } = await setup();
    const results = [
      await authenticate(store, EMAIL, "wrong-password-123"),
      await authenticate(store, "nobody@example.test", PASSWORD),
      await authenticate(asInactive(store), EMAIL, PASSWORD),
      await authenticate(store, "not-an-email", PASSWORD),
      await authenticate(store, EMAIL, 12345),
    ];
    for (const r of results) expect(r).toEqual({ ok: false });
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it("checks a password hash even when the email is unknown (timing)", async () => {
    const { store } = await setup();
    await authenticate(store, "nobody@example.test", PASSWORD);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("does not trim the password", async () => {
    const { store } = await setup();
    expect(await authenticate(store, EMAIL, `${PASSWORD} `)).toEqual({ ok: false });
  });

  it("refuses an empty password and an over-long one", async () => {
    const { store } = await setup();
    expect(await authenticate(store, EMAIL, "")).toEqual({ ok: false });
    expect(await authenticate(store, EMAIL, "x".repeat(500))).toEqual({ ok: false });
  });

  it("refuses a stored hash that is malformed, without throwing", async () => {
    const base = createMemoryStore();
    await base.users.create({ email: EMAIL, passwordHash: "not-a-real-hash", displayName: "X" });
    expect(await authenticate(base, EMAIL, PASSWORD)).toEqual({ ok: false });
  });
});

describe("authenticate: bad input", () => {
  it.each([123456789012, null, undefined, {}, ["a"], true])(
    "refuses a password that is not text (%s) and logs invalid_input",
    async (bad) => {
      const { store, appended } = await setup();
      expect(await authenticate(store, EMAIL, bad)).toEqual({ ok: false });
      expect(appended).toHaveLength(1);
      expect(appended[0]).toMatchObject({ actorId: null, detail: "invalid_input" });
    },
  );

  it.each([undefined, null, 42, "", "   ", "no-at-sign", "a@b", "a b@example.test"])(
    "refuses an email that is not valid (%s) and logs invalid_input",
    async (bad) => {
      const { store, appended } = await setup();
      expect(await authenticate(store, bad, PASSWORD)).toEqual({ ok: false });
      expect(appended).toHaveLength(1);
      expect(appended[0]).toMatchObject({ actorId: null, detail: "invalid_input" });
    },
  );
});

describe("authenticate: audit rules", () => {
  it("never puts the password or the typed email in an audit entry", async () => {
    const { store, appended } = await setup();
    await authenticate(store, EMAIL, "typed-wrong-password-777");
    await authenticate(store, "someone-else@example.test", "typed-wrong-password-777");
    await authenticate(store, EMAIL, PASSWORD);
    const text = JSON.stringify(appended);
    expect(text).not.toContain("typed-wrong-password-777");
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain("someone-else");
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("argon2");
  });

  it("fails closed: if the audit write fails on success, there is no sign-in", async () => {
    const { store } = await setup();
    const broken: Store = {
      users: store.users,
      audit: {
        append: async () => {
          throw new Error("audit down");
        },
        listByActor: store.audit.listByActor,
        list: store.audit.list,
      },
      refreshTokens: store.refreshTokens,
    };
    await expect(authenticate(broken, EMAIL, PASSWORD)).rejects.toThrow("audit down");
  });

  it("does not hide an audit failure on the failure path either", async () => {
    const { store } = await setup();
    const broken: Store = {
      users: store.users,
      audit: {
        append: async () => {
          throw new Error("audit down");
        },
        listByActor: store.audit.listByActor,
        list: store.audit.list,
      },
      refreshTokens: store.refreshTokens,
    };
    await expect(authenticate(broken, EMAIL, "wrong-password-123")).rejects.toThrow("audit down");
  });

  it("saved entries can be read back by actor", async () => {
    const { store, user } = await setup();
    await authenticate(store, EMAIL, "wrong-password-123");
    await authenticate(store, EMAIL, PASSWORD);
    const entries = await store.audit.listByActor(user.id);
    expect(entries.map((e) => e.action).sort()).toEqual(["login.failure", "login.success"]);
  });
});