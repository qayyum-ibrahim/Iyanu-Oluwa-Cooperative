import { describe, expect, it } from "vitest";
import { createApi } from "../src/api.ts";
import { createSessionKeeper, type TokenStorage } from "../src/session.ts";

interface Call {
  path: string;
  method: string;
  auth: string | null;
  body: unknown;
}

type Handler = (call: Call) => Response | Promise<Response>;

const ME = {
  user: { id: "u1", email: "owner@example.test", displayName: "Owner", role: "SUPER_ADMIN" },
  permissions: ["members.view"],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokens(n: number) {
  return {
    accessToken: `acc${n}`,
    accessExpiresAt: "2026-10-22T10:15:00.000Z",
    refreshToken: `ref${n}`,
    refreshExpiresAt: "2026-10-29T10:00:00.000Z",
  };
}

function memoryStorage(): TokenStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(handler: Handler, refreshToken?: string) {
  const calls: Call[] = [];
  const storage = memoryStorage();
  const keeper = createSessionKeeper(storage);
  if (refreshToken !== undefined) storage.setItem("iyanu.refreshToken", refreshToken);
  let signedOut = 0;
  const fetchFake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      path: String(input),
      method: init?.method ?? "GET",
      auth: headers.get("Authorization"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  const api = createApi({ fetch: fetchFake, keeper, onSignedOut: () => void signedOut++ });
  return { api, keeper, calls, signedOutCount: () => signedOut };
}

describe("login", () => {
  it("saves the tokens, then reads /me with the new access token", async () => {
    const { api, keeper, calls } = setup((call) => {
      if (call.path === "/api/login") return json(200, { ...tokens(1), user: ME.user });
      if (call.path === "/api/me") return json(200, ME);
      return json(404, {});
    });
    const result = await api.login("owner@example.test", "correct horse battery");
    expect(result).toEqual({ ok: true, me: ME });
    expect(keeper.accessToken()).toBe("acc1");
    expect(keeper.refreshToken()).toBe("ref1");
    expect(calls[0]).toEqual({
      path: "/api/login",
      method: "POST",
      auth: null,
      body: { email: "owner@example.test", password: "correct horse battery" },
    });
    expect(calls[1]).toMatchObject({ path: "/api/me", auth: "Bearer acc1" });
  });

  it("answers invalid_credentials on 401 and keeps nothing", async () => {
    const { api, keeper } = setup(() => json(401, { error: "invalid_credentials" }));
    expect(await api.login("a@b.test", "wrong")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("answers network when fetch throws, and server on other statuses", async () => {
    const down = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    expect(await down.api.login("a@b.test", "x")).toEqual({ ok: false, reason: "network" });
    const broken = setup(() => json(500, { error: "server_error" }));
    expect(await broken.api.login("a@b.test", "x")).toEqual({ ok: false, reason: "server" });
  });

  it("clears the tokens when /me fails after a good login", async () => {
    const { api, keeper } = setup((call) =>
      call.path === "/api/login" ? json(200, { ...tokens(1), user: ME.user }) : json(500, {}),
    );
    expect(await api.login("a@b.test", "x")).toEqual({ ok: false, reason: "server" });
    expect(keeper.refreshToken()).toBeNull();
    expect(keeper.accessToken()).toBeNull();
  });
});

describe("restore", () => {
  it("returns null and calls nothing without a stored refresh token", async () => {
    const { api, calls } = setup(() => json(500, {}));
    expect(await api.restore()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("refreshes with the stored token, saves the rotated pair, then reads /me", async () => {
    const { api, keeper, calls } = setup((call) => {
      if (call.path === "/api/refresh") return json(200, { ...tokens(2), userId: "u1" });
      if (call.path === "/api/me") return json(200, ME);
      return json(404, {});
    }, "ref1");
    expect(await api.restore()).toEqual(ME);
    expect(calls[0]).toMatchObject({ path: "/api/refresh", body: { refreshToken: "ref1" } });
    expect(calls[1]).toMatchObject({ path: "/api/me", auth: "Bearer acc2" });
    expect(keeper.refreshToken()).toBe("ref2");
  });

  it("clears the stored token when the refresh is refused", async () => {
    const { api, keeper } = setup(() => json(401, { error: "invalid_token" }), "old");
    expect(await api.restore()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("keeps the stored token when the server cannot be reached", async () => {
    const { api, keeper } = setup(() => {
      throw new TypeError("Failed to fetch");
    }, "ref1");
    expect(await api.restore()).toBeNull();
    expect(keeper.refreshToken()).toBe("ref1");
  });
});

describe("signed-in calls", () => {
  it("on a 401 refreshes once and retries with the new access token", async () => {
    const { api, keeper, calls } = setup((call) => {
      if (call.path === "/api/refresh") return json(200, { ...tokens(2), userId: "u1" });
      if (call.path === "/api/me") {
        return call.auth === "Bearer acc2" ? json(200, ME) : json(401, { error: "unauthorized" });
      }
      return json(404, {});
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.me()).toEqual(ME);
    expect(calls.map((c) => c.path)).toEqual(["/api/me", "/api/refresh", "/api/me"]);
    expect(calls[1]?.body).toEqual({ refreshToken: "ref1" });
  });

  it("signs out when the refresh is refused", async () => {
    const { api, keeper, signedOutCount } = setup((call) =>
      call.path === "/api/refresh" ? json(401, { error: "invalid_token" }) : json(401, {}),
    );
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.me()).toBeNull();
    expect(signedOutCount()).toBe(1);
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("signs out when the retry after a good refresh still answers 401", async () => {
    const { api, keeper, calls, signedOutCount } = setup((call) =>
      call.path === "/api/refresh" ? json(200, { ...tokens(2), userId: "u1" }) : json(401, {}),
    );
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.me()).toBeNull();
    expect(signedOutCount()).toBe(1);
    expect(calls).toHaveLength(3);
    expect(keeper.refreshToken()).toBeNull();
  });

  it("sends one refresh for two calls that both get 401", async () => {
    let refreshes = 0;
    const { api, keeper } = setup(async (call) => {
      if (call.path === "/api/refresh") {
        refreshes++;
        await Promise.resolve();
        return call.body && (call.body as { refreshToken: string }).refreshToken === "ref1"
          ? json(200, { ...tokens(2), userId: "u1" })
          : json(401, { error: "invalid_token" });
      }
      return call.auth === "Bearer acc2" ? json(200, ME) : json(401, {});
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    const [a, b] = await Promise.all([api.me(), api.me()]);
    expect(a).toEqual(ME);
    expect(b).toEqual(ME);
    expect(refreshes).toBe(1);
  });
});

describe("logout", () => {
  it("sends the refresh token and clears both tokens", async () => {
    const { api, keeper, calls } = setup(() => new Response(null, { status: 204 }));
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    await api.logout();
    expect(calls).toEqual([
      { path: "/api/logout", method: "POST", auth: null, body: { refreshToken: "ref1" } },
    ]);
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("clears the tokens even when the server cannot be reached", async () => {
    const { api, keeper } = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    await api.logout();
    expect(keeper.refreshToken()).toBeNull();
  });
});

describe("changePassword", () => {
  it("on 204 clears the tokens, because the server revoked them", async () => {
    const { api, keeper, calls } = setup(() => new Response(null, { status: 204 }));
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.changePassword("old password 1", "new password 12")).toEqual({ ok: true });
    expect(calls[0]).toEqual({
      path: "/api/password",
      method: "POST",
      auth: "Bearer acc1",
      body: { currentPassword: "old password 1", newPassword: "new password 12" },
    });
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("maps 403, 400, 500 and a network failure, and keeps the session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "wrong_password" }), "wrong_password"],
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api, keeper } = setup(handler);
      keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
      expect(await api.changePassword("a", "b")).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
  });

  it("answers signed_out when the session is gone", async () => {
    const { api, signedOutCount } = setup(() => json(401, { error: "invalid_token" }));
    expect(await api.changePassword("a", "b")).toEqual({ ok: false, reason: "signed_out" });
    expect(signedOutCount()).toBe(1);
  });
});
