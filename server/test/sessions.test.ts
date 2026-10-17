import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../src/memory-store.js";
import {
  REFRESH_TOKEN_SECONDS,
  SessionError,
  issueSession,
  refreshSession,
  signOut,
  type Session,
  type SessionResult,
} from "../src/sessions.js";
import type { NewAuditEntry, Store, UserRecord } from "../src/store.js";
import {
  ACCESS_TOKEN_SECONDS,
  TokenConfigError,
  hashRefreshToken,
  isRefreshTokenShape,
  verifyAccessToken,
} from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-sessions-0123456789";
const T0 = new Date("2026-10-15T10:00:00.000Z");
const LIFE_MS = REFRESH_TOKEN_SECONDS * 1000;
const later = (ms: number) => new Date(T0.getTime() + ms);

async function setup() {
  const store = createMemoryStore();
  const user = await store.users.create({
    email: "staff@example.test",
    passwordHash: "not-a-real-hash",
    displayName: "Test Staff",
  });
  return { store, user };
}

function ok(result: SessionResult): Session {
  if (!result.ok) throw new Error("expected a session");
  return result.session;
}

/** Records audit entries and counts refresh-token creates, then passes both on. */
function spied(base: Store) {
  const appended: NewAuditEntry[] = [];
  const create = vi.fn(base.refreshTokens.create);
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
    refreshTokens: { ...base.refreshTokens, create }, members: base.members,
  };
  return { store, appended, create };
}

function withUser(base: Store, override: (u: UserRecord | null) => UserRecord | null): Store {
  return {
    audit: base.audit,
    refreshTokens: base.refreshTokens, members: base.members,
    users: { ...base.users, findById: async (id) => override(await base.users.findById(id)) },
  };
}

function withBrokenAudit(base: Store): Store {
  return {
    users: base.users,
    refreshTokens: base.refreshTokens, members: base.members,
    audit: {
      append: async () => {
        throw new Error("audit down");
      },
      listByActor: base.audit.listByActor,
      list: base.audit.list,
    },
  };
}

const find = (store: Store, token: string) =>
  store.refreshTokens.findByHash(hashRefreshToken(token));

describe("issueSession", () => {
  it("returns an access token and a refresh token for the user", async () => {
    const { store, user } = await setup();
    const s = await issueSession(store, SECRET, user.id, T0);
    expect(s.userId).toBe(user.id);
    const v = verifyAccessToken(SECRET, s.accessToken, T0);
    expect(v).toMatchObject({ ok: true, userId: user.id });
    expect(v.ok && v.expiresAt.getTime()).toBe(s.accessExpiresAt.getTime());
    expect(s.accessExpiresAt.getTime()).toBe(T0.getTime() + ACCESS_TOKEN_SECONDS * 1000);
    expect(isRefreshTokenShape(s.refreshToken)).toBe(true);
    expect(s.refreshExpiresAt.getTime()).toBe(T0.getTime() + LIFE_MS);
  });

  it("stores only the hash of the refresh token, unused and not revoked", async () => {
    const { store, user } = await setup();
    const s = await issueSession(store, SECRET, user.id, T0);
    const record = await find(store, s.refreshToken);
    expect(record).toMatchObject({ userId: user.id, usedAt: null, revokedAt: null });
    expect(record?.expiresAt.getTime()).toBe(T0.getTime() + LIFE_MS);
    expect(record?.tokenHash).not.toBe(s.refreshToken);
    expect(await store.refreshTokens.findByHash(s.refreshToken)).toBeNull();
  });

  it("gives each session its own family and its own tokens", async () => {
    const { store, user } = await setup();
    const a = await issueSession(store, SECRET, user.id, T0);
    const b = await issueSession(store, SECRET, user.id, T0);
    expect(a.refreshToken).not.toBe(b.refreshToken);
    const ra = await find(store, a.refreshToken);
    const rb = await find(store, b.refreshToken);
    expect(ra?.familyId).not.toBe(rb?.familyId);
  });

  it.each(["", 42, null, undefined])("throws SessionError for a bad user id (%s)", async (bad) => {
    const { store } = await setup();
    await expect(issueSession(store, SECRET, bad, T0)).rejects.toBeInstanceOf(SessionError);
  });

  it("throws SessionError for an unknown user", async () => {
    const { store } = await setup();
    await expect(issueSession(store, SECRET, "no-such-user", T0)).rejects.toBeInstanceOf(
      SessionError,
    );
  });

  it("throws SessionError for an inactive user and stores nothing", async () => {
    const { store, user } = await setup();
    const { store: spy, create } = spied(
      withUser(store, (u) => (u ? { ...u, isActive: false } : null)),
    );
    await expect(issueSession(spy, SECRET, user.id, T0)).rejects.toBeInstanceOf(SessionError);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws TokenConfigError for a bad secret and stores nothing", async () => {
    const { store, user } = await setup();
    const { store: spy, create } = spied(store);
    await expect(issueSession(spy, "short", user.id, T0)).rejects.toBeInstanceOf(TokenConfigError);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws TokenConfigError for an invalid date and stores nothing", async () => {
    const { store, user } = await setup();
    const { store: spy, create } = spied(store);
    await expect(issueSession(spy, SECRET, user.id, new Date("nope"))).rejects.toBeInstanceOf(
      TokenConfigError,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe("refreshSession", () => {
  it("rotates: marks the old token used and returns a new one in the same family", async () => {
    const { store, user } = await setup();
    const s0 = await issueSession(store, SECRET, user.id, T0);
    const t1 = later(60_000);
    const s1 = ok(await refreshSession(store, SECRET, s0.refreshToken, t1));
    expect(s1.userId).toBe(user.id);
    expect(s1.refreshToken).not.toBe(s0.refreshToken);
    const old = await find(store, s0.refreshToken);
    const fresh = await find(store, s1.refreshToken);
    expect(old?.usedAt?.getTime()).toBe(t1.getTime());
    expect(fresh).toMatchObject({ familyId: old?.familyId, usedAt: null, revokedAt: null });
    expect(fresh?.expiresAt.getTime()).toBe(t1.getTime() + LIFE_MS);
    expect(s1.refreshExpiresAt.getTime()).toBe(t1.getTime() + LIFE_MS);
    expect(verifyAccessToken(SECRET, s1.accessToken, t1)).toMatchObject({
      ok: true,
      userId: user.id,
    });
  });

  it("can rotate again and again", async () => {
    const { store, user } = await setup();
    let s = await issueSession(store, SECRET, user.id, T0);
    for (let i = 1; i <= 3; i += 1) {
      s = ok(await refreshSession(store, SECRET, s.refreshToken, later(i * 1000)));
    }
    expect(s.userId).toBe(user.id);
  });

  it("detects reuse: the old token fails, the family is revoked, one audit entry is written", async () => {
    const { store, user } = await setup();
    const { store: spy, appended } = spied(store);
    const s0 = await issueSession(spy, SECRET, user.id, T0);
    const s1 = ok(await refreshSession(spy, SECRET, s0.refreshToken, later(1000)));
    const old = await find(store, s0.refreshToken);

    expect(await refreshSession(spy, SECRET, s0.refreshToken, later(2000))).toEqual({ ok: false });
    expect(await refreshSession(spy, SECRET, s1.refreshToken, later(3000))).toEqual({ ok: false });
    expect((await find(store, s1.refreshToken))?.revokedAt).not.toBeNull();
    expect(appended).toEqual([
      {
        actorId: user.id,
        action: "session.reuse_detected",
        entityType: "RefreshToken",
        entityId: old?.id,
        detail: "used_token_presented",
      },
    ]);
  });

  it("leaves the user's other sessions alone when reuse is detected", async () => {
    const { store, user } = await setup();
    const a = await issueSession(store, SECRET, user.id, T0);
    const b = await issueSession(store, SECRET, user.id, T0);
    await refreshSession(store, SECRET, a.refreshToken, later(1000));
    await refreshSession(store, SECRET, a.refreshToken, later(2000));
    expect((await refreshSession(store, SECRET, b.refreshToken, later(3000))).ok).toBe(true);
  });

  it.each(["", "abc", 12345, null, undefined, "A".repeat(43), "a".repeat(44)])(
    "fails quietly for a token that is bad or unknown (%s), with no audit entry",
    async (bad) => {
      const { store, user } = await setup();
      await issueSession(store, SECRET, user.id, T0);
      const { store: spy, appended } = spied(store);
      expect(await refreshSession(spy, SECRET, bad, later(1000))).toEqual({ ok: false });
      expect(appended).toHaveLength(0);
    },
  );

  it("refuses a token at its expiry instant and accepts it one millisecond before", async () => {
    const { store, user } = await setup();
    const s0 = await issueSession(store, SECRET, user.id, T0);
    expect(await refreshSession(store, SECRET, s0.refreshToken, later(LIFE_MS))).toEqual({
      ok: false,
    });
    expect((await find(store, s0.refreshToken))?.usedAt).toBeNull();
    expect((await refreshSession(store, SECRET, s0.refreshToken, later(LIFE_MS - 1))).ok).toBe(
      true,
    );
  });

  it("fails for a signed-out token without a reuse entry", async () => {
    const { store, user } = await setup();
    const { store: spy, appended } = spied(store);
    const s0 = await issueSession(spy, SECRET, user.id, T0);
    expect(await signOut(spy, s0.refreshToken, later(1000))).toBe(true);
    expect(await refreshSession(spy, SECRET, s0.refreshToken, later(2000))).toEqual({ ok: false });
    expect(appended.map((e) => e.action)).toEqual(["session.logout"]);
  });

  async function checkUserGone(override: (u: UserRecord | null) => UserRecord | null) {
    const { store, user } = await setup();
    const a = await issueSession(store, SECRET, user.id, T0);
    const b = await issueSession(store, SECRET, user.id, T0);
    const gone = withUser(store, override);
    expect(await refreshSession(gone, SECRET, a.refreshToken, later(1000))).toEqual({ ok: false });
    expect((await find(store, a.refreshToken))?.usedAt).toBeNull();
    expect((await find(store, a.refreshToken))?.revokedAt).not.toBeNull();
    expect((await find(store, b.refreshToken))?.revokedAt).not.toBeNull();
  }

  it("refuses and revokes every token of an inactive user", () =>
    checkUserGone((u) => (u ? { ...u, isActive: false } : null)));

  it("refuses and revokes every token when the user is missing", () => checkUserGone(() => null));

  it("gives one winner when two callers refresh the same token at once", async () => {
    const { store, user } = await setup();
    const { store: spy, appended } = spied(store);
    const s0 = await issueSession(spy, SECRET, user.id, T0);
    const results = await Promise.all([
      refreshSession(spy, SECRET, s0.refreshToken, later(1000)),
      refreshSession(spy, SECRET, s0.refreshToken, later(1000)),
    ]);
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    expect(appended).toHaveLength(0);
    // The loser did not revoke. Presenting the used token again does (A-40).
    const winner = ok(winners[0] ?? { ok: false });
    expect(await refreshSession(spy, SECRET, s0.refreshToken, later(2000))).toEqual({ ok: false });
    expect(appended.map((e) => e.action)).toEqual(["session.reuse_detected"]);
    expect(await refreshSession(spy, SECRET, winner.refreshToken, later(3000))).toEqual({
      ok: false,
    });
  });
});

describe("signOut", () => {
  it("revokes the whole family and writes one logout entry", async () => {
    const { store, user } = await setup();
    const { store: spy, appended } = spied(store);
    const s0 = await issueSession(spy, SECRET, user.id, T0);
    const s1 = ok(await refreshSession(spy, SECRET, s0.refreshToken, later(1000)));
    expect(await signOut(spy, s1.refreshToken, later(2000))).toBe(true);
    expect((await find(store, s0.refreshToken))?.revokedAt).not.toBeNull();
    expect((await find(store, s1.refreshToken))?.revokedAt).not.toBeNull();
    expect(await refreshSession(spy, SECRET, s1.refreshToken, later(3000))).toEqual({ ok: false });
    expect(appended).toEqual([
      { actorId: user.id, action: "session.logout", entityType: "User", entityId: user.id },
    ]);
  });

  it("leaves the user's other sessions alone", async () => {
    const { store, user } = await setup();
    const a = await issueSession(store, SECRET, user.id, T0);
    const b = await issueSession(store, SECRET, user.id, T0);
    await signOut(store, a.refreshToken, later(1000));
    expect((await refreshSession(store, SECRET, b.refreshToken, later(2000))).ok).toBe(true);
  });

  it.each(["", "abc", 12345, null, "A".repeat(43)])(
    "returns false and writes nothing for a bad or unknown token (%s)",
    async (bad) => {
      const { store } = await setup();
      const { store: spy, appended } = spied(store);
      expect(await signOut(spy, bad, T0)).toBe(false);
      expect(appended).toHaveLength(0);
    },
  );

  it("returns false the second time and writes only one entry", async () => {
    const { store, user } = await setup();
    const { store: spy, appended } = spied(store);
    const s0 = await issueSession(spy, SECRET, user.id, T0);
    expect(await signOut(spy, s0.refreshToken, later(1000))).toBe(true);
    expect(await signOut(spy, s0.refreshToken, later(2000))).toBe(false);
    expect(appended).toHaveLength(1);
  });
});

describe("session audit rules", () => {
  it("never puts a token or a token hash in an audit entry", async () => {
    const { store, user } = await setup();
    const { store: spy, appended } = spied(store);
    const s0 = await issueSession(spy, SECRET, user.id, T0);
    const s1 = ok(await refreshSession(spy, SECRET, s0.refreshToken, later(1000)));
    await refreshSession(spy, SECRET, s0.refreshToken, later(2000));
    await signOut(spy, s1.refreshToken, later(3000));
    const text = JSON.stringify(appended);
    for (const t of [s0, s1]) {
      expect(text).not.toContain(t.refreshToken);
      expect(text).not.toContain(hashRefreshToken(t.refreshToken));
      expect(text).not.toContain(t.accessToken);
    }
  });

  it("fails closed on reuse: an audit error is thrown, and the family is still revoked", async () => {
    const { store, user } = await setup();
    const s0 = await issueSession(store, SECRET, user.id, T0);
    const s1 = ok(await refreshSession(store, SECRET, s0.refreshToken, later(1000)));
    await expect(
      refreshSession(withBrokenAudit(store), SECRET, s0.refreshToken, later(2000)),
    ).rejects.toThrow("audit down");
    expect((await find(store, s1.refreshToken))?.revokedAt).not.toBeNull();
  });

  it("fails closed on sign-out: an audit error is thrown, and the family is still revoked", async () => {
    const { store, user } = await setup();
    const s0 = await issueSession(store, SECRET, user.id, T0);
    await expect(signOut(withBrokenAudit(store), s0.refreshToken, later(1000))).rejects.toThrow(
      "audit down",
    );
    expect((await find(store, s0.refreshToken))?.revokedAt).not.toBeNull();
  });
});