import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp, SECURITY_HEADERS } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createAccessToken } from "../src/tokens.js";

// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-headers-test-01234";
const T0 = new Date("2026-10-28T10:00:00.000Z");
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Values from the OWASP REST Security and HTTP Headers cheat sheets (9.2).
const EXPECTED = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

async function build() {
  const store = createMemoryStore();
  const admin = await store.users.create({
    email: "admin@example.test",
    passwordHash: "not-a-real-hash",
    displayName: "Test Admin",
    role: "SUPER_ADMIN",
  });
  const app = createApp({ store, tokenSecret: SECRET, now: () => T0 });
  const bearer = `Bearer ${createAccessToken(SECRET, admin.id, T0)}`;
  return { app, bearer };
}

function expectSecurityHeaders(headers: Record<string, string>) {
  for (const [name, value] of Object.entries(EXPECTED)) {
    expect(headers[name], name).toBe(value);
  }
  expect(headers["x-xss-protection"]).toBeUndefined();
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["server"]).toBeUndefined();
  expect(headers["strict-transport-security"]).toBeUndefined();
}

describe("security headers (9.2)", () => {
  it("exports the same names and values the tests expect", () => {
    const lower = Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([k, v]) => [k.toLowerCase(), v]));
    expect(lower).toEqual(EXPECTED);
  });

  it("are on /health without deps", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expectSecurityHeaders(res.headers);
  });

  it("are on a 404 for an unknown route", async () => {
    const { app } = await build();
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
    expectSecurityHeaders(res.headers);
  });

  it("are on a 200 JSON reply", async () => {
    const { app, bearer } = await build();
    const res = await request(app).get("/auth/me").set("Authorization", bearer);
    expect(res.status).toBe(200);
    expectSecurityHeaders(res.headers);
  });

  it("are on a 401", async () => {
    const { app } = await build();
    const res = await request(app).get("/members");
    expect(res.status).toBe(401);
    expectSecurityHeaders(res.headers);
  });

  it("are on a 400 from the error handler (bad JSON)", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
    expectSecurityHeaders(res.headers);
  });

  it("are on a 413 from the error handler", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "x".repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "too_large" });
    expectSecurityHeaders(res.headers);
  });

  it("are on a file download, which keeps its own type and attachment", async () => {
    const { app, bearer } = await build();
    const res = await request(app).get("/exports?kinds=members").set("Authorization", bearer);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(XLSX_TYPE);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="export-2026-10-28\.xlsx"$/);
    expectSecurityHeaders(res.headers);
  });
});
