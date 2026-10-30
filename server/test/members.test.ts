import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subjectOf } from "../src/guards.js";
import {
  createMember,
  getMember,
  listMembers,
  reactivateMember,
  type MemberActor,
  type MemberResult,
} from "../src/members.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createPrismaStore } from "../src/prisma-store.js";
import type { Role, Store, UserRecord } from "../src/store.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

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

describe("listMembers onLoan (D-110)", () => {
  const loan = (store: Store, memberId: string, createdById: string, principal: bigint) =>
    store.loans.create({ memberId, principal, givenOn: "2026-10-20", createdById });
  const pay = (
    store: Store,
    memberId: string,
    createdById: string,
    lines: { category: string; amount: bigint; loanId?: string }[],
  ) =>
    store.payments.create({
      memberId,
      method: "CASH",
      total: lines.reduce((t, l) => t + l.amount, 0n),
      paidOn: "2026-10-21",
      lines,
      createdById,
    });
  const flags = (r: MemberResult<{ fullName: string; onLoan: boolean }[]>) =>
    must(r).map((m) => [m.fullName, m.onLoan]);

  it("is false for a member with no loan", async () => {
    const { store, a } = await seeded();
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", false]]);
  });

  it("is true while a loan is not repaid, partly repaid, and false once fully repaid", async () => {
    const { store, a, a1 } = await seeded();
    const l = await loan(store, a1.id, a.id, 30_000_000n);
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", true]]);
    await pay(store, a1.id, a.id, [{ category: "Loan Repaid", amount: 2_000_000n, loanId: l.id }]);
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", true]]);
    await pay(store, a1.id, a.id, [{ category: "Loan Repaid", amount: 27_999_999n, loanId: l.id }]);
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", true]]);
    await pay(store, a1.id, a.id, [{ category: "Loan Repaid", amount: 1n, loanId: l.id }]);
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", false]]);
  });

  it("is not changed by lines that are not linked to the loan (DR-09)", async () => {
    const { store, a, a1 } = await seeded();
    await loan(store, a1.id, a.id, 1_000_000n);
    await pay(store, a1.id, a.id, [{ category: "Savings", amount: 1_000_000n }]);
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", true]]);
  });

  it("is true for a fully repaid loan plus a newer active one, and only for that member", async () => {
    const { store, admin, a, a1 } = await seeded();
    const old = await loan(store, a1.id, a.id, 500_000n);
    await pay(store, a1.id, a.id, [{ category: "Loan Repaid", amount: 500_000n, loanId: old.id }]);
    await loan(store, a1.id, a.id, 700_000n);
    expect(flags(await listMembers(store, actorOf(admin), {}))).toEqual([
      ["A One", true],
      ["B One", false],
    ]);
  });

  it("counts only the member's own payments against their loan", async () => {
    const { store, admin, a, b, a1, b1 } = await seeded();
    const lb = await loan(store, b1.id, b.id, 400_000n);
    await pay(store, a1.id, a.id, [{ category: "Loan Repaid", amount: 400_000n, loanId: lb.id }]);
    expect(flags(await listMembers(store, actorOf(admin), {}))).toEqual([
      ["A One", false],
      ["B One", true],
    ]);
  });

  it("shows Staff the loan the Super Admin gave to their member, and nothing of other members", async () => {
    const { store, admin, a, b, a1, b1 } = await seeded();
    await loan(store, a1.id, admin.id, 1_000_000n);
    await loan(store, b1.id, b.id, 1_000_000n);
    expect(flags(await listMembers(store, actorOf(a), {}))).toEqual([["A One", true]]);
    expect(flags(await listMembers(store, actorOf(a), { createdById: b.id }))).toEqual([
      ["A One", true],
    ]);
  });

  it("keeps the flag right under the Super Admin's createdById filter", async () => {
    const { store, admin, b, b1 } = await seeded();
    await loan(store, b1.id, b.id, 1_000_000n);
    expect(flags(await listMembers(store, actorOf(admin), { createdById: b.id }))).toEqual([
      ["B One", true],
    ]);
  });

  it("is false for every row when a list has members but no loans, with status=all", async () => {
    const { store, admin } = await seeded();
    expect(flags(await listMembers(store, actorOf(admin), { status: "all" }))).toEqual([
      ["A One", false],
      ["A Two", false],
      ["B One", false],
    ]);
  });

  it("is not added to getMember (D-110)", async () => {
    const { store, a, a1 } = await seeded();
    await loan(store, a1.id, a.id, 1_000_000n);
    expect(must(await getMember(store, actorOf(a), a1.id))).not.toHaveProperty("onLoan");
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
// Reactivation (step 6.6, DR-16, D-71, A-179, A-189).
async function buildReactivation(store: Store = createMemoryStore()) {
  const tag = Math.random().toString(36).slice(2, 10);
  const make = (name: string, role: Role, permissions: string[]) =>
    store.users.create({
      email: `${name}-${tag}@example.test`,
      passwordHash: "not-a-real-hash",
      displayName: name,
      role,
      permissions,
    });
  const admin = await make("admin", "SUPER_ADMIN", []);
  const a = await make("edit-a", "STAFF", ["members.edit"]);
  const b = await make("edit-b", "STAFF", ["members.edit"]);
  const noEdit = await make("no-edit", "STAFF", ["members.create", "members.view"]);
  const inactive = async (createdById: string) => {
    const m = await store.members.create({
      fullName: "Gone Member",
      phone: "08000000009",
      address: "",
      occupation: "",
      createdById,
    });
    await store.members.setStatus(m.id, "INACTIVE");
    return m;
  };
  return { store, admin, a, b, noEdit, inactive };
}

const statusOf = async (store: Store, id: string) => (await store.members.findById(id))?.status;

function failingInside(store: Store, part: "members" | "audit"): Store {
  const down = () => Promise.reject(new Error(`${part} down`));
  return {
    ...store,
    transaction: (fn) =>
      store.transaction((tx) =>
        part === "members"
          ? fn({ ...tx, members: { ...tx.members, setStatus: down } })
          : fn({ ...tx, audit: { ...tx.audit, append: down } }),
      ),
  };
}

describe("reactivateMember", () => {
  it("makes Staff's own Inactive member Active, in the answer and in the store", async () => {
    const { store, a, inactive } = await buildReactivation();
    const m = await inactive(a.id);
    const r = must(await reactivateMember(store, actorOf(a), m.id));
    expect(r).toMatchObject({ id: m.id, membershipId: m.membershipId, status: "ACTIVE", createdById: a.id });
    expect(await statusOf(store, m.id)).toBe("ACTIVE");
  });

  it("lets the Super Admin reactivate a member recorded by Staff", async () => {
    const { store, admin, b, inactive } = await buildReactivation();
    const m = await inactive(b.id);
    expect(must(await reactivateMember(store, actorOf(admin), m.id)).status).toBe("ACTIVE");
    expect(await statusOf(store, m.id)).toBe("ACTIVE");
  });

  it("writes one member.reactivated entry with the actor, the Membership ID and the new status only", async () => {
    const { store, a, inactive } = await buildReactivation();
    const m = await inactive(a.id);
    await reactivateMember(store, actorOf(a), m.id);
    const entries = await store.audit.listByActor(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: a.id,
      action: "member.reactivated",
      entityType: "Member",
      entityId: m.id,
      detail: `membership_id=${m.membershipId} member_status=ACTIVE`,
    });
    const text = JSON.stringify(entries);
    expect(text).not.toContain("Gone Member");
    expect(text).not.toContain("08000000009");
  });

  it("names the Super Admin, not the Staff recorder, as the actor when the Super Admin reactivates (DR-15, A-190)", async () => {
    const { store, admin, b, inactive } = await buildReactivation();
    const m = await inactive(b.id);
    must(await reactivateMember(store, actorOf(admin), m.id));
    const entries = await store.audit.listByActor(admin.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId: admin.id, action: "member.reactivated", entityId: m.id });
    expect(await store.audit.listByActor(b.id)).toEqual([]);
  });

  it("refuses Staff without members.edit, even for their own member, and saves nothing", async () => {
    const { store, noEdit, inactive } = await buildReactivation();
    const m = await inactive(noEdit.id);
    expect(await reactivateMember(store, actorOf(noEdit), m.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await statusOf(store, m.id)).toBe("INACTIVE");
    expect(await store.audit.listByActor(noEdit.id)).toEqual([]);
  });

  it("answers not_found to Staff with members.edit for another user's member, and saves nothing", async () => {
    const { store, a, b, inactive } = await buildReactivation();
    const m = await inactive(b.id);
    expect(await reactivateMember(store, actorOf(a), m.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await statusOf(store, m.id)).toBe("INACTIVE");
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it.each([
    { label: "unknown", value: "no-such-id" },
    { label: "missing", value: undefined },
    { label: "empty", value: "" },
    { label: "a number", value: 5 },
  ])("answers not_found for an id that is $label", async ({ value }) => {
    const { store, admin } = await buildReactivation();
    expect(await reactivateMember(store, actorOf(admin), value)).toEqual({ ok: false, reason: "not_found" });
    expect(await store.audit.listByActor(admin.id)).toEqual([]);
  });

  it("answers already_active for an Active member and writes no audit entry", async () => {
    const { store, a } = await buildReactivation();
    const m = await store.members.create({
      fullName: "Still Here",
      phone: "",
      address: "",
      occupation: "",
      createdById: a.id,
    });
    expect(await reactivateMember(store, actorOf(a), m.id)).toEqual({ ok: false, reason: "already_active" });
    expect(await statusOf(store, m.id)).toBe("ACTIVE");
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("answers already_active to a second reactivation and writes one audit entry in all", async () => {
    const { store, a, inactive } = await buildReactivation();
    const m = await inactive(a.id);
    must(await reactivateMember(store, actorOf(a), m.id));
    expect(await reactivateMember(store, actorOf(a), m.id)).toEqual({ ok: false, reason: "already_active" });
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });

  for (const part of ["members", "audit"] as const) {
    it(`leaves the member Inactive with no audit entry when the ${part} write fails (one transaction)`, async () => {
      const { store, a, inactive } = await buildReactivation();
      const m = await inactive(a.id);
      await expect(reactivateMember(failingInside(store, part), actorOf(a), m.id)).rejects.toThrow(`${part} down`);
      expect(await statusOf(store, m.id)).toBe("INACTIVE");
      expect(await store.audit.listByActor(a.id)).toEqual([]);
    });
  }

  it("throws, and writes no audit entry, when the store cannot find the member to update", async () => {
    const { store, a, inactive } = await buildReactivation();
    const m = await inactive(a.id);
    const lost: Store = {
      ...store,
      transaction: (fn) =>
        store.transaction((tx) => fn({ ...tx, members: { ...tx.members, setStatus: async () => false } })),
    };
    await expect(reactivateMember(lost, actorOf(a), m.id)).rejects.toThrow("member to reactivate is missing");
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });
});

describe("reactivateMember on the Prisma store (real PostgreSQL)", () => {
  let tmp: TempDb;
  let store: Store;
  beforeAll(() => {
    tmp = createTempDb();
    store = createPrismaStore(tmp.prisma);
  }, 120_000);
  afterAll(async () => {
    await tmp.cleanup();
  });

  it("saves the Active status and the audit entry", async () => {
    const { a, inactive } = await buildReactivation(store);
    const m = await inactive(a.id);
    must(await reactivateMember(store, actorOf(a), m.id));
    expect(await statusOf(store, m.id)).toBe("ACTIVE");
    expect((await store.audit.listByActor(a.id)).map((e) => e.action)).toEqual(["member.reactivated"]);
  });

  it("leaves the member Inactive when the audit write fails", async () => {
    const { a, inactive } = await buildReactivation(store);
    const m = await inactive(a.id);
    await expect(reactivateMember(failingInside(store, "audit"), actorOf(a), m.id)).rejects.toThrow("audit down");
    expect(await statusOf(store, m.id)).toBe("INACTIVE");
    expect(await store.audit.listByActor(a.id)).toEqual([]);
  });

  it("reactivates once when five requests run at once", async () => {
    const { a, inactive } = await buildReactivation(store);
    const m = await inactive(a.id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reactivateMember(store, actorOf(a), m.id)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.reason))).toEqual(
      Array(4).fill("already_active"),
    );
    expect(await store.audit.listByActor(a.id)).toHaveLength(1);
  });
});
