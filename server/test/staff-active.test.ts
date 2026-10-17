import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { authenticate } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { issueSession, refreshSession } from "../src/sessions.js";
import {
  deactivateStaff,
  listStaff,
  reactivateStaff,
  type StaffActor,
  type StaffResult,
} from "../src/staff.js";
import type { Store } from "../src/store.js";
import { hashRefreshToken } from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-staff-active-0123456789";
const PASSWORD = "test-only-password-123";
const ADMIN_EMAIL = "admin@example.test";
const STAFF_EMAIL = "staff@example.test";
const OTHER_EMAIL = "other@example.test";
const T0 = new Date("2026-10-16T10:00:00.000Z");

let HASH = "";
beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

async function setup() {
  const store = createMemoryStore();
  const admin = await store.users.create({
    email: ADMIN_EMAIL,
    passwordHash: HASH,
    displayName: "Admin",
    role: "SUPER_ADMIN",
  });
  const staff = await store.users.create({
    email: STAFF_EMAIL,
    passwordHash: HASH,
    displayName: "Staff",
    permissions: ["members.view"],
  });
  const other = await store.users.create({
    email: OTHER_EMAIL,
    passwordHash: HASH,
    displayName: "Other",
  });
  const adminActor: StaffActor = {
    id: admin.id,
    subject: { role: "SUPER_ADMIN", isActive: true, permissions: [] },
  };
  return { store, admin, staff, other, adminActor };
}

const staffActor = (permissions = ["loans.disburse", "payoff.process"]): StaffActor => ({
  id: "some-staff-id",
  subject: { role: "STAFF", isActive: true, permissions },
});

function value<T>(result: StaffResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.value;
}

const tokenRecord = (store: Store, token: string) =>
  store.refreshTokens.findByHash(hashRefreshToken(token));

async function entries(store: Store, actorId: string, action: string) {
  return (await store.audit.listByActor(actorId)).filter((e) => e.action === action);
}

describe("deactivateStaff", () => {
  it("makes the account inactive and returns the view", async () => {
    const { store, staff, adminActor } = await setup();
    const view = value(await deactivateStaff(store, adminActor, staff.id, T0));
    expect(view).toMatchObject({ id: staff.id, role: "STAFF", isActive: false });
    expect(JSON.stringify(view)).not.toContain("argon2");
    expect((await store.users.findById(staff.id))?.isActive).toBe(false);
  });

  it("revokes every refresh token of that user and no one else's", async () => {
    const { store, staff, other, adminActor } = await setup();
    const a = await issueSession(store, SECRET, staff.id, T0);
    const b = await issueSession(store, SECRET, staff.id, T0);
    const c = await issueSession(store, SECRET, other.id, T0);
    await deactivateStaff(store, adminActor, staff.id, T0);
    for (const s of [a, b]) {
      expect(await tokenRecord(store, s.refreshToken)).toMatchObject({ usedAt: null });
      expect((await tokenRecord(store, s.refreshToken))?.revokedAt).not.toBeNull();
    }
    expect((await tokenRecord(store, c.refreshToken))?.revokedAt).toBeNull();
    expect(await refreshSession(store, SECRET, a.refreshToken, T0)).toEqual({ ok: false });
    expect((await refreshSession(store, SECRET, c.refreshToken, T0)).ok).toBe(true);
  });

  it("writes one staff.deactivated entry with the caller as actor and no email or password", async () => {
    const { store, admin, staff, adminActor } = await setup();
    await issueSession(store, SECRET, staff.id, T0);
    await issueSession(store, SECRET, staff.id, T0);
    await deactivateStaff(store, adminActor, staff.id, T0);
    const list = await entries(store, admin.id, "staff.deactivated");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      actorId: admin.id,
      entityType: "User",
      entityId: staff.id,
      detail: "tokens_revoked=2",
    });
    const text = JSON.stringify(list);
    expect(text).not.toContain(STAFF_EMAIL);
    expect(text).not.toContain(PASSWORD);
  });

  it("changes nothing and writes nothing when the account is already inactive", async () => {
    const { store, admin, staff, adminActor } = await setup();
    await deactivateStaff(store, adminActor, staff.id, T0);
    const again = value(await deactivateStaff(store, adminActor, staff.id, T0));
    expect(again.isActive).toBe(false);
    expect(await entries(store, admin.id, "staff.deactivated")).toHaveLength(1);
  });

  it("refuses sign-in with the right password, and allows it again after reactivation", async () => {
    const { store, staff, adminActor } = await setup();
    expect((await authenticate(store, STAFF_EMAIL, PASSWORD)).ok).toBe(true);
    await deactivateStaff(store, adminActor, staff.id, T0);
    expect(await authenticate(store, STAFF_EMAIL, PASSWORD)).toEqual({ ok: false });
    await reactivateStaff(store, adminActor, staff.id, T0);
    expect((await authenticate(store, STAFF_EMAIL, PASSWORD)).ok).toBe(true);
  });

  it("refuses a Staff caller, even one holding loans.disburse and payoff.process (DR-14)", async () => {
    const { store, staff } = await setup();
    const session = await issueSession(store, SECRET, staff.id, T0);
    expect(await deactivateStaff(store, staffActor(), staff.id, T0)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect((await store.users.findById(staff.id))?.isActive).toBe(true);
    expect((await tokenRecord(store, session.refreshToken))?.revokedAt).toBeNull();
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, staff, adminActor } = await setup();
    const inactive: StaffActor = { ...adminActor, subject: { ...adminActor.subject, isActive: false } };
    expect(await deactivateStaff(store, inactive, staff.id, T0)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect((await store.users.findById(staff.id))?.isActive).toBe(true);
  });

  it.each(["no-such-id", "", 42])("answers not_found for the id %s and writes nothing", async (bad) => {
    const { store, admin, adminActor } = await setup();
    expect(await deactivateStaff(store, adminActor, bad, T0)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await entries(store, admin.id, "staff.deactivated")).toHaveLength(0);
  });

  it("does not deactivate the Super Admin (not_found)", async () => {
    const { store, admin, adminActor } = await setup();
    expect(await deactivateStaff(store, adminActor, admin.id, T0)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await store.users.findById(admin.id))?.isActive).toBe(true);
  });

  it("does not hide an audit failure, and the account is already closed by then", async () => {
    const { store, staff, adminActor } = await setup();
    const session = await issueSession(store, SECRET, staff.id, T0);
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
    await expect(deactivateStaff(broken, adminActor, staff.id, T0)).rejects.toThrow("audit down");
    expect((await store.users.findById(staff.id))?.isActive).toBe(false);
    expect((await tokenRecord(store, session.refreshToken))?.revokedAt).not.toBeNull();
  });
});

describe("reactivateStaff", () => {
  it("makes the account active again and writes one staff.reactivated entry", async () => {
    const { store, admin, staff, adminActor } = await setup();
    await deactivateStaff(store, adminActor, staff.id, T0);
    const view = value(await reactivateStaff(store, adminActor, staff.id, T0));
    expect(view.isActive).toBe(true);
    const list = await entries(store, admin.id, "staff.reactivated");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ actorId: admin.id, entityId: staff.id, detail: null });
  });

  it("keeps old sessions ended", async () => {
    const { store, staff, adminActor } = await setup();
    const session = await issueSession(store, SECRET, staff.id, T0);
    await deactivateStaff(store, adminActor, staff.id, T0);
    await reactivateStaff(store, adminActor, staff.id, T0);
    expect(await refreshSession(store, SECRET, session.refreshToken, T0)).toEqual({ ok: false });
  });

  it("changes nothing and writes nothing when the account is already active", async () => {
    const { store, admin, staff, adminActor } = await setup();
    const view = value(await reactivateStaff(store, adminActor, staff.id, T0));
    expect(view.isActive).toBe(true);
    expect(await entries(store, admin.id, "staff.reactivated")).toHaveLength(0);
  });

  it("refuses a Staff caller", async () => {
    const { store, staff, adminActor } = await setup();
    await deactivateStaff(store, adminActor, staff.id, T0);
    expect(await reactivateStaff(store, staffActor(), staff.id, T0)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect((await store.users.findById(staff.id))?.isActive).toBe(false);
  });

  it("answers not_found for the Super Admin id", async () => {
    const { store, admin, adminActor } = await setup();
    expect(await reactivateStaff(store, adminActor, admin.id, T0)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("listStaff after deactivation", () => {
  it("shows isActive false", async () => {
    const { store, staff, adminActor } = await setup();
    await deactivateStaff(store, adminActor, staff.id, T0);
    const list = value(await listStaff(store, adminActor));
    expect(list.find((s) => s.id === staff.id)?.isActive).toBe(false);
  });
});

describe("POST /staff/:id/deactivate and /reactivate", () => {
  async function build() {
    const base = await setup();
    const app = createApp({ store: base.store, tokenSecret: SECRET, now: () => T0 });
    return { ...base, app };
  }
  type App = Awaited<ReturnType<typeof build>>["app"];

  async function signIn(app: App, email: string) {
    const res = await request(app).post("/auth/login").send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; refreshToken: string };
  }
  const act = (app: App, token: string, id: string, what: "deactivate" | "reactivate") =>
    request(app).post(`/staff/${id}/${what}`).set("Authorization", `Bearer ${token}`);

  it.each(["deactivate", "reactivate"] as const)("%s answers 401 without a token", async (what) => {
    const { app, staff } = await build();
    const res = await request(app).post(`/staff/${staff.id}/${what}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it.each(["deactivate", "reactivate"] as const)("%s answers 403 to Staff", async (what) => {
    const { app, staff, store } = await build();
    const { accessToken } = await signIn(app, STAFF_EMAIL);
    const res = await act(app, accessToken, staff.id, what);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect((await store.users.findById(staff.id))?.isActive).toBe(true);
  });

  it("deactivates for the Super Admin: 200, the view, no-store", async () => {
    const { app, staff } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await act(app, accessToken, staff.id, "deactivate");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.staff).toMatchObject({ id: staff.id, role: "STAFF", isActive: false });
    expect(JSON.stringify(res.body)).not.toContain("argon2");
  });

  it("refuses the deactivated user's existing access token at once", async () => {
    const { app, staff } = await build();
    const adminToken = (await signIn(app, ADMIN_EMAIL)).accessToken;
    const staffToken = (await signIn(app, STAFF_EMAIL)).accessToken;
    expect((await request(app).get("/auth/me").set("Authorization", `Bearer ${staffToken}`)).status).toBe(200);
    await act(app, adminToken, staff.id, "deactivate");
    const after = await request(app).get("/auth/me").set("Authorization", `Bearer ${staffToken}`);
    expect(after.status).toBe(401);
  });

  it("refuses the deactivated user's refresh token", async () => {
    const { app, staff } = await build();
    const adminToken = (await signIn(app, ADMIN_EMAIL)).accessToken;
    const { refreshToken } = await signIn(app, STAFF_EMAIL);
    await act(app, adminToken, staff.id, "deactivate");
    const res = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("refuses the deactivated user's sign-in", async () => {
    const { app, staff } = await build();
    const adminToken = (await signIn(app, ADMIN_EMAIL)).accessToken;
    await act(app, adminToken, staff.id, "deactivate");
    const res = await request(app).post("/auth/login").send({ email: STAFF_EMAIL, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid_credentials" });
  });

  it("reactivates for the Super Admin, and the user can sign in again", async () => {
    const { app, staff } = await build();
    const adminToken = (await signIn(app, ADMIN_EMAIL)).accessToken;
    await act(app, adminToken, staff.id, "deactivate");
    const res = await act(app, adminToken, staff.id, "reactivate");
    expect(res.status).toBe(200);
    expect(res.body.staff.isActive).toBe(true);
    await signIn(app, STAFF_EMAIL);
  });

  it("answers 404 for an unknown id", async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await act(app, accessToken, "no-such-id", "deactivate");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 404 for the Super Admin's own id and leaves the account active", async () => {
    const { app, admin, store } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await act(app, accessToken, admin.id, "deactivate");
    expect(res.status).toBe(404);
    expect((await store.users.findById(admin.id))?.isActive).toBe(true);
  });

  it("shows isActive false in GET /staff", async () => {
    const { app, staff } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    await act(app, accessToken, staff.id, "deactivate");
    const res = await request(app).get("/staff").set("Authorization", `Bearer ${accessToken}`);
    const found = (res.body.staff as { id: string; isActive: boolean }[]).find((s) => s.id === staff.id);
    expect(found?.isActive).toBe(false);
  });
});