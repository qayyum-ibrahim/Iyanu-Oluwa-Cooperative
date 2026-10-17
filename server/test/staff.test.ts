import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/memory-store.js";
import { verifyPassword } from "../src/password.js";
import {
  createStaff,
  listStaff,
  setStaffPermissions,
  type StaffActor,
  type StaffResult,
} from "../src/staff.js";
import type { Store } from "../src/store.js";

// Fake values for tests only.
const PASSWORD = "test-only-staff-password-1";
const NEW_EMAIL = "new.staff@example.test";

async function setup() {
  const store = createMemoryStore();
  const admin = await store.users.create({
    email: "admin@example.test",
    passwordHash: "not-a-real-hash",
    displayName: "Admin",
    role: "SUPER_ADMIN",
  });
  const adminActor: StaffActor = {
    id: admin.id,
    subject: { role: "SUPER_ADMIN", isActive: true, permissions: [] },
  };
  return { store, admin, adminActor };
}

const staffActor = (permissions: string[] = ["members.view"]): StaffActor => ({
  id: "some-staff-id",
  subject: { role: "STAFF", isActive: true, permissions },
});

const input = (over: Record<string, unknown> = {}) => ({
  email: " New.Staff@Example.TEST ",
  password: PASSWORD,
  displayName: "  New Staff  ",
  permissions: ["payments.create", "dashboard"],
  ...over,
});

function value<T>(result: StaffResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.value;
}

describe("createStaff", () => {
  it("creates an active STAFF account with a clean email and name, and a hash that verifies", async () => {
    const { store, adminActor } = await setup();
    const view = value(await createStaff(store, adminActor, input()));
    expect(view).toMatchObject({
      email: NEW_EMAIL,
      displayName: "New Staff",
      role: "STAFF",
      isActive: true,
    });
    expect(view.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(view)).not.toContain("argon2");
    const stored = await store.users.findByEmail(NEW_EMAIL);
    expect(stored?.id).toBe(view.id);
    expect(stored?.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(stored?.passwordHash ?? "", PASSWORD)).toBe(true);
  });

  it("saves permissions without duplicates, in table order", async () => {
    const { store, adminActor } = await setup();
    const view = value(
      await createStaff(
        store,
        adminActor,
        input({ permissions: ["members.view", "dashboard", "members.view"] }),
      ),
    );
    expect(view.permissions).toEqual(["dashboard", "members.view"]);
    expect((await store.users.findById(view.id))?.permissions).toEqual(["dashboard", "members.view"]);
  });

  it("gives no permissions when none are asked for", async () => {
    const { store, adminActor } = await setup();
    const withoutList = {
      email: " New.Staff@Example.TEST ",
      password: PASSWORD,
      displayName: "New Staff",
    };
    const view = value(await createStaff(store, adminActor, withoutList));
    expect(view.permissions).toEqual([]);
  });

  it("writes one staff.created entry with the caller as actor, and no password or email in it", async () => {
    const { store, admin, adminActor } = await setup();
    const view = value(await createStaff(store, adminActor, input()));
    const entries = await store.audit.listByActor(admin.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: admin.id,
      action: "staff.created",
      entityType: "User",
      entityId: view.id,
      detail: "permissions=dashboard,payments.create",
    });
    const text = JSON.stringify(entries);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain("new.staff@");
    expect(text).not.toContain("argon2");
  });

  it("refuses an unknown permission and saves nothing", async () => {
    const { store, adminActor } = await setup();
    const result = await createStaff(store, adminActor, input({ permissions: ["dashboard", "nope"] }));
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(await store.users.findByEmail(NEW_EMAIL)).toBeNull();
  });

  it("refuses to grant users.manage and saves nothing", async () => {
    const { store, adminActor } = await setup();
    const result = await createStaff(store, adminActor, input({ permissions: ["users.manage"] }));
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(await store.users.findByEmail(NEW_EMAIL)).toBeNull();
  });

  it.each([
    ["a bad email", { email: "nope" }],
    ["a short password", { password: "short" }],
    ["a password that is not text", { password: 123456789012 }],
    ["a blank name", { displayName: "   " }],
    ["a name that is not text", { displayName: 42 }],
    ["a name that is too long", { displayName: "x".repeat(101) }],
  ])("refuses %s and saves nothing", async (_label, over) => {
    const { store, adminActor } = await setup();
    const result = await createStaff(store, adminActor, input(over));
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(await store.users.findByEmail(NEW_EMAIL)).toBeNull();
    expect((await store.users.list()).length).toBe(1);
  });

  it("refuses a second account with the same email, whatever the letter case", async () => {
    const { store, adminActor } = await setup();
    value(await createStaff(store, adminActor, input()));
    const again = await createStaff(store, adminActor, input({ email: "NEW.STAFF@example.test" }));
    expect(again).toEqual({ ok: false, reason: "email_taken" });
  });

  it("refuses a Staff caller, even one holding loans.disburse and payoff.process (DR-14)", async () => {
    const { store } = await setup();
    const caller = staffActor(["loans.disburse", "payoff.process", "members.create"]);
    const result = await createStaff(store, caller, input({ permissions: ["loans.disburse"] }));
    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.users.findByEmail(NEW_EMAIL)).toBeNull();
  });

  it("refuses an inactive Super Admin", async () => {
    const { store, adminActor } = await setup();
    const inactive: StaffActor = { ...adminActor, subject: { ...adminActor.subject, isActive: false } };
    expect(await createStaff(store, inactive, input())).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.users.findByEmail(NEW_EMAIL)).toBeNull();
  });

  it("refuses a permission list that is not a list", async () => {
    const { store, adminActor } = await setup();
    for (const bad of ["dashboard", null, 5, { a: 1 }]) {
      const result = await createStaff(store, adminActor, input({ permissions: bad }));
      expect(result).toEqual({ ok: false, reason: "invalid_input" });
    }
    expect(await store.users.findByEmail(NEW_EMAIL)).toBeNull();
  });

  it("lets the Super Admin grant loans.disburse and payoff.process (DR-14)", async () => {
    const { store, adminActor } = await setup();
    const view = value(
      await createStaff(store, adminActor, input({ permissions: ["payoff.process", "loans.disburse"] })),
    );
    expect(view.permissions).toEqual(["loans.disburse", "payoff.process"]);
  });

  it("does not hide an audit failure", async () => {
    const { store, adminActor } = await setup();
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
    await expect(createStaff(broken, adminActor, input())).rejects.toThrow("audit down");
  });
});

describe("listStaff", () => {
  it("lists Staff only, with their permissions and no hash", async () => {
    const { store, adminActor } = await setup();
    const created = value(await createStaff(store, adminActor, input()));
    const list = value(await listStaff(store, adminActor));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, role: "STAFF", permissions: ["dashboard", "payments.create"] });
    const text = JSON.stringify(list);
    expect(text).not.toContain("argon2");
    expect(text).not.toContain("admin@example.test");
  });

  it("refuses a Staff caller", async () => {
    const { store } = await setup();
    expect(await listStaff(store, staffActor())).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns an empty list when there is no staff", async () => {
    const { store, adminActor } = await setup();
    expect(value(await listStaff(store, adminActor))).toEqual([]);
  });
});

describe("setStaffPermissions", () => {
  async function withStaff() {
    const base = await setup();
    const staff = value(await createStaff(base.store, base.adminActor, input()));
    return { ...base, staff };
  }

  it("replaces the list (clean, table order) and writes staff.permissions_changed with before and after", async () => {
    const { store, admin, adminActor, staff } = await withStaff();
    const view = value(
      await setStaffPermissions(store, adminActor, staff.id, ["members.view", "dashboard", "dashboard"]),
    );
    expect(view.permissions).toEqual(["dashboard", "members.view"]);
    expect((await store.users.findById(staff.id))?.permissions).toEqual(["dashboard", "members.view"]);
    const changed = (await store.audit.listByActor(admin.id)).filter(
      (e) => e.action === "staff.permissions_changed",
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      actorId: admin.id,
      entityId: staff.id,
      detail: "before=dashboard,payments.create after=dashboard,members.view",
    });
  });

  it("clears the list when given an empty list", async () => {
    const { store, adminActor, staff } = await withStaff();
    expect(value(await setStaffPermissions(store, adminActor, staff.id, [])).permissions).toEqual([]);
  });

  it("answers not_found for an unknown id and writes nothing", async () => {
    const { store, admin, adminActor } = await withStaff();
    expect(await setStaffPermissions(store, adminActor, "no-such-id", ["dashboard"])).toEqual({
      ok: false,
      reason: "not_found",
    });
    const changed = (await store.audit.listByActor(admin.id)).filter(
      (e) => e.action === "staff.permissions_changed",
    );
    expect(changed).toHaveLength(0);
  });

  it("answers not_found for an id that is not text", async () => {
    const { store, adminActor } = await withStaff();
    expect(await setStaffPermissions(store, adminActor, 42, ["dashboard"])).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("does not change the Super Admin through this function", async () => {
    const { store, admin, adminActor } = await withStaff();
    expect(await setStaffPermissions(store, adminActor, admin.id, ["dashboard"])).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await store.users.findById(admin.id))?.permissions).toEqual([]);
  });

  it("refuses an unknown permission and leaves the list unchanged", async () => {
    const { store, adminActor, staff } = await withStaff();
    expect(await setStaffPermissions(store, adminActor, staff.id, ["dashboard", "nope"])).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect((await store.users.findById(staff.id))?.permissions).toEqual(["dashboard", "payments.create"]);
  });

  it("refuses users.manage and leaves the list unchanged", async () => {
    const { store, adminActor, staff } = await withStaff();
    expect(await setStaffPermissions(store, adminActor, staff.id, ["users.manage"])).toEqual({
      ok: false,
      reason: "invalid_input",
    });
    expect((await store.users.findById(staff.id))?.permissions).toEqual(["dashboard", "payments.create"]);
  });

  it("refuses a Staff caller and leaves the list unchanged", async () => {
    const { store, staff } = await withStaff();
    const caller = staffActor(["loans.disburse", "payoff.process"]);
    expect(await setStaffPermissions(store, caller, staff.id, ["loans.disburse"])).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect((await store.users.findById(staff.id))?.permissions).toEqual(["dashboard", "payments.create"]);
  });
});