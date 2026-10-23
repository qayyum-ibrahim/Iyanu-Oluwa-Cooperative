import { describe, expect, it } from "vitest";
import {
  REFRESH_LOCK_NAME,
  browserRefreshLock,
  createApi,
  type LockRequester,
  type RefreshLock,
} from "../src/api.ts";
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

/** A lock that runs one callback at a time, like a Web Lock shared by tabs. */
function mutex(): RefreshLock & { uses: () => number } {
  let tail: Promise<unknown> = Promise.resolve();
  let uses = 0;
  const lock = <T,>(run: () => Promise<T>): Promise<T> => {
    uses++;
    const result = tail.then(run);
    tail = result.catch(() => undefined);
    return result;
  };
  return Object.assign(lock, { uses: () => uses });
}

function setup(
  handler: Handler,
  refreshToken?: string,
  options: { storage?: TokenStorage; lock?: RefreshLock } = {},
) {
  const calls: Call[] = [];
  const storage = options.storage ?? memoryStorage();
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
  const api = createApi({
    fetch: fetchFake,
    keeper,
    lock: options.lock,
    onSignedOut: () => void signedOut++,
  });
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
    const { api, keeper, calls, signedOutCount } = setup(
      () => json(401, { error: "invalid_token" }),
      "old",
    );
    expect(await api.restore()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
    expect(calls.map((c) => c.path)).toEqual(["/api/refresh"]);
    expect(signedOutCount()).toBe(0);
  });

  it("keeps the stored token when the server cannot be reached", async () => {
    const { api, keeper, calls, signedOutCount } = setup(() => {
      throw new TypeError("Failed to fetch");
    }, "ref1");
    expect(await api.restore()).toBeNull();
    expect(keeper.refreshToken()).toBe("ref1");
    expect(calls.map((c) => c.path)).toEqual(["/api/refresh"]);
    expect(signedOutCount()).toBe(0);
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

  it("keeps the session when the refresh cannot reach the server", async () => {
    const { api, keeper, signedOutCount } = setup((call) => {
      if (call.path === "/api/refresh") throw new TypeError("Failed to fetch");
      return json(401, {});
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    await expect(api.me()).rejects.toThrow("refresh_failed");
    expect(signedOutCount()).toBe(0);
    expect(keeper.refreshToken()).toBe("ref1");
  });

  it("sends a new refresh each time the access token expires", async () => {
    // The server rotates the refresh token and accepts only the newest access token.
    let issued = 1;
    let live: string | null = null;
    const { api, keeper, calls, signedOutCount } = setup((call) => {
      if (call.path === "/api/refresh") {
        if ((call.body as { refreshToken: string }).refreshToken !== `ref${issued}`) {
          return json(401, { error: "invalid_token" });
        }
        issued++;
        live = `Bearer acc${issued}`;
        return json(200, { ...tokens(issued), userId: "u1" });
      }
      return call.auth === live ? json(200, ME) : json(401, {});
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.me()).toEqual(ME);
    live = null; // acc2 expires
    expect(await api.me()).toEqual(ME);
    const refreshes = calls.filter((c) => c.path === "/api/refresh").map((c) => c.body);
    expect(refreshes).toEqual([{ refreshToken: "ref1" }, { refreshToken: "ref2" }]);
    expect(signedOutCount()).toBe(0);
    expect(keeper.refreshToken()).toBe("ref3");
  });
});

describe("refresh lock", () => {
  it("runs every refresh inside the lock", async () => {
    const lock = mutex();
    let inside = false;
    const guarded: RefreshLock = (run) =>
      lock(async () => {
        inside = true;
        try {
          return await run();
        } finally {
          inside = false;
        }
      });
    const seen: boolean[] = [];
    const { api } = setup(
      (call) => {
        if (call.path === "/api/refresh") {
          seen.push(inside);
          return json(200, { ...tokens(2), userId: "u1" });
        }
        return json(200, ME);
      },
      "ref1",
      { lock: guarded },
    );
    expect(await api.restore()).toEqual(ME);
    expect(seen).toEqual([true]);
    expect(lock.uses()).toBe(1);
  });

  it("two tabs on one storage both stay signed in when they refresh at once", async () => {
    // The server rotates the token and refuses an old one (reuse ends the session).
    let current = "ref1";
    let issued = 1;
    let reused = false;
    const server: Handler = async (call) => {
      if (call.path === "/api/refresh") {
        await Promise.resolve();
        const sent = (call.body as { refreshToken: string }).refreshToken;
        if (sent !== current || reused) {
          reused = true;
          return json(401, { error: "invalid_token" });
        }
        issued++;
        current = `ref${issued}`;
        return json(200, { ...tokens(issued), userId: "u1" });
      }
      return call.auth === "Bearer acc1" || reused ? json(401, {}) : json(200, ME);
    };
    const storage = memoryStorage();
    const lock = mutex();
    const tabA = setup(server, undefined, { storage, lock });
    const tabB = setup(server, undefined, { storage, lock });
    tabA.keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    tabB.keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    const [a, b] = await Promise.all([tabA.api.me(), tabB.api.me()]);
    expect(a).toEqual(ME);
    expect(b).toEqual(ME);
    expect(reused).toBe(false);
    expect(tabA.signedOutCount() + tabB.signedOutCount()).toBe(0);
    expect(storage.getItem("iyanu.refreshToken")).toBe("ref3");
  });

  it("a lock that fails counts as a failed refresh and keeps the stored token", async () => {
    const broken: RefreshLock = () => Promise.reject(new Error("SecurityError"));
    const { api, keeper, calls } = setup(() => json(200, ME), "ref1", { lock: broken });
    expect(await api.restore()).toBeNull();
    expect(calls).toHaveLength(0);
    expect(keeper.refreshToken()).toBe("ref1");
  });

  it("a lock that fails during a signed-in call keeps the session", async () => {
    const broken: RefreshLock = () => Promise.reject(new Error("SecurityError"));
    const { api, keeper, calls, signedOutCount } = setup(() => json(401, {}), undefined, {
      lock: broken,
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    await expect(api.me()).rejects.toThrow("refresh_failed");
    expect(calls.map((c) => c.path)).toEqual(["/api/me"]);
    expect(signedOutCount()).toBe(0);
    expect(keeper.refreshToken()).toBe("ref1");
  });

  it("browserRefreshLock uses the named Web Lock, or runs at once without one", async () => {
    const names: string[] = [];
    const locks: LockRequester = {
      request: (name, callback) => {
        names.push(name);
        return callback();
      },
    };
    expect(await browserRefreshLock(locks)(async () => 7)).toBe(7);
    expect(names).toEqual([REFRESH_LOCK_NAME]);
    expect(await browserRefreshLock(undefined)(async () => 8)).toBe(8);
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

const MEMBER = {
  id: "m1",
  membershipId: "IOC/0001",
  fullName: "Test Member",
  phone: "",
  address: "",
  occupation: "",
  status: "ACTIVE",
  createdById: "u1",
  createdAt: "2026-10-23T09:00:00.000Z",
};

const BALANCES = {
  memberId: "m1",
  categories: [
    { category: "Shares", balance: "25000.05", refundable: true },
    { category: "Entrance Fee", balance: "1000.00", refundable: false },
  ],
  refundableTotal: "25000.05",
  nonRefundableTotal: "1000.00",
};

function signedIn(handler: Handler) {
  const s = setup(handler);
  s.keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
  return s;
}

describe("member calls", () => {
  it("lists members with the status filter and the access token", async () => {
    const { api, calls } = signedIn(() => json(200, { members: [MEMBER] }));
    expect(await api.listMembers("inactive")).toEqual({ ok: true, value: [MEMBER] });
    expect(calls).toEqual([
      { path: "/api/members?status=inactive", method: "GET", auth: "Bearer acc1", body: null },
    ]);
  });

  it("reads one member and its balances, with the id made safe for the path", async () => {
    const { api, calls } = signedIn((call) =>
      call.path.endsWith("/balances")
        ? json(200, { balances: BALANCES })
        : json(200, { member: MEMBER }),
    );
    expect(await api.getMember("a/b?c")).toEqual({ ok: true, value: MEMBER });
    expect(await api.memberBalances("m1")).toEqual({ ok: true, value: BALANCES });
    expect(calls.map((c) => c.path)).toEqual(["/api/members/a%2Fb%3Fc", "/api/members/m1/balances"]);
  });

  it("adds a member with a POST and expects 201", async () => {
    const input = { fullName: "Test Member", phone: "", address: "", occupation: "" };
    const { api, calls } = signedIn(() => json(201, { member: MEMBER }));
    expect(await api.createMember(input)).toEqual({ ok: true, value: MEMBER });
    expect(calls[0]).toEqual({ path: "/api/members", method: "POST", auth: "Bearer acc1", body: input });
    const wrong = signedIn(() => json(200, { member: MEMBER }));
    expect(await wrong.api.createMember(input)).toEqual({ ok: false, reason: "server" });
  });

  it("maps 403, 400, 404, 500 and a network failure", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(404, { error: "not_found" }), "not_found"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api, keeper } = signedIn(handler);
      expect(await api.getMember("m1")).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
  });

  it("answers signed_out when the session is gone", async () => {
    const { api, signedOutCount } = setup(() => json(401, { error: "invalid_token" }));
    expect(await api.listMembers("all")).toEqual({ ok: false, reason: "signed_out" });
    expect(signedOutCount()).toBe(1);
  });

  it("answers server for a reply of the wrong shape", async () => {
    const bad: unknown[] = [
      null,
      {},
      { members: "x" },
      { members: [{ ...MEMBER, status: "GONE" }] },
      { members: [{ ...MEMBER, fullName: 1 }] },
      { members: [MEMBER, null] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listMembers("active")).toEqual({ ok: false, reason: "server" });
    }
    const { api } = signedIn(() => json(200, { members: [] }));
    expect(await api.listMembers("active")).toEqual({ ok: true, value: [] });
  });

  it("keeps each member field as sent, an Inactive status too", async () => {
    const inactive = { ...MEMBER, status: "INACTIVE", phone: "08000000001", address: "1 Test Road" };
    const { api } = signedIn(() => json(200, { members: [inactive] }));
    expect(await api.listMembers("inactive")).toEqual({ ok: true, value: [inactive] });
  });

  it("refuses balances whose amounts are not naira strings with two decimals", async () => {
    const row = BALANCES.categories[0];
    const bad: unknown[] = [
      { ...BALANCES, refundableTotal: 25000.05 },
      { ...BALANCES, refundableTotal: "25000.5" },
      { ...BALANCES, refundableTotal: "12.345" },
      { ...BALANCES, nonRefundableTotal: "-1.00" },
      { ...BALANCES, categories: [{ ...row, balance: "1,000.00" }] },
      { ...BALANCES, categories: [{ ...row, balance: "" }] },
      { ...BALANCES, categories: [{ ...row, refundable: "yes" }] },
      { ...BALANCES, categories: [{ ...row, category: 3 }] },
      { ...BALANCES, categories: [null] },
      { ...BALANCES, categories: "none" },
      { ...BALANCES, categories: "" },
      { ...BALANCES, memberId: undefined },
    ];
    for (const balances of bad) {
      const { api } = signedIn(() => json(200, { balances }));
      expect(await api.memberBalances("m1")).toEqual({ ok: false, reason: "server" });
    }
  });
});

const PAYMENT = {
  id: "p1",
  memberId: "m1",
  membershipId: "IOC/0001",
  method: "BANK_TRANSFER",
  total: "7000.50",
  lines: [
    { category: "Savings", amount: "5000.50" },
    { category: "Shares", amount: "2000.00" },
  ],
  createdById: "u1",
  createdAt: "2026-10-23T09:00:00.000Z",
};

const LOAN = {
  id: "l1",
  memberId: "m1",
  membershipId: "IOC/0001",
  principal: "50000.00",
  interestNote: "",
  notes: "",
  expenseId: "e1",
  createdById: "u1",
  createdAt: "2026-10-23T09:00:00.000Z",
  repaid: "10000.00",
  outstanding: "40000.00",
  status: "ACTIVE",
};

describe("payment and loan lists", () => {
  it("lists one member's payments and loans, with the id made safe for the query", async () => {
    const { api, calls } = signedIn((call) =>
      call.path.startsWith("/api/payments")
        ? json(200, { payments: [PAYMENT] })
        : json(200, { loans: [LOAN, { ...LOAN, id: "l0", outstanding: "0.00", status: "FULLY_REPAID" }] }),
    );
    expect(await api.listPayments("a&b=c")).toEqual({ ok: true, value: [PAYMENT] });
    expect(await api.listLoans("a&b=c")).toEqual({
      ok: true,
      value: [LOAN, { ...LOAN, id: "l0", outstanding: "0.00", status: "FULLY_REPAID" }],
    });
    expect(calls).toEqual([
      { path: "/api/payments?memberId=a%26b%3Dc", method: "GET", auth: "Bearer acc1", body: null },
      { path: "/api/loans?memberId=a%26b%3Dc", method: "GET", auth: "Bearer acc1", body: null },
    ]);
  });

  it("maps 403 and 404, and answers signed_out when the session is gone", async () => {
    const refused = signedIn(() => json(403, { error: "forbidden" }));
    expect(await refused.api.listPayments("m1")).toEqual({ ok: false, reason: "forbidden" });
    const missing = signedIn(() => json(404, { error: "not_found" }));
    expect(await missing.api.listLoans("m1")).toEqual({ ok: false, reason: "not_found" });
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.listLoans("m1")).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("refuses payments of the wrong shape or with amounts that are not naira strings", async () => {
    const line = PAYMENT.lines[0];
    const bad: unknown[] = [
      { payments: "x" },
      { payments: [PAYMENT, null] },
      { payments: [{ ...PAYMENT, method: "CHEQUE" }] },
      { payments: [{ ...PAYMENT, total: 7000.5 }] },
      { payments: [{ ...PAYMENT, total: "7000.5" }] },
      { payments: [{ ...PAYMENT, createdAt: 1 }] },
      { payments: [{ ...PAYMENT, lines: "none" }] },
      { payments: [{ ...PAYMENT, lines: "" }] },
      { payments: [{ ...PAYMENT, lines: [null] }] },
      { payments: [{ ...PAYMENT, lines: [{ ...line, amount: "-1.00" }] }] },
      { payments: [{ ...PAYMENT, lines: [{ ...line, category: 2 }] }] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listPayments("m1")).toEqual({ ok: false, reason: "server" });
    }
    const { api } = signedIn(() => json(200, { payments: [] }));
    expect(await api.listPayments("m1")).toEqual({ ok: true, value: [] });
  });

  it("refuses loans of the wrong shape or with amounts that are not naira strings", async () => {
    const bad: unknown[] = [
      { loans: {} },
      { loans: [{ ...LOAN, status: "REPAID" }] },
      { loans: [{ ...LOAN, principal: "50,000.00" }] },
      { loans: [{ ...LOAN, repaid: 10000 }] },
      { loans: [{ ...LOAN, outstanding: "40000" }] },
      { loans: [{ ...LOAN, notes: null }] },
      { loans: [{ ...LOAN, expenseId: undefined }] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listLoans("m1")).toEqual({ ok: false, reason: "server" });
    }
  });
});
