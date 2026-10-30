import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, PAGE_HEADERS, SECURITY_HEADERS } from "../src/app.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createAccessToken } from "../src/tokens.js";

// The server serves the built web pages on the same address (step E.4, D-116).
// A folder of fake page files stands in for web/dist, so the test needs no web build.
// Fake values for tests only. Fictional data only (D-08).
const SECRET = "test-only-secret-for-web-pages-test-0123";
const T0 = new Date("2026-10-30T10:00:00.000Z");
const INDEX = "<!doctype html><title>test page</title>";
const SCRIPT = "console.log('test');";

const PAGE = {
  "cache-control": "no-cache",
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};
const API = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};

let webDir: string;

beforeAll(() => {
  webDir = mkdtempSync(join(tmpdir(), "iyanu-web-pages-"));
  mkdirSync(join(webDir, "assets"));
  writeFileSync(join(webDir, "index.html"), INDEX);
  writeFileSync(join(webDir, "assets", "app.js"), SCRIPT);
  writeFileSync(join(webDir, ".hidden"), "not to be served");
});

afterAll(() => {
  rmSync(webDir, { recursive: true, force: true });
});

async function build(withPages = true) {
  const store = createMemoryStore();
  const admin = await store.users.create({
    email: "admin@example.test",
    passwordHash: "not-a-real-hash",
    displayName: "Test Admin",
    role: "SUPER_ADMIN",
  });
  const app = createApp({
    store,
    tokenSecret: SECRET,
    now: () => T0,
    ...(withPages ? { webDir } : {}),
  });
  const bearer = `Bearer ${createAccessToken(SECRET, admin.id, T0)}`;
  return { app, bearer };
}

function expectHeaders(headers: Record<string, string>, expected: Record<string, string>) {
  for (const [name, value] of Object.entries(expected)) {
    expect(headers[name], name).toBe(value);
  }
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["strict-transport-security"]).toBeUndefined();
}

function expectNotFound(res: request.Response) {
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: "not_found" });
  expectHeaders(res.headers, API);
}

describe("web pages (E.4)", () => {
  it("exports the page header values the tests expect, over the API set", () => {
    const merged = { ...SECURITY_HEADERS, ...PAGE_HEADERS };
    const lower = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k.toLowerCase(), v]));
    expect(lower).toEqual(PAGE);
  });

  it("serves index.html at / with the page headers", async () => {
    const { app } = await build();
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/html/);
    expect(res.text).toBe(INDEX);
    expectHeaders(res.headers, PAGE);
  });

  it("serves a script file with its own type and the page headers", async () => {
    const { app } = await build();
    const res = await request(app).get("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/javascript/);
    expect(res.text).toBe(SCRIPT);
    expectHeaders(res.headers, PAGE);
  });

  it("answers HEAD for a page file", async () => {
    const { app } = await build();
    const res = await request(app).head("/");
    expect(res.status).toBe(200);
    expectHeaders(res.headers, PAGE);
  });

  it("answers 404 JSON for a missing page file", async () => {
    const { app } = await build();
    expectNotFound(await request(app).get("/assets/missing.js"));
  });

  it("does not serve a dotfile", async () => {
    const { app } = await build();
    expectNotFound(await request(app).get("/.hidden"));
  });

  it("answers 404 JSON for a POST to /", async () => {
    const { app } = await build();
    expectNotFound(await request(app).post("/"));
  });

  it("serves no page without webDir", async () => {
    const { app } = await build(false);
    expectNotFound(await request(app).get("/"));
  });
});

describe("API under /api (E.4)", () => {
  it("answers /api/health with the API headers", async () => {
    const { app } = await build();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expectHeaders(res.headers, API);
  });

  it("answers /api/health without deps", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("answers a signed-in route under /api and without the prefix", async () => {
    const { app, bearer } = await build();
    const withPrefix = await request(app).get("/api/auth/me").set("Authorization", bearer);
    expect(withPrefix.status).toBe(200);
    expect(withPrefix.body.user.email).toBe("admin@example.test");
    expectHeaders(withPrefix.headers, API);
    const without = await request(app).get("/auth/me").set("Authorization", bearer);
    expect(without.status).toBe(200);
    expect(without.body).toEqual(withPrefix.body);
  });

  it("keeps the guards under /api", async () => {
    const { app } = await build();
    const res = await request(app).get("/api/members");
    expect(res.status).toBe(401);
    expectHeaders(res.headers, API);
  });

  it("parses JSON bodies under /api (bad JSON is 400)", async () => {
    const { app } = await build();
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
  });

  it("answers 404 JSON for an unknown API route, with or without /api", async () => {
    const { app } = await build();
    expectNotFound(await request(app).get("/api/nope"));
    expectNotFound(await request(app).get("/nope"));
    expectNotFound(await request(app).get("/api"));
  });

  it("never serves a page file under /api", async () => {
    const { app } = await build();
    expectNotFound(await request(app).get("/api/index.html"));
    expectNotFound(await request(app).get("/api/assets/app.js"));
  });
});
