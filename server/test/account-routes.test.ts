import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { LOCKOUT_MAX_FAILURES, LOCKOUT_SECONDS } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-pw-routes-0123456789ab";
const PASSWORD = "test-only-password-123";
const NEW_PASSWORD = "brand-new-test-password-9";
const WRONG = "wrong-password-123";
const EMAIL = "staff@example.test";
const T0 = new Date("2026-10-16T10:00:00.000Z");

// argon2 is slow on purpose, and the owner's computer may be slower than mine.
const slow = { timeout: 30_000 };

let HASH = "";
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

async function build() {
  const store = createMemoryStore();
  const user = await store.users.create({
    email: EMAIL,
    passwordHash: HASH,
    displayName: "Test Staff",
  });
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  return { store, app, user };
}

const login = (app: Express, password: string) =>
  request(app).post("/auth/login").send({ email: EMAIL, password });

async function signIn(app: Express) {
  const res = await login(app, PASSWORD);
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string };
}

const change = (app: Express, token: string, body: unknown) =>
  request(app)
    .post("/auth/password")
    .set("Authorization", `Bearer ${token}`)
    .send(body as object);

const goodBody = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD };

describe("POST /auth/password", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/auth/password").send(goodBody);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("changes the password: 204, no body, no-store; old password refused, new one works", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    const res = await change(app, accessToken, goodBody);
    expect(res.status).toBe(204);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.text).toBe("");
    expect((await login(app, PASSWORD)).status).toBe(401);
    expect((await login(app, NEW_PASSWORD)).status).toBe(200);
  });

  it("ends the refresh token", slow, async () => {
    const { app } = await build();
    const { accessToken, refreshToken } = await signIn(app);
    await change(app, accessToken, goodBody);
    const res = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("leaves the access token already issued working until it expires (A-50, A-63)", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    await change(app, accessToken, goodBody);
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
  });

  it("answers 403 wrong_password for a wrong current password, with no echo", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    const res = await change(app, accessToken, { currentPassword: WRONG, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "wrong_password" });
    expect(JSON.stringify(res.body)).not.toContain(WRONG);
    expect((await login(app, PASSWORD)).status).toBe(200);
  });

  it("answers 400 invalid_input for a short new password", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    const res = await change(app, accessToken, { currentPassword: PASSWORD, newPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 invalid_input when the fields are missing", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    const res = await change(app, accessToken, {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 bad_request for malformed JSON", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    const res = await request(app)
      .post("/auth/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 401 for a user who was deactivated after signing in", slow, async () => {
    const { app, store, user } = await build();
    const { accessToken } = await signIn(app);
    await store.users.setActive(user.id, false);
    const res = await change(app, accessToken, goodBody);
    expect(res.status).toBe(401);
  });

  it("locks after repeated wrong current passwords, then refuses the right one and sign-in", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app);
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      const res = await change(app, accessToken, { currentPassword: WRONG, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(403);
    }
    expect((await change(app, accessToken, goodBody)).status).toBe(403);
    expect((await login(app, PASSWORD)).status).toBe(401);
  });

  it("ends that lock after 15 minutes of app time", slow, async () => {
    const store = createMemoryStore();
    await store.users.create({ email: EMAIL, passwordHash: HASH, displayName: "Test Staff" });
    const clock = { now: T0 };
    const app = createApp({ store, tokenSecret: SECRET, now: () => clock.now });
    const { accessToken } = await signIn(app);
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      const res = await change(app, accessToken, { currentPassword: WRONG, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(403);
    }
    expect((await login(app, PASSWORD)).status).toBe(401);
    clock.now = new Date(T0.getTime() + (LOCKOUT_SECONDS + 1) * 1000);
    expect((await login(app, PASSWORD)).status).toBe(200);
  });
});