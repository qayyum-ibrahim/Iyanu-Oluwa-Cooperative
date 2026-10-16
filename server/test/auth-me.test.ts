import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { ALL_PERMISSIONS } from "../src/permissions.js";
import { ACCESS_TOKEN_SECONDS } from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-me-route-0123456789";
const PASSWORD = "test-only-password-123";
const ADMIN_EMAIL = "admin@example.test";
const STAFF_EMAIL = "staff@example.test";
const T0 = new Date("2026-10-16T10:00:00.000Z");

let HASH = "";
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

async function build() {
  const store = createMemoryStore();
  const admin = await store.users.create({
    email: ADMIN_EMAIL,
    passwordHash: HASH,
    displayName: "Test Admin",
    role: "SUPER_ADMIN",
  });
  const staff = await store.users.create({
    email: STAFF_EMAIL,
    passwordHash: HASH,
    displayName: "Test Staff",
  });
  const clock = { now: T0 };
  const app = createApp({ store, tokenSecret: SECRET, now: () => clock.now });
  return { app, admin, staff, clock };
}

async function signIn(app: Express, email: string) {
  const res = await request(app).post("/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string };
}

const me = (app: Express, token?: string) => {
  const req = request(app).get("/auth/me");
  return token === undefined ? req : req.set("Authorization", `Bearer ${token}`);
};

describe("GET /auth/me", () => {
  it("tells the Super Admin who they are and that they hold every permission", async () => {
    const { app, admin } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await me(app, accessToken);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({
      user: { id: admin.id, email: ADMIN_EMAIL, displayName: "Test Admin", role: "SUPER_ADMIN" },
      permissions: [...ALL_PERMISSIONS],
    });
    expect(JSON.stringify(res.body)).not.toContain(HASH);
  });

  it("tells Staff who they are and that they hold nothing yet (A-49)", async () => {
    const { app, staff } = await build();
    const { accessToken } = await signIn(app, STAFF_EMAIL);
    const res = await me(app, accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: staff.id, email: STAFF_EMAIL, displayName: "Test Staff", role: "STAFF" },
      permissions: [],
    });
  });

  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await me(app);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 401 for a bad token", async () => {
    const { app } = await build();
    const res = await me(app, "not.a.token");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("works with the access token from a refresh", async () => {
    const { app, clock } = await build();
    const first = await signIn(app, ADMIN_EMAIL);
    clock.now = new Date(T0.getTime() + 60_000);
    const refreshed = await request(app).post("/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(refreshed.status).toBe(200);
    const res = await me(app, refreshed.body.accessToken);
    expect(res.status).toBe(200);
  });

  it("answers 401 once the access token has expired", async () => {
    const { app, clock } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    clock.now = new Date(T0.getTime() + ACCESS_TOKEN_SECONDS * 1000);
    const res = await me(app, accessToken);
    expect(res.status).toBe(401);
  });

  it("does not accept a refresh token as an access token", async () => {
    const { app } = await build();
    const { refreshToken } = await signIn(app, ADMIN_EMAIL);
    const res = await me(app, refreshToken);
    expect(res.status).toBe(401);
  });

  it("answers 404 for a POST", async () => {
    const { app } = await build();
    const res = await request(app).post("/auth/me").send({});
    expect(res.status).toBe(404);
  });
});