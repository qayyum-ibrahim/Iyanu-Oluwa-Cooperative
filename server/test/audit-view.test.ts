import { describe, expect, it } from "vitest";
import {
  AUDIT_DEFAULT_LIMIT,
  listAuditEntries,
  type AuditPage,
  type AuditViewQuery,
  type AuditViewResult,
} from "../src/audit-view.js";
import { createMemoryStore } from "../src/memory-store.js";
import { ALL_PERMISSIONS, type PermissionSubject } from "../src/permissions.js";
import type { AuditListQuery, Store } from "../src/store.js";

const ADMIN: PermissionSubject = { role: "SUPER_ADMIN", isActive: true, permissions: [] };
// Staff holding every permission name, even users.manage put there by hand (A-27).
const STAFF_ALL: PermissionSubject = { role: "STAFF", isActive: true, permissions: ALL_PERMISSIONS };
const INACTIVE_ADMIN: PermissionSubject = { role: "SUPER_ADMIN", isActive: false, permissions: [] };

/** The same store, but every call to audit.list is recorded. */
function spyStore(store: Store) {
  const calls: AuditListQuery[] = [];
  const spied: Store = {
    ...store,
    audit: {
      ...store.audit,
      list: async (q) => {
        calls.push(q);
        return store.audit.list(q);
      },
    },
  };
  return { store: spied, calls };
}

async function seed(store: Store, count: number): Promise<void> {
  for (let i = 1; i <= count; i += 1) {
    await store.audit.append({ action: `test.${i}`, entityType: "Test" });
  }
}

function page(result: AuditViewResult): AuditPage {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.value;
}

describe("listAuditEntries: access", () => {
  it("lets the Super Admin read", async () => {
    const store = createMemoryStore();
    await seed(store, 1);
    const result = await listAuditEntries(store, { subject: ADMIN }, {});
    expect(page(result).entries).toHaveLength(1);
  });

  it("refuses Staff, even with every permission name stored", async () => {
    const store = createMemoryStore();
    const result = await listAuditEntries(store, { subject: STAFF_ALL }, {});
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("refuses an inactive Super Admin", async () => {
    const store = createMemoryStore();
    const result = await listAuditEntries(store, { subject: INACTIVE_ADMIN }, {});
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("does not touch the store when refused, and forbidden wins over bad input", async () => {
    const { store, calls } = spyStore(createMemoryStore());
    for (const subject of [STAFF_ALL, INACTIVE_ADMIN]) {
      const result = await listAuditEntries(store, { subject }, { limit: 0 });
      expect(result).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("listAuditEntries: paging", () => {
  it("returns 50 entries by default and says there are more", async () => {
    const store = createMemoryStore();
    await seed(store, 60);
    const p = page(await listAuditEntries(store, { subject: ADMIN }, {}));
    expect(AUDIT_DEFAULT_LIMIT).toBe(50);
    expect(p.entries).toHaveLength(50);
    expect(p).toMatchObject({ limit: 50, offset: 0, hasMore: true });
  });

  it("accepts a limit given as text", async () => {
    const { store, calls } = spyStore(createMemoryStore());
    await seed(store, 20);
    const p = page(await listAuditEntries(store, { subject: ADMIN }, { limit: "10" }));
    expect(p.limit).toBe(10);
    expect(p.entries).toHaveLength(10);
    expect(calls[0]?.limit).toBe(11);
  });

  it("accepts the largest limit, 200, and asks the store for one extra row", async () => {
    const { store, calls } = spyStore(createMemoryStore());
    const p = page(await listAuditEntries(store, { subject: ADMIN }, { limit: 200 }));
    expect(p.limit).toBe(200);
    expect(calls[0]?.limit).toBe(201);
  });

  it("accepts the smallest limit, 1", async () => {
    const store = createMemoryStore();
    await seed(store, 3);
    const p = page(await listAuditEntries(store, { subject: ADMIN }, { limit: 1 }));
    expect(p.entries).toHaveLength(1);
    expect(p.hasMore).toBe(true);
  });

  it("accepts an offset given as text", async () => {
    const { store, calls } = spyStore(createMemoryStore());
    await seed(store, 5);
    const p = page(await listAuditEntries(store, { subject: ADMIN }, { offset: "2", limit: 10 }));
    expect(p.offset).toBe(2);
    expect(p.entries).toHaveLength(3);
    expect(calls[0]?.offset).toBe(2);
  });

  it("sets hasMore only when more entries exist", async () => {
    const store = createMemoryStore();
    await seed(store, 3);
    const exact = page(await listAuditEntries(store, { subject: ADMIN }, { limit: 3 }));
    expect(exact.entries).toHaveLength(3);
    expect(exact.hasMore).toBe(false);
    const less = page(await listAuditEntries(store, { subject: ADMIN }, { limit: 2 }));
    expect(less.entries).toHaveLength(2);
    expect(less.hasMore).toBe(true);
  });
});

describe("listAuditEntries: bad input", () => {
  const BAD: [string, AuditViewQuery][] = [
    ["limit 0", { limit: 0 }],
    ["limit 201", { limit: 201 }],
    ["limit -1", { limit: -1 }],
    ["limit abc", { limit: "abc" }],
    ["limit 1.5 as text", { limit: "1.5" }],
    ["limit empty text", { limit: "" }],
    ["limit 1.5", { limit: 1.5 }],
    ["limit as a list", { limit: ["5"] }],
    ["limit null", { limit: null }],
    ["offset -1", { offset: -1 }],
    ["offset x", { offset: "x" }],
    ["offset 1000001", { offset: 1_000_001 }],
    ["offset 1.5", { offset: 1.5 }],
    ["actorId empty", { actorId: "" }],
    ["actorId a number", { actorId: 123 }],
    ["actorId a list", { actorId: ["a"] }],
    ["actorId 101 characters", { actorId: "x".repeat(101) }],
    ["action empty", { action: "" }],
    ["action a number", { action: 5 }],
    ["action 101 characters", { action: "y".repeat(101) }],
  ];

  it.each(BAD)("refuses %s without touching the store", async (_label, query) => {
    const { store, calls } = spyStore(createMemoryStore());
    const result = await listAuditEntries(store, { subject: ADMIN }, query);
    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(calls).toHaveLength(0);
  });
});

describe("listAuditEntries: content", () => {
  it("includes entries with no actor", async () => {
    const store = createMemoryStore();
    await store.audit.append({ action: "login.failure", entityType: "Auth", detail: "unknown_email" });
    const p = page(await listAuditEntries(store, { subject: ADMIN }, {}));
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]?.actorId).toBeNull();
  });

  it("passes the filters to the store", async () => {
    const { store, calls } = spyStore(createMemoryStore());
    await listAuditEntries(store, { subject: ADMIN }, { actorId: "u1", action: "x.y" });
    expect(calls).toEqual([{ actorId: "u1", action: "x.y", limit: 51, offset: 0 }]);
  });

  it("returns plain entries with the time as an ISO text", async () => {
    const store = createMemoryStore();
    const u = await store.users.create({ email: "a@example.test", passwordHash: "x", displayName: "A" });
    const entry = await store.audit.append({
      actorId: u.id,
      action: "test.shape",
      entityType: "Test",
      entityId: "e1",
      detail: "d",
    });
    const p = page(await listAuditEntries(store, { subject: ADMIN }, {}));
    const view = p.entries[0];
    expect(Object.keys(view ?? {}).sort()).toEqual([
      "action",
      "actorId",
      "createdAt",
      "detail",
      "entityId",
      "entityType",
      "id",
    ]);
    expect(view).toEqual({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      actorId: u.id,
      action: "test.shape",
      entityType: "Test",
      entityId: "e1",
      detail: "d",
    });
  });

  it("lists the newest entry first", async () => {
    const store = createMemoryStore();
    await seed(store, 3);
    const p = page(await listAuditEntries(store, { subject: ADMIN }, {}));
    expect(p.entries.map((e) => e.action)).toEqual(["test.3", "test.2", "test.1"]);
  });
});