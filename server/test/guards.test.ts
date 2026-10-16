import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { getAuth, requireAuth, requirePermission } from "../src/guards.js";
import { createMemoryStore } from "../src/memory-store.js";
import { ALL_PERMISSIONS } from "../src/permissions.js";
import type { Store } from "../src/store.js";
import { ACCESS_TOKEN_SECONDS, createAccessToken } from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-guards-0123456789ab";
const OTHER_SECRET = "another-test-only-secret-9876543210zz";
const HASH = "test-hash-value-not-real";
const T0 = new Date("2026-10-16T10:00:00.000Z");

/** A store that reports every user as inactive (the Store cannot deactivate yet, A-30). */
function withInactiveUsers(base: Store): Store {
  return {
    ...base,
    users: {
      ...base.users,
      findById: async (id) => {
        const user = await base.users.findById(id);
        return user === null ? null : { ...user, isActive: false };
      },
    },
  };
}

async function build(wrap?: (store: Store) => Store) {
  const base = createMemoryStore();
  const admin = await base.users.create({
    email: "admin@example.test",
    passwordHash: HASH,
    displayName: "Admin",
    role: "SUPER_ADMIN",
  });
  const staff = await base.users.create({
    email: "staff@example.test",
    passwordHash: HASH,
    displayName: "Staff",
  });
  const clock = { now: T0 };
  const deps = { store: wrap ? wrap(base) : base, tokenSecret: SECRET, now: () => clock.now };
  const reached = vi.fn();

  const app: Express = express();
  app.get("/who", requireAuth(deps), (_req, res) => {
    reached();
    res.json(getAuth(res));
  });
  app.get("/plain", (_req, res) => {
    res.json({ auth: getAuth(res) });
  });
  app.get("/permission-only", requirePermission("dashboard"), (_req, res) => {
    reached();
    res.json({ ok: true });
  });
  for (const permission of ALL_PERMISSIONS) {
    app.get(`/needs/${permission}`, requireAuth(deps), requirePermission(permission), (_req, res) => {
      reached();
      res.json({ ok: true });
    });
  }
  const tokenFor = (userId: string, at: Date = T0) => createAccessToken(SECRET, userId, at);
  return { app, admin, staff, clock, reached, tokenFor };
}

const bearer = (token: string) => `Bearer ${token}`;

describe("requireAuth", () => {
  it("answers 401 with a plain body and no caching when there is no header", async () => {
    const { app, reached } = await build();
    const res = await request(app).get("/who");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(reached).not.toHaveBeenCalled();
  });

  const badHeaders: [string, (token: string) => string][] = [
    ["wrong scheme", (t) => `Basic ${t}`],
    ["no scheme", (t) => t],
    ["scheme only", () => "Bearer"],
    ["two spaces", (t) => `Bearer  ${t}`],
    ["extra part", (t) => `Bearer ${t} extra`],
    ["not a token", () => "Bearer not.a.token"],
  ];

  it.each(badHeaders)("refuses a bad Authorization header (%s)", async (_name, make) => {
    const { app, admin, tokenFor, reached } = await build();
    const res = await request(app).get("/who").set("Authorization", make(tokenFor(admin.id)));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(reached).not.toHaveBeenCalled();
  });

  it("ignores a token in the query string", async () => {
    const { app, admin, tokenFor } = await build();
    const res = await request(app).get(`/who?access_token=${tokenFor(admin.id)}`);
    expect(res.status).toBe(401);
  });

  it("accepts the scheme in any letter case", async () => {
    const { app, admin, tokenFor } = await build();
    const res = await request(app).get("/who").set("Authorization", `bearer ${tokenFor(admin.id)}`);
    expect(res.status).toBe(200);
  });

  it("refuses a token signed with another secret", async () => {
    const { app, admin } = await build();
    const token = createAccessToken(OTHER_SECRET, admin.id, T0);
    const res = await request(app).get("/who").set("Authorization", bearer(token));
    expect(res.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const { app, admin, tokenFor, clock } = await build();
    const token = tokenFor(admin.id);
    clock.now = new Date(T0.getTime() + ACCESS_TOKEN_SECONDS * 1000);
    const res = await request(app).get("/who").set("Authorization", bearer(token));
    expect(res.status).toBe(401);
  });

  it("accepts a token one second before it expires", async () => {
    const { app, admin, tokenFor, clock } = await build();
    const token = tokenFor(admin.id);
    clock.now = new Date(T0.getTime() + (ACCESS_TOKEN_SECONDS - 1) * 1000);
    const res = await request(app).get("/who").set("Authorization", bearer(token));
    expect(res.status).toBe(200);
  });

  it("refuses a token issued in the future", async () => {
    const { app, admin, tokenFor } = await build();
    const token = tokenFor(admin.id, new Date(T0.getTime() + 3_600_000));
    const res = await request(app).get("/who").set("Authorization", bearer(token));
    expect(res.status).toBe(401);
  });

  it("refuses a valid token for a user that does not exist", async () => {
    const { app, tokenFor } = await build();
    const res = await request(app).get("/who").set("Authorization", bearer(tokenFor("no-such-user")));
    expect(res.status).toBe(401);
  });

  it("refuses an inactive user who holds a valid token", async () => {
    const { app, staff, tokenFor, reached } = await build(withInactiveUsers);
    const res = await request(app).get("/who").set("Authorization", bearer(tokenFor(staff.id)));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(reached).not.toHaveBeenCalled();
  });

  it("lets a valid token through and gives the handler the user, with no password hash", async () => {
    const { app, staff, tokenFor, reached } = await build();
    const res = await request(app).get("/who").set("Authorization", bearer(tokenFor(staff.id)));
    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      user: { id: staff.id, email: "staff@example.test", displayName: "Staff", role: "STAFF" },
      subject: { role: "STAFF", isActive: true, permissions: [] },
    });
    expect(JSON.stringify(res.body)).not.toContain(HASH);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("requirePermission", () => {
  it.each(ALL_PERMISSIONS)("lets the Super Admin through %s", async (permission) => {
    const { app, admin, tokenFor, reached } = await build();
    const res = await request(app)
      .get(`/needs/${permission}`)
      .set("Authorization", bearer(tokenFor(admin.id)));
    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it.each(ALL_PERMISSIONS)("refuses Staff without grants for %s with 403", async (permission) => {
    const { app, staff, tokenFor, reached } = await build();
    const res = await request(app)
      .get(`/needs/${permission}`)
      .set("Authorization", bearer(tokenFor(staff.id)));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(reached).not.toHaveBeenCalled();
  });

  it("answers 401, not 403, when there is no token", async () => {
    const { app, reached } = await build();
    const res = await request(app).get("/needs/dashboard");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(reached).not.toHaveBeenCalled();
  });

  it("answers 401 when requireAuth did not run before it (fail closed)", async () => {
    const { app, reached } = await build();
    const res = await request(app).get("/permission-only");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(reached).not.toHaveBeenCalled();
  });

  it("refuses an inactive Super Admin with 401", async () => {
    const { app, admin, tokenFor, reached } = await build(withInactiveUsers);
    const res = await request(app)
      .get("/needs/dashboard")
      .set("Authorization", bearer(tokenFor(admin.id)));
    expect(res.status).toBe(401);
    expect(reached).not.toHaveBeenCalled();
  });

  it("getAuth is null on a route with no guard", async () => {
    const { app, admin, tokenFor } = await build();
    const res = await request(app).get("/plain").set("Authorization", bearer(tokenFor(admin.id)));
    expect(res.body).toEqual({ auth: null });
  });
});