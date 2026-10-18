import { describe, expect, it } from "vitest";
import { subjectOf } from "../src/guards.js";
import {
  createMember,
  getMember,
  listMembers,
  type MemberActor,
  type MemberResult,
} from "../src/members.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role, UserRecord } from "../src/store.js";

// Fictional data only (D-08).
async function build() {
  const store = createMemoryStore();
  const make = (name: string, role: Role, permissions: string[]) =>
    store.users.create({
      email: `${name}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role,
      permissions,
    });
  const admin = await make("admin", "SUPER_ADMIN", []);
  const a = await make("staff-a", "STAFF", ["members.create", "members.view"]);
  const b = await make("staff-b", "STAFF", ["members.create", "members.view"]);
  const viewOnly = await make("view-only", "STAFF", ["members.view"]);
  const createOnly = await make("create-only", "STAFF", ["members.create"]);
  return { store, admin, a, b, viewOnly, createOnly };
}

const actorOf = (u: UserRecord): MemberActor => ({ id: u.id, subject: subjectOf(u) });

const input = (over: Record<string, unknown> = {}) => ({
  fullName: "Test Member",
  phone: "08000000001",
  address: "1 Test Street",
  occupation: "Trader",
  ...over,
});

function must<T>(r: MemberResult<T>): T {
  if (!r.ok) throw new Error(`unexpected failure: ${r.reason}`);
  return r.value;
}

const names = (r: MemberResult<{ fullName: string }[]>) => must(r).map((m) => m.fullName);

async function seeded() {
  const ctx = await build();
  const { store, a, b } = ctx;
  const a1 = must(await createMember(store, actorOf(a), input({ fullName: "A One" })));
  const a2 = must(await createMember(store, actorOf(a), input({ fullName: "A Two" })));
  const b1 = must(await createMember(store, actorOf(b), input({ fullName: "B One" })));
  await store.members.setStatus(a2.id, "INACTIVE");
  return { ...ctx, a1, a2, b1 };
}

describe("createMember", () => {
  it("records a member for Staff with the permission: Active, with the actor and a Membership ID", async () => {
    const { store, a } = await build();
    const r = must(await createMember(store, actorOf(a), input()));
    expect(r).toMatchObject({
      membershipId: "IO-001",
      fullName: "Test Member",
      phone: "08000000001",
      address: "1 Test Street",
      occupation: "Trader",
      status: "ACTIVE",
      createdById: a.id,
    });
    expect(new Date(r.createdAt).toISOString()).toBe(r.createdAt);
  });

  it("trims every text field", async () => {
    const { store, a } = await build();
    const r = must(
      await createMember(
        store,
        actorOf(a),
        input({ fullName: "  Ada  Obi ", phone: " 0800 ", address: " 2 Road ", occupation: " Tailor " }),
      ),
    );
    expect(r).toMatchObject({
      fullName: "Ada  Obi",
      phone: "0800",
      address: "2 Road",
      occupation: "Tailor",
    });
  });

  it("gives empty text for missing or null optional fields", async () => {
    const { store, a } = await build();
    const r = must(
      await createMember(store, actorOf(a), { fullName: "Only Name", phone: null }),
    );
    expect(r).toMatchObject({ phone: "", address: "", occupation: "" });
  });

  it("refuses Staff without members.create, and saves nothing", async () => {
    const { store, viewOnly } = await build();
    const r = await createMember(store, actorOf(viewOnly), input());
    expect(r).toEqual({ ok: false, reason: "forbidden" });
    expect(await store.members.list({})).toEqual([]);
  });

  it("lets the Super Admin record a member", async () => {
    const { store, admin } = await build();
    const r = must(await createMember(store, actorOf(admin), input()));
    expect(r.createdById).toBe(admin.id);
  });

  it("accepts a name of exactly 100 characters", async () => {
    const { store, a } = await build();
    const r = await createMember(store, actorOf(a), input({ fullName: "x".repeat(100) }));
    expect(r.ok).toBe(true);
  });

  it.each([
    { label: "empty", value: "" },
    { label: "only spaces", value: "   " },
    { label: "101 characters", value: "x".repeat(101) },
    { label: "a number", value: 123 },
    { label: "missing", value: undefined },
    { label: "null", value: null },
  ])("refuses a full name that is $label", async ({ value }) => {
    const { store, a } = await build();
    const r = await createMember(store, actorOf(a), input({ fullName: value }));
    expect(r).toEqual({ ok: false, reason: "invalid_input" });
    expect(await store.members.list({})).toEqual([]);
  });

  it("accepts optional text of exactly 200 characters", async () => {
    const { store, a } = await build();
    const long = "y".repeat(200);
    const r = await createMember(
      store,
      actorOf(a),
      input({ phone: long, address: long, occupation: long }),
    );
    expect(r.ok).toBe(true);
  });

  it.each([
    { field: "phone", value: "x".repeat(201) },
    { field: "phone", value: 123 },
    { field: "address", value: {} },
    { field: "occupation", value: true },
  ])("refuses a bad $field ($value)", async ({ field, value }) => {
    const { store, a } = await build();
    const r = await createMember(store, actorOf(a), input({ [field]: value }));
    expect(r).toEqual({ ok: false, reason: "invalid_input" });
    expect(await store.members.list({})).toEqual([]);
  });

  it("writes one member.created entry with the actor and the Membership ID only", async () => {
    const { store, a } = await build();
    const r = must(await createMember(store, actorOf(a), input()));
    const entries = await store.audit.listByActor(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "member.created",
      entityType: "Member",
      entityId: r.id,
      detail: "membership_id=IO-001",
    });
    const text = JSON.stringify(entries);
    expect(text).not.toContain("Test Member");
    expect(text).not.toContain("08000000001");
  });

  it("writes no audit entry when the input is refused", async () => {
    const { store, a } = await build();
    await createMember(store, actorOf(a), input({ fullName: "" }));
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });
});

describe("listMembers", () => {
  it("shows Staff only their own Active members", async () => {
    const { store, a } = await seeded();
    expect(names(await listMembers(store, actorOf(a), {}))).toEqual(["A One"]);
  });

  it("shows another Staff user only theirs", async () => {
    const { store, b } = await seeded();
    expect(names(await listMembers(store, actorOf(b), {}))).toEqual(["B One"]);
  });

  it("shows the Super Admin every Active member, in Membership ID order", async () => {
    const { store, admin } = await seeded();
    expect(names(await listMembers(store, actorOf(admin), {}))).toEqual(["A One", "B One"]);
  });

  it("shows every member with status=all", async () => {
    const { store, admin } = await seeded();
    expect(names(await listMembers(store, actorOf(admin), { status: "all" }))).toEqual([
      "A One",
      "A Two",
      "B One",
    ]);
  });

  it("shows only Inactive members with status=inactive", async () => {
    const { store, admin } = await seeded();
    expect(names(await listMembers(store, actorOf(admin), { status: "inactive" }))).toEqual([
      "A Two",
    ]);
  });

  it("accepts the status in any letter case", async () => {
    const { store, admin } = await seeded();
    expect(names(await listMembers(store, actorOf(admin), { status: "INACTIVE" }))).toEqual([
      "A Two",
    ]);
  });

  it.each([
    { label: "unknown text", value: "everyone" },
    { label: "empty text", value: "" },
    { label: "a number", value: 5 },
    { label: "a list", value: ["active"] },
  ])("refuses a status that is $label", async ({ value }) => {
    const { store, admin } = await seeded();
    const r = await listMembers(store, actorOf(admin), { status: value });
    expect(r).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("lets the Super Admin filter by the user who recorded the member", async () => {
    const { store, admin, a } = await seeded();
    expect(names(await listMembers(store, actorOf(admin), { createdById: a.id }))).toEqual([
      "A One",
    ]);
  });

  it("ignores a createdById filter from Staff: they still see only their own", async () => {
    const { store, a, b } = await seeded();
    expect(names(await listMembers(store, actorOf(a), { createdById: b.id }))).toEqual(["A One"]);
  });

  it.each([
    { label: "empty", value: "" },
    { label: "101 characters", value: "x".repeat(101) },
    { label: "a number", value: 7 },
  ])("refuses a createdById that is $label", async ({ value }) => {
    const { store, admin } = await seeded();
    const r = await listMembers(store, actorOf(admin), { createdById: value });
    expect(r).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("refuses Staff without members.view", async () => {
    const { store, createOnly } = await seeded();
    const r = await listMembers(store, actorOf(createOnly), {});
    expect(r).toEqual({ ok: false, reason: "forbidden" });
  });

  it("gives an empty list to Staff who recorded no members", async () => {
    const { store, viewOnly } = await seeded();
    expect(must(await listMembers(store, actorOf(viewOnly), {}))).toEqual([]);
  });
});

describe("getMember", () => {
  it("shows Staff a member they recorded", async () => {
    const { store, a, a1 } = await seeded();
    expect(must(await getMember(store, actorOf(a), a1.id))).toMatchObject({
      id: a1.id,
      fullName: "A One",
    });
  });

  it("shows Staff their own Inactive member too", async () => {
    const { store, a, a2 } = await seeded();
    expect(must(await getMember(store, actorOf(a), a2.id)).status).toBe("INACTIVE");
  });

  it("answers not_found when Staff ask for another user's member", async () => {
    const { store, a, b1 } = await seeded();
    expect(await getMember(store, actorOf(a), b1.id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("shows the Super Admin any member", async () => {
    const { store, admin, b1 } = await seeded();
    expect(must(await getMember(store, actorOf(admin), b1.id)).fullName).toBe("B One");
  });

  it("answers not_found for an unknown id", async () => {
    const { store, admin } = await seeded();
    expect(await getMember(store, actorOf(admin), "no-such-id")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it.each([
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "a number", value: 5 },
  ])("answers not_found for an id that is $label", async ({ value }) => {
    const { store, admin } = await seeded();
    expect(await getMember(store, actorOf(admin), value)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("refuses Staff without members.view", async () => {
    const { store, createOnly, a1 } = await seeded();
    expect(await getMember(store, actorOf(createOnly), a1.id)).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });
});