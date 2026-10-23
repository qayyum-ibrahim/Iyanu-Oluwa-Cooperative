import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import type { Role } from "../src/store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-members-routes-0123456789";
const T0 = new Date("2026-10-18T10:00:00.000Z");

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
  const editA = await make("edit-a", "STAFF", ["members.edit"]);
  const editB = await make("edit-b", "STAFF", ["members.edit"]);
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = (u: { id: string }) => `Bearer ${createAccessToken(SECRET, u.id, T0)}`;
  const addMember = (createdById: string, fullName: string) =>
    store.members.create({ fullName, phone: "", address: "", occupation: "", createdById });
  const addInactive = async (createdById: string, fullName: string) => {
    const m = await addMember(createdById, fullName);
    await store.members.setStatus(m.id, "INACTIVE");
    return m;
  };
  return { store, app, admin, a, b, viewOnly, createOnly, editA, editB, bearer, addMember, addInactive };
}

const memberBody = (over: Record<string, unknown> = {}) => ({
  fullName: "  Test Member  ",
  phone: "08000000001",
  address: "1 Test Street",
  occupation: "Trader",
  ...over,
});

describe("POST /members", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    const res = await request(app).post("/members").send(memberBody());
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("answers 403 to Staff without members.create", async () => {
    const { app, viewOnly, bearer, store } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(viewOnly))
      .send(memberBody());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.members.list({})).toEqual([]);
  });

  it("answers 403, not 400, to a caller without members.create who sends malformed JSON (guard runs before the body is read)", async () => {
    const { app, viewOnly, bearer, store } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(viewOnly))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(await store.members.list({})).toEqual([]);
  });

  it("answers 201 for Staff with the permission: trimmed, Active, no-store, exact fields", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(a))
      .send(memberBody());
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body.member as object).sort()).toEqual([
      "address",
      "createdAt",
      "createdById",
      "fullName",
      "id",
      "membershipId",
      "occupation",
      "phone",
      "status",
    ]);
    expect(res.body.member).toMatchObject({
      membershipId: "IO-001",
      fullName: "Test Member",
      status: "ACTIVE",
      createdById: a.id,
    });
  });

  it("returns phone, address and occupation trimmed, each in its own field", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(a))
      .send({
        fullName: "Field Check",
        phone: "  08011112222 ",
        address: " 7 Alpha Road ",
        occupation: " Tailor ",
      });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      phone: "08011112222",
      address: "7 Alpha Road",
      occupation: "Tailor",
    });
  });

  it("writes a member.created audit entry for the caller", async () => {
    const { app, a, bearer, store } = await build();
    await request(app).post("/members").set("Authorization", bearer(a)).send(memberBody());
    const actions = (await store.audit.listByActor(a.id)).map((e) => e.action);
    expect(actions).toEqual(["member.created"]);
  });

  it("answers 201 for the Super Admin", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(admin))
      .send(memberBody());
    expect(res.status).toBe(201);
    expect(res.body.member.createdById).toBe(admin.id);
  });

  it("answers 400 invalid_input when the full name is missing", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(a))
      .send(memberBody({ fullName: undefined }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 invalid_input when the body is not an object", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(a))
      .send([1, 2, 3]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });

  it("answers 400 bad_request for malformed JSON from a permitted user", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(a))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 401, not 400, for malformed JSON without a token (guards run first)", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/members")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(401);
  });

  it("answers 413 too_large for a body over 10 kb", async () => {
    const { app, a, bearer } = await build();
    const res = await request(app)
      .post("/members")
      .set("Authorization", bearer(a))
      .send(memberBody({ address: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
  });
});

describe("GET /members", () => {
  it("answers 401 without a token", async () => {
    const { app } = await build();
    expect((await request(app).get("/members")).status).toBe(401);
  });

  it("answers 403 to Staff without members.view", async () => {
    const { app, createOnly, bearer } = await build();
    const res = await request(app).get("/members").set("Authorization", bearer(createOnly));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("shows Staff only the members they recorded", async () => {
    const { app, a, b, bearer, addMember } = await build();
    await addMember(a.id, "A One");
    await addMember(b.id, "B One");
    const res = await request(app).get("/members").set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((res.body.members as { fullName: string }[]).map((m) => m.fullName)).toEqual(["A One"]);
  });

  it("shows the Super Admin every Active member", async () => {
    const { app, admin, a, b, bearer, addMember } = await build();
    await addMember(a.id, "A One");
    await addMember(b.id, "B One");
    const res = await request(app).get("/members").set("Authorization", bearer(admin));
    expect((res.body.members as { fullName: string }[]).map((m) => m.fullName)).toEqual([
      "A One",
      "B One",
    ]);
  });

  it("lets the Super Admin filter by user with ?createdById=", async () => {
    const { app, admin, a, b, bearer, addMember } = await build();
    await addMember(a.id, "A One");
    await addMember(b.id, "B One");
    const res = await request(app)
      .get(`/members?createdById=${b.id}`)
      .set("Authorization", bearer(admin));
    expect((res.body.members as { fullName: string }[]).map((m) => m.fullName)).toEqual(["B One"]);
  });

  it("hides Inactive members by default and shows them with ?status=all", async () => {
    const { app, admin, a, store, bearer, addMember } = await build();
    await addMember(a.id, "Active One");
    const gone = await addMember(a.id, "Inactive One");
    await store.members.setStatus(gone.id, "INACTIVE");
    const byDefault = await request(app).get("/members").set("Authorization", bearer(admin));
    expect(byDefault.body.members).toHaveLength(1);
    const all = await request(app).get("/members?status=all").set("Authorization", bearer(admin));
    expect(all.body.members).toHaveLength(2);
  });

  it("answers 400 invalid_input for a bad status", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app)
      .get("/members?status=everyone")
      .set("Authorization", bearer(admin));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_input" });
  });
});

describe("GET /members/:id", () => {
  it("answers 401 without a token", async () => {
    const { app, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect((await request(app).get(`/members/${m.id}`)).status).toBe(401);
  });

  it("answers 403 to Staff without members.view", async () => {
    const { app, a, createOnly, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).get(`/members/${m.id}`).set("Authorization", bearer(createOnly));
    expect(res.status).toBe(403);
  });

  it("shows Staff a member they recorded", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).get(`/members/${m.id}`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({ id: m.id, fullName: "A One", membershipId: "IO-001" });
  });

  it("answers 404 when Staff ask for another user's member", async () => {
    const { app, a, b, bearer, addMember } = await build();
    const m = await addMember(b.id, "B One");
    const res = await request(app).get(`/members/${m.id}`).set("Authorization", bearer(a));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("shows the Super Admin any member", async () => {
    const { app, admin, b, bearer, addMember } = await build();
    const m = await addMember(b.id, "B One");
    const res = await request(app).get(`/members/${m.id}`).set("Authorization", bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.member.fullName).toBe("B One");
  });

  it("answers 404 for an unknown id", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app).get("/members/no-such-id").set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});

describe("GET /members/:id/balances", () => {
  const ORDER = [
    "Shares",
    "Savings",
    "Special Savings",
    "Development Levy",
    "Loan Repaid",
    "Loan Interest",
    "Entrance Fee",
    "Stationeries",
    "Empowerment Repaid",
    "Committee Gift",
    "Special Deposit",
    "Investment Repaid",
    "Investment Income",
    "Building Funds",
  ];
  const REFUNDABLE = ["Shares", "Savings", "Special Savings", "Special Deposit", "Building Funds"];

  // The DR-05 worked example: payout ₦25,000; Development Levy ₦1,000 and Entrance Fee ₦2,000 kept.
  const payExample = (store: Awaited<ReturnType<typeof build>>["store"], memberId: string, by: string) =>
    store.payments.create({
      memberId,
      method: "CASH",
      paidOn: "2026-10-20",
      total: 2_800_000n,
      lines: [
        { category: "Shares", amount: 1_200_000n },
        { category: "Savings", amount: 800_000n },
        { category: "Special Savings", amount: 500_005n },
        { category: "Development Levy", amount: 100_000n },
        { category: "Entrance Fee", amount: 199_995n },
      ],
      createdById: by,
    });

  const balanceOf = (body: { balances: { categories: { category: string; balance: string }[] } }, name: string) =>
    body.balances.categories.find((c) => c.category === name)?.balance;

  it("answers 401 without a token", async () => {
    const { app, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    expect((await request(app).get(`/members/${m.id}/balances`)).status).toBe(401);
  });

  it("answers 403 to Staff without members.view", async () => {
    const { app, a, createOnly, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(createOnly));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("answers 200 to Staff with members.view but not members.create (A-198 G2, R2)", async () => {
    const { app, store, viewOnly, bearer, addMember } = await build();
    const m = await addMember(viewOnly.id, "V One");
    await payExample(store, m.id, viewOnly.id);
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(viewOnly));
    expect(res.status).toBe(200);
    expect(res.body.balances.refundableTotal).toBe("25000.05");
  });

  it("reads the member, payments and pay-offs in one store transaction (A-197 item 4, A-198 G12)", async () => {
    const { store, a, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(store, m.id, a.id);
    // Reads outside a transaction throw; the transaction gets the real store.
    const outside = () => Promise.reject(new Error("read outside a transaction"));
    let transactions = 0;
    const counted = {
      ...store,
      members: { ...store.members, findById: outside },
      payments: { ...store.payments, listByMember: outside },
      payOffs: { ...store.payOffs, listByMember: outside },
      transaction: <T>(fn: (tx: typeof store) => Promise<T>): Promise<T> => {
        transactions++;
        return store.transaction(fn);
      },
    };
    const app = createApp({ store: counted, tokenSecret: SECRET, now: () => T0 });
    const res = await request(app)
      .get(`/members/${m.id}/balances`)
      .set("Authorization", `Bearer ${createAccessToken(SECRET, a.id, T0)}`);
    expect(res.status).toBe(200);
    expect(res.body.balances.refundableTotal).toBe("25000.05");
    expect(transactions).toBe(1);
  });

  it("answers 200 to Staff for a member they recorded: no-store, exact fields, amounts as strings", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(store, m.id, a.id);
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object)).toEqual(["balances"]);
    expect(Object.keys(res.body.balances as object).sort()).toEqual([
      "categories",
      "memberId",
      "nonRefundableTotal",
      "refundableTotal",
    ]);
    expect(res.body.balances.memberId).toBe(m.id);
    expect(res.body.balances.refundableTotal).toBe("25000.05");
    expect(res.body.balances.nonRefundableTotal).toBe("2999.95");
    expect(res.body.balances.categories[0]).toEqual({ category: "Shares", balance: "12000.00", refundable: true });
    expect(balanceOf(res.body, "Savings")).toBe("8000.00");
    expect(balanceOf(res.body, "Special Savings")).toBe("5000.05");
    expect(balanceOf(res.body, "Development Levy")).toBe("1000.00");
    expect(balanceOf(res.body, "Entrance Fee")).toBe("1999.95");
    expect(balanceOf(res.body, "Loan Interest")).toBe("0.00");
  });

  it("lists every payment category in DR-04 order, each marked refundable as DR-03", async () => {
    const { app, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    const cats = res.body.balances.categories as { category: string; balance: string; refundable: boolean }[];
    expect(cats.map((c) => c.category)).toEqual(ORDER);
    for (const c of cats) {
      expect(Object.keys(c).sort(), c.category).toEqual(["balance", "category", "refundable"]);
      expect(c.balance, c.category).toBe("0.00");
      expect(c.refundable, c.category).toBe(REFUNDABLE.includes(c.category));
    }
    expect(res.body.balances.refundableTotal).toBe("0.00");
    expect(res.body.balances.nonRefundableTotal).toBe("0.00");
  });

  it("takes pay-offs off: refundable balances ₦0, the rest kept (DR-05)", async () => {
    const { app, store, admin, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await payExample(store, m.id, a.id);
    await store.payOffs.create({
      memberId: m.id,
      method: "CASH",
      total: 2_500_005n,
      lines: [
        { category: "Shares", amount: 1_200_000n },
        { category: "Savings", amount: 800_000n },
        { category: "Special Savings", amount: 500_005n },
      ],
      createdById: admin.id,
    });
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(res.body.balances.refundableTotal).toBe("0.00");
    expect(res.body.balances.nonRefundableTotal).toBe("2999.95");
    expect(balanceOf(res.body, "Shares")).toBe("0.00");
    expect(balanceOf(res.body, "Development Levy")).toBe("1000.00");
  });

  it("counts only this member's payments", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const other = await addMember(a.id, "A Two");
    await payExample(store, other.id, a.id);
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(a));
    expect(res.body.balances.refundableTotal).toBe("0.00");
    expect(res.body.balances.nonRefundableTotal).toBe("0.00");
  });

  it("answers 404 when Staff ask for another user's member", async () => {
    const { app, store, a, b, bearer, addMember } = await build();
    const m = await addMember(b.id, "B One");
    await payExample(store, m.id, b.id);
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(a));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 200 to the Super Admin for a member recorded by Staff, Inactive too", async () => {
    const { app, store, admin, b, bearer, addInactive } = await build();
    const m = await addInactive(b.id, "B One");
    await payExample(store, m.id, b.id);
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.balances.refundableTotal).toBe("25000.05");
  });

  it("answers 404 for an unknown id", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app).get("/members/no-such-id/balances").set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 500 server_error, with no amounts, when a pay-off took more than the balance (broken data)", async () => {
    const { app, store, admin, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    await store.payOffs.create({
      memberId: m.id,
      method: "CASH",
      total: 100n,
      lines: [{ category: "Savings", amount: 100n }],
      createdById: admin.id,
    });
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(admin));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "server_error" });
  });

  it("writes no audit entry", async () => {
    const { app, store, a, bearer, addMember } = await build();
    const m = await addMember(a.id, "A One");
    const res = await request(app).get(`/members/${m.id}/balances`).set("Authorization", bearer(a));
    expect(res.status).toBe(200);
    expect(await store.audit.list({ limit: 100, offset: 0 })).toEqual([]);
  });
});

describe("POST /members/:id/reactivate", () => {
  it("answers 401 without a token, and the member stays Inactive", async () => {
    const { app, store, editA, addInactive } = await build();
    const m = await addInactive(editA.id, "Gone One");
    const res = await request(app).post(`/members/${m.id}/reactivate`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
  });

  it("answers 403 to Staff without members.edit, even for their own member", async () => {
    const { app, store, a, bearer, addInactive } = await build();
    const m = await addInactive(a.id, "Gone One");
    const res = await request(app).post(`/members/${m.id}/reactivate`).set("Authorization", bearer(a));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
  });

  it("answers 200 with the Active member to the Staff member who recorded them, and audits it", async () => {
    const { app, store, editA, bearer, addInactive } = await build();
    const m = await addInactive(editA.id, "Gone One");
    const res = await request(app).post(`/members/${m.id}/reactivate`).set("Authorization", bearer(editA));
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body as object)).toEqual(["member"]);
    expect(res.body.member).toMatchObject({ id: m.id, membershipId: "IO-001", status: "ACTIVE" });
    expect((await store.members.findById(m.id))?.status).toBe("ACTIVE");
    expect((await store.audit.listByActor(editA.id)).map((e) => e.action)).toEqual(["member.reactivated"]);
  });

  it("answers 200 to the Super Admin for a member recorded by Staff", async () => {
    const { app, admin, editB, bearer, addInactive } = await build();
    const m = await addInactive(editB.id, "Gone Two");
    const res = await request(app).post(`/members/${m.id}/reactivate`).set("Authorization", bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.member.status).toBe("ACTIVE");
  });

  it("answers 404 to Staff with members.edit for another user's member", async () => {
    const { app, store, editA, editB, bearer, addInactive } = await build();
    const m = await addInactive(editB.id, "Gone Two");
    const res = await request(app).post(`/members/${m.id}/reactivate`).set("Authorization", bearer(editA));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
    expect((await store.members.findById(m.id))?.status).toBe("INACTIVE");
  });

  it("answers 404 for an unknown id", async () => {
    const { app, admin, bearer } = await build();
    const res = await request(app).post("/members/no-such-id/reactivate").set("Authorization", bearer(admin));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("answers 409 already_active for an Active member", async () => {
    const { app, store, editA, bearer, addMember } = await build();
    const m = await addMember(editA.id, "Still Here");
    const res = await request(app).post(`/members/${m.id}/reactivate`).set("Authorization", bearer(editA));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "already_active" });
    expect(await store.audit.listByActor(editA.id)).toEqual([]);
  });

  it("ignores a body, even malformed JSON", async () => {
    const { app, editA, bearer, addInactive } = await build();
    const m = await addInactive(editA.id, "Gone One");
    const res = await request(app)
      .post(`/members/${m.id}/reactivate`)
      .set("Authorization", bearer(editA))
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(200);
    expect(res.body.member.status).toBe("ACTIVE");
  });
});

describe("routes that do not exist", () => {
  it.each([{ method: "put" as const }, { method: "delete" as const }])(
    "answers 404 to $method /members/:id: members cannot be changed or deleted here",
    async ({ method }) => {
      const { app, admin, a, bearer, addMember } = await build();
      const m = await addMember(a.id, "A One");
      const res = await request(app)
        [method](`/members/${m.id}`)
        .set("Authorization", bearer(admin))
        .send({ fullName: "Changed" });
      expect(res.status).toBe(404);
    },
  );
});