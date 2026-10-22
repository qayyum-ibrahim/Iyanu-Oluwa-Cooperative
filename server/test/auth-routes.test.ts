import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { LOCKOUT_MAX_FAILURES, LOCKOUT_SECONDS } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { REFRESH_TOKEN_SECONDS } from "../src/sessions.js";
import type { Store } from "../src/store.js";
import {
  ACCESS_TOKEN_SECONDS,
  TokenConfigError,
  isRefreshTokenShape,
  verifyAccessToken,
} from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-routes-0123456789ab";
const PASSWORD = "test-only-password-123";
const WRONG = "wrong-password-123";
const EMAIL = "staff@example.test";
const T0 = new Date("2026-10-16T10:00:00.000Z");

let HASH = "";
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

function withBrokenAudit(base: Store): Store {
  return {
    users: base.users,
    refreshTokens: base.refreshTokens, members: base.members, payments: base.payments, expenses: base.expenses, loans: base.loans, payOffs: base.payOffs, transaction: base.transaction,
    audit: {
      append: async () => {
        throw new Error("audit down");
      },
      listByActor: base.audit.listByActor,
      list: base.audit.list,
    },
  };
}

async function build(wrap?: (store: Store) => Store) {
  const store = createMemoryStore();
  const user = await store.users.create({
    email: EMAIL,
    passwordHash: HASH,
    displayName: "Test Staff",
  });
  const clock = { now: T0 };
  const app = createApp({
    store: wrap ? wrap(store) : store,
    tokenSecret: SECRET,
    now: () => clock.now,
  });
  return { app, store, user, clock };
}

const login = (app: Express, email: unknown = EMAIL, password: unknown = PASSWORD) =>
  request(app).post("/auth/login").send({ email, password });

const refresh = (app: Express, refreshToken: unknown) =>
  request(app).post("/auth/refresh").send({ refreshToken });

describe("POST /auth/login", () => {
  it("signs in: 200, a session and the user, no hash, no caching", async () => {
    const { app, user } = await build();
    const res = await login(app);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.user).toEqual({
      id: user.id,
      email: EMAIL,
      displayName: "Test Staff",
      role: user.role,
    });
    expect(verifyAccessToken(SECRET, res.body.accessToken, T0)).toMatchObject({
      ok: true,
      userId: user.id,
    });
    expect(isRefreshTokenShape(res.body.refreshToken)).toBe(true);
    expect(new Date(res.body.accessExpiresAt).getTime()).toBe(
      T0.getTime() + ACCESS_TOKEN_SECONDS * 1000,
    );
    expect(new Date(res.body.refreshExpiresAt).getTime()).toBe(
      T0.getTime() + REFRESH_TOKEN_SECONDS * 1000,
    );
    expect(JSON.stringify(res.body)).not.toContain(HASH);
  });

  it("trims and lower-cases the email", async () => {
    const { app } = await build();
    const res = await login(app, "  STAFF@Example.TEST  ");
    expect(res.status).toBe(200);
  });

  it("gives a wrong password and an unknown email the same 401, with no echo", async () => {
    const { app } = await build();
    const wrong = await login(app, EMAIL, WRONG);
    const unknown = await login(app, "nobody@example.test", WRONG);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual({ error: "invalid_credentials" });
    expect(unknown.body).toEqual(wrong.body);
    expect(JSON.stringify([wrong.body, unknown.body])).not.toContain(WRONG);
  });

  const badBodies: [string, (app: Express) => Promise<{ status: number; body: unknown }>][] = [
    ["no body", async (app) => await request(app).post("/auth/login")],
    ["text body", async (app) => await request(app).post("/auth/login").type("text").send("hi")],
    ["array body", async (app) => await request(app).post("/auth/login").send([1, 2])],
    ["missing password", async (app) => await request(app).post("/auth/login").send({ email: EMAIL })],
    ["password is a number", async (app) => await login(app, EMAIL, 12345678901234)],
    ["email is a number", async (app) => await login(app, 42, PASSWORD)],
  ];

  it.each(badBodies)("answers 401 for a bad body (%s)", async (_name, send) => {
    const { app } = await build();
    const res = await send(app);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_credentials" });
  });

  it("answers 400 with JSON for malformed JSON", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 413 with JSON for a body over 10 kb", async () => {
    const { app } = await build();
    const res = await login(app, "a".repeat(20_000));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });

  it("locks after repeated failures, even for the right password, and unlocks later", async () => {
    const { app, clock } = await build();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      expect((await login(app, EMAIL, WRONG)).status).toBe(401);
    }
    expect((await login(app)).status).toBe(401);
    clock.now = new Date(T0.getTime() + (LOCKOUT_SECONDS + 1) * 1000);
    expect((await login(app)).status).toBe(200);
  });

  it("answers 401 invalid_credentials when the user is deactivated during sign-in", async () => {
    // authenticate reads the user by email; issueSession reads it by id. Inactive only by id.
    const { app } = await build((s) => ({
      ...s,
      users: {
        ...s.users,
        findById: async (id) => {
          const u = await s.users.findById(id);
          return u ? { ...u, isActive: false } : null;
        },
      },
    }));
    const res = await login(app);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_credentials" });
  });

  it("writes a login.success audit entry for the user", async () => {
    const { app, store, user } = await build();
    await login(app);
    const entries = await store.audit.listByActor(user.id);
    expect(entries.map((e) => e.action)).toContain("login.success");
  });

  it("answers 500 with a plain body when the audit write fails, and logs only the error name", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app } = await build(withBrokenAudit);
      const res = await login(app, EMAIL, WRONG);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "server_error" });
      expect(JSON.stringify(res.body)).not.toContain("audit down");
      expect(log).toHaveBeenCalledWith("request failed:", "Error");
    } finally {
      log.mockRestore();
    }
  });
});

describe("POST /auth/refresh", () => {
  it("rotates: a new session for the same user, with different tokens", async () => {
    const { app, user, clock } = await build();
    const first = await login(app);
    clock.now = new Date(T0.getTime() + 60_000);
    const res = await refresh(app, first.body.refreshToken);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.refreshToken).not.toBe(first.body.refreshToken);
    expect(res.body.accessToken).not.toBe(first.body.accessToken);
    expect(verifyAccessToken(SECRET, res.body.accessToken, clock.now)).toMatchObject({
      ok: true,
      userId: user.id,
    });
  });

  it("refuses a used token, and then the whole family", async () => {
    const { app, clock } = await build();
    const s0 = await login(app);
    clock.now = new Date(T0.getTime() + 1000);
    const s1 = await refresh(app, s0.body.refreshToken);
    expect(s1.status).toBe(200);
    const reuse = await refresh(app, s0.body.refreshToken);
    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({ error: "invalid_token" });
    expect((await refresh(app, s1.body.refreshToken)).status).toBe(401);
  });

  it.each([undefined, 12345, "abc", "A".repeat(43)])(
    "answers 401 for a bad or unknown token (%s)",
    async (bad) => {
      const { app } = await build();
      const res = await refresh(app, bad);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "invalid_token" });
    },
  );
});

describe("POST /auth/logout", () => {
  it("answers 204 and ends the session", async () => {
    const { app } = await build();
    const s = await login(app);
    const out = await request(app).post("/auth/logout").send({ refreshToken: s.body.refreshToken });
    expect(out.status).toBe(204);
    expect(out.text).toBe("");
    expect((await refresh(app, s.body.refreshToken)).status).toBe(401);
  });

  it("answers 204 for a missing, bad or unknown token", async () => {
    const { app } = await build();
    for (const body of [{}, { refreshToken: 5 }, { refreshToken: "abc" }, { refreshToken: "A".repeat(43) }]) {
      expect((await request(app).post("/auth/logout").send(body)).status).toBe(204);
    }
  });
});

describe("createApp", () => {
  it("throws at start-up for a short token secret", () => {
    expect(() => createApp({ store: createMemoryStore(), tokenSecret: "short" })).toThrow(
      TokenConfigError,
    );
  });

  it("mounts no /auth routes without dependencies", async () => {
    const res = await request(createApp()).post("/auth/login").send({});
    expect(res.status).toBe(404);
  });

  it("answers 404 for a GET on a POST-only route", async () => {
    const { app } = await build();
    expect((await request(app).get("/auth/login")).status).toBe(404);
  });
});