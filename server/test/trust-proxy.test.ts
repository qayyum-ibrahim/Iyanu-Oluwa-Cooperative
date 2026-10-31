import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TRUST_PROXY_HOPS,
  TrustProxyConfigError,
  createApp,
  readTrustProxyHops,
} from "../src/app.js";
import { forwardedForCount } from "../src/auth-routes.js";
import { createMemoryStore } from "../src/memory-store.js";
import { LOGIN_LIMIT_MAX } from "../src/rate-limit.js";

// The client address behind Render's proxy (step E.7, D-122). The sign-in limit counts per
// address, so these tests watch when it answers 429. supertest connects from this machine, so
// the socket address is always the same one.
// Fake values for tests only. Addresses from the documentation ranges (RFC 5737).
const SECRET = "test-only-secret-for-trust-proxy-test-01";
const T0 = new Date("2026-10-30T10:00:00.000Z");

function build(trustProxyHops?: number) {
  return createApp({
    store: createMemoryStore(),
    tokenSecret: SECRET,
    now: () => T0,
    ...(trustProxyHops === undefined ? {} : { trustProxyHops }),
  });
}

function login(app: ReturnType<typeof build>, forwardedFor?: string) {
  const req = request(app).post("/auth/login");
  if (forwardedFor !== undefined) req.set("X-Forwarded-For", forwardedFor);
  return req.send({ email: "nobody@example.test", password: "wrong-password-123" });
}

describe("readTrustProxyHops", () => {
  it("gives 0 when the setting is missing or empty", () => {
    expect(readTrustProxyHops({})).toBe(0);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: "" })).toBe(0);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: "  " })).toBe(0);
  });

  it("reads a whole number from 0 to the highest, with spaces trimmed", () => {
    expect(MAX_TRUST_PROXY_HOPS).toBe(5);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: "0" })).toBe(0);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: "1" })).toBe(1);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: " 2 " })).toBe(2);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: "5" })).toBe(5);
  });

  it.each(["6", "9", "10", "-1", "1.5", "01", "1e0", "one", "true", "loopback"])(
    "refuses %j with a message that names the setting only",
    (value) => {
      expect(() => readTrustProxyHops({ TRUST_PROXY_HOPS: value })).toThrow(TrustProxyConfigError);
      expect(() => readTrustProxyHops({ TRUST_PROXY_HOPS: value })).toThrow(
        "TRUST_PROXY_HOPS must be a whole number from 0 to 5.",
      );
    },
  );
});

describe("sign-in limit and the client address (E.7)", () => {
  it("ignores X-Forwarded-For by default: new forwarded addresses share one count", async () => {
    const app = build();
    for (let i = 0; i < LOGIN_LIMIT_MAX; i += 1) {
      expect((await login(app, `203.0.113.${i}`)).status).toBe(401);
    }
    expect((await login(app, "203.0.113.200")).status).toBe(429);
  });

  it("ignores X-Forwarded-For with 0 hops", async () => {
    const app = build(0);
    for (let i = 0; i < LOGIN_LIMIT_MAX; i += 1) {
      expect((await login(app, `203.0.113.${i}`)).status).toBe(401);
    }
    expect((await login(app, "203.0.113.200")).status).toBe(429);
  });

  it("with 1 hop counts each client the proxy names (the last entry) on its own", async () => {
    const app = build(1);
    for (let i = 0; i < LOGIN_LIMIT_MAX; i += 1) {
      expect((await login(app, "203.0.113.1")).status).toBe(401);
    }
    expect((await login(app, "203.0.113.1")).status).toBe(429);
    expect((await login(app, "203.0.113.2")).status).toBe(401);
  });

  it("with 1 hop a client cannot dodge the limit by sending its own X-Forwarded-For entries", async () => {
    const app = build(1);
    // The client wrote the first entry; the proxy added the last one, the real client address.
    for (let i = 0; i < LOGIN_LIMIT_MAX; i += 1) {
      expect((await login(app, `198.51.100.${i}, 203.0.113.9`)).status).toBe(401);
    }
    expect((await login(app, "198.51.100.250, 203.0.113.9")).status).toBe(429);
  });

  it("with 2 hops reads the entry before the last one", async () => {
    const app = build(2);
    for (let i = 0; i < LOGIN_LIMIT_MAX; i += 1) {
      expect((await login(app, `198.51.100.${i}, 203.0.113.9, 192.0.2.1`)).status).toBe(401);
    }
    expect((await login(app, "198.51.100.250, 203.0.113.9, 192.0.2.7")).status).toBe(429);
    expect((await login(app, "203.0.113.10, 192.0.2.1")).status).toBe(401);
  });

  it("with 1 hop and no X-Forwarded-For falls back to the socket address", async () => {
    const app = build(1);
    for (let i = 0; i < LOGIN_LIMIT_MAX; i += 1) {
      expect((await login(app)).status).toBe(401);
    }
    expect((await login(app)).status).toBe(429);
  });
});


describe("forwardedForCount (E.8b)", () => {
  it.each([
    { header: undefined, count: 0 },
    { header: "", count: 0 },
    { header: " , ", count: 0 },
    { header: "203.0.113.1", count: 1 },
    { header: "203.0.113.1, 192.0.2.1", count: 2 },
    { header: "203.0.113.1,,192.0.2.1, ", count: 2 },
  ])("counts $header as $count", ({ header, count }) => {
    expect(forwardedForCount(header)).toBe(count);
  });
});

describe("sign-in log of the X-Forwarded-For count (E.8b)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function logLines(spy: { mock: { calls: unknown[][] } }): string[] {
    return spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith("sign-in:"));
  }

  it("logs the count and the setting when they differ, never an address", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await login(build(), "203.0.113.1, 192.0.2.1");
    const lines = logLines(spy);
    expect(lines).toEqual(["sign-in: X-Forwarded-For has 2 entries, TRUST_PROXY_HOPS is 0"]);
    expect(lines.join(" ")).not.toContain("203.0.113");
    expect(lines.join(" ")).not.toContain("192.0.2");
  });

  it("logs nothing when the count matches the setting", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await login(build(1), "203.0.113.1");
    await login(build(2), "203.0.113.1, 192.0.2.1");
    await login(build());
    expect(logLines(spy)).toEqual([]);
  });

  it("logs a client's own extra entries", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await login(build(1), "198.51.100.1, 203.0.113.9");
    await login(build(1));
    expect(logLines(spy)).toEqual([
      "sign-in: X-Forwarded-For has 2 entries, TRUST_PROXY_HOPS is 1",
      "sign-in: X-Forwarded-For has 0 entries, TRUST_PROXY_HOPS is 1",
    ]);
  });
});
