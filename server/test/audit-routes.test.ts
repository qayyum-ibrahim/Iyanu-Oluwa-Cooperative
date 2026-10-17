import type { Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { ALL_PERMISSIONS } from "../src/permissions.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-audit-routes-0123456789";
const PASSWORD = "test-only-password-123";
const ADMIN_EMAIL = "admin@example.test";
const STAFF_EMAIL = "staff@example.test";
const T0 = new Date("2026-10-17T10:00:00.000Z");

interface AuditBody {
  entries: Array<{ id: string; actorId: string | null; action: string; detail: string | null }>;
  limit: number;
  offset: number;
  hasMore: boolean;
}

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
  // Staff with every permission name stored, even users.manage put there by hand (A-27).
  const staff = await store.users.create({
    email: STAFF_EMAIL,
    passwordHash: HASH,
    displayName: "Test Staff",
    permissions: [...ALL_PERMISSIONS],
  });
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  return { app, admin, staff };
}

async function signIn(app: Express, email: string): Promise<string> {
  const res = await request(app).post("/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return (res.body as { accessToken: string }).accessToken;
}

const bearer = (token: string) => `Bearer ${token}`;
const get = (app: Express, token: string, path: string) =>
  request(app).get(path).set("Authorization", bearer(token));
const body = (res: { body: unknown }) => res.body as AuditBody;

describe("GET /audit: access", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).get("/audit");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff, even with every permission name stored", async () => {
    const { app } = await build();
    const token = await signIn(app, STAFF_EMAIL);
    const res = await get(app, token, "/audit");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 404 to a POST: the route is read-only", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await request(app).post("/audit").set("Authorization", bearer(token)).send({});
    expect(res.status).toBe(404);
  });
});

describe("GET /audit: reading", () => {
  it("answers 200 for the Super Admin: no-store, the four fields, no secrets", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await get(app, token, "/audit");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object).sort()).toEqual(["entries", "hasMore", "limit", "offset"]);
    expect(body(res)).toMatchObject({ limit: 50, offset: 0 });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("argon2");
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain(PASSWORD);
  });

  it("shows a sign-in with its actor", async () => {
    const { app, admin } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await get(app, token, "/audit?action=login.success");
    expect(body(res).entries.some((e) => e.actorId === admin.id)).toBe(true);
  });

  it("shows a failed sign-in with no actor, and never the typed email or password", async () => {
    const { app } = await build();
    const typedEmail = "nobody@example.test";
    const typedPassword = "wrong-password-123";
    const failed = await request(app)
      .post("/auth/login")
      .send({ email: typedEmail, password: typedPassword });
    expect(failed.status).toBe(401);
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await get(app, token, "/audit?action=login.failure");
    expect(res.status).toBe(200);
    expect(body(res).entries[0]?.actorId).toBeNull();
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(typedEmail);
    expect(text).not.toContain(typedPassword);
  });

  it("filters by action", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    await signIn(app, STAFF_EMAIL);
    const res = await get(app, token, "/audit?action=login.success");
    expect(body(res).entries.length).toBeGreaterThanOrEqual(2);
    expect(body(res).entries.every((e) => e.action === "login.success")).toBe(true);
  });

  it("filters by actor", async () => {
    const { app, admin } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    await signIn(app, STAFF_EMAIL);
    const res = await get(app, token, `/audit?actorId=${admin.id}`);
    expect(body(res).entries.length).toBeGreaterThanOrEqual(1);
    expect(body(res).entries.every((e) => e.actorId === admin.id)).toBe(true);
  });

  it("limits the page and says there is more", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    await signIn(app, ADMIN_EMAIL);
    const res = await get(app, token, "/audit?limit=1");
    expect(body(res).entries).toHaveLength(1);
    expect(body(res)).toMatchObject({ limit: 1, hasMore: true });
  });

  it("skips entries with offset", async () => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    await signIn(app, STAFF_EMAIL);
    const all = body(await get(app, token, "/audit?limit=200"));
    expect(all.entries.length).toBeGreaterThanOrEqual(2);
    const second = body(await get(app, token, "/audit?limit=1&offset=1"));
    expect(second.entries[0]?.id).toBe(all.entries[1]?.id);
    expect(second.offset).toBe(1);
  });
});

describe("GET /audit: bad input", () => {
  it.each([
    ["limit=0", "/audit?limit=0"],
    ["limit=abc", "/audit?limit=abc"],
    ["limit given twice", "/audit?limit=1&limit=2"],
    ["empty actorId", "/audit?actorId="],
  ])("answers 400 invalid_input for %s", async (_label, path) => {
    const { app } = await build();
    const token = await signIn(app, ADMIN_EMAIL);
    const res = await get(app, token, path);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });
});