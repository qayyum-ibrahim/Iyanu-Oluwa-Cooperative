import { describe, expect, it } from "vitest";
import { apiProxy, DEFAULT_API_TARGET, stripApiPrefix } from "../src/api-proxy";

describe("stripApiPrefix (A-191)", () => {
  it("removes /api from the front of a route", () => {
    expect(stripApiPrefix("/api/auth/login")).toBe("/auth/login");
    expect(stripApiPrefix("/api/members/abc/balances")).toBe("/members/abc/balances");
  });

  it("keeps the query string", () => {
    expect(stripApiPrefix("/api/members?status=ACTIVE")).toBe("/members?status=ACTIVE");
    expect(stripApiPrefix("/api?x=1")).toBe("?x=1");
  });

  it("turns /api alone into /", () => {
    expect(stripApiPrefix("/api")).toBe("/");
    expect(stripApiPrefix("/api/")).toBe("/");
  });

  it("leaves paths that only start with the letters api alone", () => {
    expect(stripApiPrefix("/apix/members")).toBe("/apix/members");
    expect(stripApiPrefix("/members/api")).toBe("/members/api");
  });
});

describe("apiProxy", () => {
  it("forwards /api to the API on port 3000 by default", () => {
    const entry = apiProxy()["/api"];
    expect(entry?.target).toBe(DEFAULT_API_TARGET);
    expect(entry?.target).toBe("http://localhost:3000");
    expect(entry?.changeOrigin).toBe(true);
    expect(entry?.rewrite("/api/health")).toBe("/health");
  });

  it("uses a given target", () => {
    expect(apiProxy("http://localhost:4000")["/api"]?.target).toBe("http://localhost:4000");
  });

  it("forwards only /api", () => {
    expect(Object.keys(apiProxy())).toEqual(["/api"]);
  });
});
