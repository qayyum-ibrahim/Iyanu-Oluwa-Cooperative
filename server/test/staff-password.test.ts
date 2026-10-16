import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { LOCKOUT_MAX_FAILURES, authenticate } from "../src/auth.js";
import { createMemoryStore } from "../src/memory-store.js";
import { hashPassword } from "../src/password.js";
import { issueSession, refreshSession } from "../src/sessions.js";
import { resetStaffPassword, type StaffActor, type StaffResult } from "../src/staff.js";
import type { Store } from "../src/store.js";
import { hashRefreshToken } from "../src/tokens.js";

// Fake values for tests only.
const SECRET = "test-only-secret-for-staff-password-0123456789";
const PASSWORD = "test-only-password-123";
const NEW_PASSWORD = "reset-staff-test-password-7";
const WRONG = "wrong-password-123";
const ADMIN_EMAIL = "admin@example.test";
const STAFF_EMAIL = "staff@example.test";
const OTHER_EMAIL = "other@example.test";
const T0 = new Date("2026-10-16T10:00:00.000Z");

// argon2 is slow on purpose, and the owner's computer may be slower than mine.
const slow = { timeout: 30_000 };

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

const entries = async (store: Store, actorId: string, action: string) =>
  (await store.audit.listByActor(actorId)).filter((e) => e.action === action);

const hashOf = async (store: Store, id: string) => (await store.users.findById(id))?.passwordHash;

describe("resetStaffPassword", () => {
  it("sets the new password: the old one stops working, the new one works", slow, async () => {
    const { store, staff, adminActor } = await setup();
    const view = value(await resetStaffPassword(store, adminActor, staff.id, NEW_PASSWORD, T0));
    expect(view).toMatchObject({ id: staff.id, role: "STAFF", isActive: true });
    expect(JSON.stringify(view)).not.toContain("argon2");
    expect(JSON.stringify(view)).not.toContain(NEW_PASSWORD);
    expect(await authenticate(store, STAFF_EMAIL, PASSWORD, T0)).toEqual({ ok: false });
    expect((await authenticate(store, STAFF_EMAIL, NEW_PASSWORD, T0)).ok).toBe(true);
  });

  it("ends every refresh token of that user and no one else's", slow, async () => {
    const { store, staff, other, adminActor } = await setup();
    const a = await issueSession(store, SECRET, staff.id, T0);
    const b = await issueSession(store, SECRET, staff.id, T0);
    const c = await issueSession(store, SECRET, other.id, T0);
    await resetStaffPassword(store, adminActor, staff.id, NEW_PASSWORD, T0);
    expect((await tokenRecord(store, a.refreshToken))?.revokedAt).not.toBeNull();
    expect((await tokenRecord(store, b.refreshToken))?.revokedAt).not.toBeNull();
    expect(await refreshSession(store, SECRET, a.refreshToken, T0)).toEqual({ ok: false });
    expect((await refreshSession(store, SECRET, c.refreshToken, T0)).ok).toBe(true);
  });

  it("writes one staff.password_reset entry with the caller as actor and no email or password", slow, async () => {
    const { store, admin, staff, adminActor } = await setup();
    await issueSession(store, SECRET, staff.id, T0);
    await issueSession(store, SECRET, staff.id, T0);
    await resetStaffPassword(store, adminActor, staff.id, NEW_PASSWORD, T0);
    const list = await entries(store, admin.id, "staff.password_reset");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      actorId: admin.id,
      entityType: "User",
      entityId: staff.id,
      detail: "tokens_revoked=2",
    });
    const text = JSON.stringify(list);
    expect(text).not.toContain(STAFF_EMAIL);
    expect(text).not.toContain(NEW_PASSWORD);
  });

  it("clears the lockout of the target (A-65)", slow, async () => {
    const { store, staff, adminActor } = await setup();
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      await authenticate(store, STAFF_EMAIL, WRONG, T0);
    }
    expect(await authenticate(store, STAFF_EMAIL, PASSWORD, T0)).toEqual({ ok: false });
    await resetStaffPassword(store, adminActor, staff.id, NEW_PASSWORD, T0);
    expect((await authenticate(store, STAFF_EMAIL, NEW_PASSWORD, T0)).ok).toBe(true);
  });

  it("works for an inactive account and leaves it inactive", slow, async () => {
    const { store, staff, adminActor } = await setup();
    await store.users.setActive(staff.id, false);
    const view = value(await resetStaffPassword(store, adminActor, staff.id, NEW_PASSWORD, T0));
    expect(view.isActive).toBe(false);
    expect(await hashOf(store, staff.id)).not.toBe(HASH);
  });

  it("refuses a Staff caller, even one holding loans.disburse and payoff.process (DR-14)", slow, async () => {
    const { store, staff } = await setup();
    const session = await issueSession(store, SECRET, staff.id, T0);
    expect(await resetStaffPassword(store, staffActor(), staff.id, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await hashOf(store, staff.id)).toBe(HASH);
    expect((await refreshSession(store, SECRET, session.refreshToken, T0)).ok).toBe(true);
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, staff, adminActor } = await setup();
    const inactive: StaffActor = {
      ...adminActor,
      subject: { ...adminActor.subject, isActive: false },
    };
    expect(await resetStaffPassword(store, inactive, staff.id, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await hashOf(store, staff.id)).toBe(HASH);
  });

  it.each(["no-such-id", "", 42])("answers not_found for the id %s and writes nothing", async (bad) => {
    const { store, admin, adminActor } = await setup();
    expect(await resetStaffPassword(store, adminActor, bad, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await entries(store, admin.id, "staff.password_reset")).toHaveLength(0);
  });

  it("does not reset the Super Admin's password here (not_found)", async () => {
    const { store, admin, adminActor } = await setup();
    expect(await resetStaffPassword(store, adminActor, admin.id, NEW_PASSWORD, T0)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await hashOf(store, admin.id)).toBe(HASH);
  });

  it.each(["short", "a".repeat(129), 12345, undefined])(
    "answers invalid_input for the password %s and changes nothing",
    async (bad) => {
      const { store, admin, staff, adminActor } = await setup();
      expect(await resetStaffPassword(store, adminActor, staff.id, bad, T0)).toEqual({
        ok: false,
        reason: "invalid_input",
      });
      expect(await hashOf(store, staff.id)).toBe(HASH);
      expect(await entries(store, admin.id, "staff.password_reset")).toHaveLength(0);
    },
  );

  it("does not hide an audit failure; the password is already changed by then (A-62)", slow, async () => {
    const { store, staff, adminActor } = await setup();
    const broken: Store = {
      ...store,
      audit: {
        append: async () => {
          throw new Error("audit down");
        },
        listByActor: store.audit.listByActor,
      },
    };
    await expect(
      resetStaffPassword(broken, adminActor, staff.id, NEW_PASSWORD, T0),
    ).rejects.toThrow("audit down");
    expect(await hashOf(store, staff.id)).not.toBe(HASH);
  });
});

describe("PUT /staff/:id/password", () => {
  async function build() {
    const base = await setup();
    const app = createApp({ store: base.store, tokenSecret: SECRET, now: () => T0 });
    return { ...base, app };
  }
  type App = Awaited<ReturnType<typeof build>>["app"];

  async function signIn(app: App, email: string, password = PASSWORD) {
    const res = await request(app).post("/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; refreshToken: string };
  }
  const reset = (app: App, token: string, id: string, body: unknown) =>
    request(app)
      .put(`/staff/${id}/password`)
      .set("Authorization", `Bearer ${token}`)
      .send(body as object);

  it("answers 401 without a token", async () => {
    const { app, staff } = await build();
    const res = await request(app)
      .put(`/staff/${staff.id}/password`)
      .send({ password: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff and changes nothing", slow, async () => {
    const { app, staff, store } = await build();
    const { accessToken } = await signIn(app, STAFF_EMAIL);
    const res = await reset(app, accessToken, staff.id, { password: NEW_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await hashOf(store, staff.id)).toBe(HASH);
  });

  it("resets for the Super Admin: 200, the view, no-store, no hash, and the new password works", slow, async () => {
    const { app, staff } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await reset(app, accessToken, staff.id, { password: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.staff).toMatchObject({ id: staff.id, role: "STAFF", isActive: true });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("argon2");
    expect(text).not.toContain(NEW_PASSWORD);
    await signIn(app, STAFF_EMAIL, NEW_PASSWORD);
    const old = await request(app).post("/auth/login").send({ email: STAFF_EMAIL, password: PASSWORD });
    expect(old.status).toBe(401);
  });

  it("ends the target's refresh token", slow, async () => {
    const { app, staff } = await build();
    const adminToken = (await signIn(app, ADMIN_EMAIL)).accessToken;
    const { refreshToken } = await signIn(app, STAFF_EMAIL);
    await reset(app, adminToken, staff.id, { password: NEW_PASSWORD });
    const res = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(401);
  });

  it("answers 404 for an unknown id", slow, async () => {
    const { app } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await reset(app, accessToken, "no-such-id", { password: NEW_PASSWORD });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 404 for the Super Admin's own id and changes nothing", slow, async () => {
    const { app, admin, store } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await reset(app, accessToken, admin.id, { password: NEW_PASSWORD });
    expect(res.status).toBe(404);
    expect(await hashOf(store, admin.id)).toBe(HASH);
  });

  it("answers 400 invalid_input for a short password", slow, async () => {
    const { app, staff } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await reset(app, accessToken, staff.id, { password: "short" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 invalid_input when the password field is missing", slow, async () => {
    const { app, staff } = await build();
    const { accessToken } = await signIn(app, ADMIN_EMAIL);
    const res = await reset(app, accessToken, staff.id, {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });
});