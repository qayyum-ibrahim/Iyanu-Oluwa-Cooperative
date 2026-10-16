import express, { type Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { requireAuth, requirePermission } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-staff-routes-0123456789";
const PASSWORD = "test-only-password-123";
const NEW_PASSWORD = "new-staff-test-password-1";
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
    permissions: ["members.view"],
  });
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  return { store, app, admin, staff };
}

async function signIn(app: Express, email: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return (res.body as { accessToken: string }).accessToken;
}

const bearer = (token: string) => `Bearer ${token}`;

const newStaffBody = (over: Record<string, unknown> = {}) => ({
  email: "New.Staff@Example.test",
  password: NEW_PASSWORD,
  displayName: "New Staff",
  permissions: ["payments.create", "dashboard"],
  ...over,
});

const post = (app: Express, token: string, body: unknown) =>
  request(app).post("/staff").set("Authorization", bearer(token)).send(body as object);

describe("POST /staff", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/staff").send(newStaffBody());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff, even with granted permissions", async () => {
    const { app } = await build();
    const token = await signIn(app, STAFF_EMAIL);
    const res = await post(app, token, newStaffBody());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("creates a staff account for the Super Admin: 201, no hash, no password, no-store", async () => {
    const { app, store } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await post(app, token, newStaffBody());
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.staff).toMatchObject({
      email: "new.staff@example.test",
      displayName: "New Staff",
      role: "STAFF",
      isActive: true,
      permissions: ["dashboard", "payments.create"],
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("argon2");
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain(NEW_PASSWORD);
    expect(await store.users.findByEmail("new.staff@example.test")).not.toBeNull();
    await signIn(app, "new.staff@example.test", NEW_PASSWORD);
  });

  it("gives an empty permission list when none is sent", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const withoutList = {
      email: "New.Staff@Example.test",
      password: NEW_PASSWORD,
      displayName: "New Staff",
    };
    const res = await post(app, token, withoutList);
    expect(res.status).toBe(201);
    expect(res.body.staff.permissions).toEqual([]);
  });

  it("answers 400 invalid_input for an unknown permission", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await post(app, token, newStaffBody({ permissions: ["nope"] }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 when users.manage is requested", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await post(app, token, newStaffBody({ permissions: ["users.manage"] }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 409 email_taken for a duplicate email", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await post(app, token, newStaffBody({ email: STAFF_EMAIL }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "email_taken" });
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await post(app, token, [1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 bad_request for malformed JSON from the Super Admin", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await request(app)
      .post("/staff")
      .set("Authorization", bearer(token))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 401, not 400, for malformed JSON without a token (guards run first)", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/staff")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(401);
  });

  it("answers 413 too_large for a body over 10 kb", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await post(app, token, newStaffBody({ displayName: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("GET /staff", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    expect((await request(app).get("/staff")).status).toBe(401);
  });

  it("answers 403 to Staff", async () => {
    const { app } = await build();
    const token = await signIn(app, STAFF_EMAIL);
    const res = await request(app).get("/staff").set("Authorization", bearer(token));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("lists staff for the Super Admin, without the Super Admin and without hashes", async () => {
    const { app, staff } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await request(app).get("/staff").set("Authorization", bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.staff).toHaveLength(1);
    expect(res.body.staff[0]).toMatchObject({
      id: staff.id,
      email: STAFF_EMAIL,
      role: "STAFF",
      permissions: ["members.view"],
    });
    expect(JSON.stringify(res.body)).not.toContain("argon2");
    expect(JSON.stringify(res.body)).not.toContain(ADMIN_EMAIL);
  });
});

describe("PUT /staff/:id/permissions", () => {
  it("answers 401 without a token", async () => {
    const { app, staff } = await build();
    const res = await request(app).put(`/staff/${staff.id}/permissions`).send({ permissions: [] });
    expect(res.status).toBe(401);
  });

  it("answers 403 to Staff, who cannot change their own permissions", async () => {
    const { app, staff, store } = await build();
    const token = await signIn(app, STAFF_EMAIL);
    const res = await request(app)
      .put(`/staff/${staff.id}/permissions`)
      .set("Authorization", bearer(token))
      .send({ permissions: ["payoff.process"] });
    expect(res.status).toBe(403);
    expect((await store.users.findById(staff.id))?.permissions).toEqual(["members.view"]);
  });

  it("changes the list for the Super Admin and writes an audit entry", async () => {
    const { app, staff, admin, store } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await request(app)
      .put(`/staff/${staff.id}/permissions`)
      .set("Authorization", bearer(token))
      .send({ permissions: ["payments.create", "dashboard"] });
    expect(res.status).toBe(200);
    expect(res.body.staff.permissions).toEqual(["dashboard", "payments.create"]);
    const actions = (await store.audit.listByActor(admin.id)).map((e) => e.action);
    expect(actions).toContain("staff.permissions_changed");
  });

  it("answers 404 for an unknown id", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await request(app)
      .put("/staff/no-such-id/permissions")
      .set("Authorization", bearer(token))
      .send({ permissions: [] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 400 when the permissions are not a list", async () => {
    const { app, staff } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await request(app)
      .put(`/staff/${staff.id}/permissions`)
      .set("Authorization", bearer(token))
      .send({ permissions: "dashboard" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("shows on the Staff user's very next request, with the same access token (A-27)", async () => {
    const { app, staff } = await build();
    const adminToken = await signIn(app, ADMIN_EMAIL);
    const staffToken = await signIn(app, STAFF_EMAIL);
    const before = await request(app).get("/auth/me").set("Authorization", bearer(staffToken));
    expect(before.body.permissions).toEqual(["members.view"]);
    await request(app)
      .put(`/staff/${staff.id}/permissions`)
      .set("Authorization", bearer(adminToken))
      .send({ permissions: ["dashboard"] });
    const after = await request(app).get("/auth/me").set("Authorization", bearer(staffToken));
    expect(after.body.permissions).toEqual(["dashboard"]);
  });
});

describe("stored permissions and the guards", () => {
  async function guardedApp() {
    const { store, staff } = await build();
    const deps = { store, tokenSecret: SECRET, now: () => T0 };
    const app = express();
    app.get("/members", requireAuth(deps), requirePermission("members.view"), (_req, res) => {
      res.json({ ok: true });
    });
    app.get("/payments", requireAuth(deps), requirePermission("payments.create"), (_req, res) => {
      res.json({ ok: true });
    });
    app.get("/admin", requireAuth(deps), requirePermission("users.manage"), (_req, res) => {
      res.json({ ok: true });
    });
    return { app, store, staff };
  }

  it("lets Staff through a route they were granted", async () => {
    const { app, staff } = await guardedApp();
    const token = createAccessToken(SECRET, staff.id, T0);
    const res = await request(app).get("/members").set("Authorization", bearer(token));
    expect(res.status).toBe(200);
  });

  it("refuses Staff on a route they were not granted", async () => {
    const { app, staff } = await guardedApp();
    const token = createAccessToken(SECRET, staff.id, T0);
    const res = await request(app).get("/payments").set("Authorization", bearer(token));
    expect(res.status).toBe(403);
  });

  it("ignores a non-grantable name that was put in the store by hand (A-27)", async () => {
    const { app, store } = await guardedApp();
    const odd = await store.users.create({
      email: "odd@example.test",
      passwordHash: HASH,
      displayName: "Odd",
      permissions: ["users.manage"],
    });
    const token = createAccessToken(SECRET, odd.id, T0);
    const res = await request(app).get("/admin").set("Authorization", bearer(token));
    expect(res.status).toBe(403);
  });

  it("shows a newly created staff member's permissions in /auth/me, in table order", async () => {
    const { app } = await build();
    const adminToken = await signIn(app, ADMIN_EMAIL);
    await post(app, adminToken, newStaffBody());
    const staffToken = await signIn(app, "new.staff@example.test", NEW_PASSWORD);
    const res = await request(app).get("/auth/me").set("Authorization", bearer(staffToken));
    expect(res.body.permissions).toEqual(["dashboard", "payments.create"]);
  });
});