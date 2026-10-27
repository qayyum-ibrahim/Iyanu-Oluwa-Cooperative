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
  const keys: (string | null)[] = [];
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
    keys.push(headers.get("Idempotency-Key"));
    return handler(call);
  }) as typeof fetch;
  const api = createApi({
    fetch: fetchFake,
    keeper,
    lock: options.lock,
    onSignedOut: () => void signedOut++,
  });
  return { api, keeper, calls, keys, signedOutCount: () => signedOut };
}

describe("login", () => {
  it("saves the tokens, then reads /me with the new access token", async () => {
    const { api, keeper, calls } = setup((call) => {
      if (call.path === "/api/auth/login") return json(200, { ...tokens(1), user: ME.user });
      if (call.path === "/api/auth/me") return json(200, ME);
      return json(404, {});
    });
    const result = await api.login("owner@example.test", "correct horse battery");
    expect(result).toEqual({ ok: true, me: ME });
    expect(keeper.accessToken()).toBe("acc1");
    expect(keeper.refreshToken()).toBe("ref1");
    expect(calls[0]).toEqual({
      path: "/api/auth/login",
      method: "POST",
      auth: null,
      body: { email: "owner@example.test", password: "correct horse battery" },
    });
    expect(calls[1]).toMatchObject({ path: "/api/auth/me", auth: "Bearer acc1" });
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
      call.path === "/api/auth/login" ? json(200, { ...tokens(1), user: ME.user }) : json(500, {}),
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
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      if (call.path === "/api/auth/me") return json(200, ME);
      return json(404, {});
    }, "ref1");
    expect(await api.restore()).toEqual(ME);
    expect(calls[0]).toMatchObject({ path: "/api/auth/refresh", body: { refreshToken: "ref1" } });
    expect(calls[1]).toMatchObject({ path: "/api/auth/me", auth: "Bearer acc2" });
    expect(keeper.refreshToken()).toBe("ref2");
  });

  it("clears the stored token when the refresh is refused", async () => {
    const { api, keeper, calls, signedOutCount } = setup(
      () => json(401, { error: "invalid_token" }),
      "old",
    );
    expect(await api.restore()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/refresh"]);
    expect(signedOutCount()).toBe(0);
  });

  it("keeps the stored token when the server cannot be reached", async () => {
    const { api, keeper, calls, signedOutCount } = setup(() => {
      throw new TypeError("Failed to fetch");
    }, "ref1");
    expect(await api.restore()).toBeNull();
    expect(keeper.refreshToken()).toBe("ref1");
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/refresh"]);
    expect(signedOutCount()).toBe(0);
  });
});

describe("signed-in calls", () => {
  it("on a 401 refreshes once and retries with the new access token", async () => {
    const { api, keeper, calls } = setup((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      if (call.path === "/api/auth/me") {
        return call.auth === "Bearer acc2" ? json(200, ME) : json(401, { error: "unauthorized" });
      }
      return json(404, {});
    });
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.me()).toEqual(ME);
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/me", "/api/auth/refresh", "/api/auth/me"]);
    expect(calls[1]?.body).toEqual({ refreshToken: "ref1" });
  });

  it("signs out when the refresh is refused", async () => {
    const { api, keeper, signedOutCount } = setup((call) =>
      call.path === "/api/auth/refresh" ? json(401, { error: "invalid_token" }) : json(401, {}),
    );
    keeper.save({ accessToken: "acc1", refreshToken: "ref1" });
    expect(await api.me()).toBeNull();
    expect(signedOutCount()).toBe(1);
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("signs out when the retry after a good refresh still answers 401", async () => {
    const { api, keeper, calls, signedOutCount } = setup((call) =>
      call.path === "/api/auth/refresh" ? json(200, { ...tokens(2), userId: "u1" }) : json(401, {}),
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
      if (call.path === "/api/auth/refresh") {
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
      if (call.path === "/api/auth/refresh") throw new TypeError("Failed to fetch");
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
      if (call.path === "/api/auth/refresh") {
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
    const refreshes = calls.filter((c) => c.path === "/api/auth/refresh").map((c) => c.body);
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
        if (call.path === "/api/auth/refresh") {
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
      if (call.path === "/api/auth/refresh") {
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
    expect(calls.map((c) => c.path)).toEqual(["/api/auth/me"]);
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
      { path: "/api/auth/logout", method: "POST", auth: null, body: { refreshToken: "ref1" } },
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
      path: "/api/auth/password",
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
  paidOn: "2026-10-22",
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
  givenOn: "2026-10-20",
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
      { payments: [{ ...PAYMENT, paidOn: undefined }] },
      { payments: [{ ...PAYMENT, paidOn: 20261022 }] },
      { payments: [{ ...PAYMENT, paidOn: "22-10-2026" }] },
      { payments: [{ ...PAYMENT, paidOn: "2026-10-22T00:00:00.000Z" }] },
      { payments: [{ ...PAYMENT, paidOn: "x2026-10-22" }] },
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
      { loans: [{ ...LOAN, givenOn: undefined }] },
      { loans: [{ ...LOAN, givenOn: 20261020 }] },
      { loans: [{ ...LOAN, givenOn: "20-10-2026" }] },
      { loans: [{ ...LOAN, givenOn: "2026-10-20T00:00:00.000Z" }] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listLoans("m1")).toEqual({ ok: false, reason: "server" });
    }
  });
});

const NEW_PAYMENT = {
  idempotencyKey: "key-0000000000000001",
  memberId: "m1",
  method: "BANK_TRANSFER" as const,
  paidOn: "2026-10-22",
  total: "7000.50",
  lines: [
    { category: "Savings", amount: "5000.50" },
    { category: "Shares", amount: "2000.00" },
  ],
  sendSms: true,
};

const SENT_BODY = {
  memberId: "m1",
  method: "BANK_TRANSFER",
  paidOn: "2026-10-22",
  total: "7000.50",
  lines: NEW_PAYMENT.lines,
  sendSms: true,
};

function replayed(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
  });
}

describe("createPayment", () => {
  it("posts the payment with the key in the Idempotency-Key header, not in the body", async () => {
    const { api, calls, keys } = signedIn(() =>
      json(201, { payment: PAYMENT, sms: { status: "sent" } }),
    );
    expect(await api.createPayment(NEW_PAYMENT)).toEqual({
      ok: true,
      payment: PAYMENT,
      replayed: false,
      sms: { status: "sent" },
    });
    expect(calls).toEqual([
      { path: "/api/payments", method: "POST", auth: "Bearer acc1", body: SENT_BODY },
    ]);
    expect(keys).toEqual(["key-0000000000000001"]);
  });

  it("reads the Idempotent-Replayed header and each SMS outcome", async () => {
    const outcomes: unknown[] = [
      { status: "not_requested" },
      { status: "skipped_repeat" },
      { status: "failed", reason: "invalid_number" },
      { status: "failed", reason: "invalid_message" },
      { status: "failed", reason: "provider_error" },
    ];
    for (const sms of outcomes) {
      const { api } = signedIn(() => replayed({ payment: PAYMENT, sms }));
      expect(await api.createPayment(NEW_PAYMENT)).toEqual({
        ok: true,
        payment: PAYMENT,
        replayed: true,
        sms,
      });
    }
  });

  it("on a 401 refreshes once and sends the same key and body again", async () => {
    const { api, calls, keys } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2"
        ? json(201, { payment: PAYMENT, sms: { status: "sent" } })
        : json(401, {});
    });
    expect(await api.createPayment(NEW_PAYMENT)).toMatchObject({ ok: true, replayed: false });
    expect(calls.map((c) => c.path)).toEqual(["/api/payments", "/api/auth/refresh", "/api/payments"]);
    expect(calls[2]?.body).toEqual(SENT_BODY);
    expect(keys[2]).toBe("key-0000000000000001");
  });

  it("passes each 409 reason on, and answers server for a 409 it does not know", async () => {
    for (const error of [
      "member_inactive",
      "idempotency_conflict",
      "no_active_loan",
      "loan_overpayment",
    ]) {
      const { api } = signedIn(() => json(409, { error }));
      expect(await api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason: error });
    }
    for (const body of [{ error: "already_active" }, { error: "toString" }, null, "x"]) {
      const { api } = signedIn(() => json(409, body));
      expect(await api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason: "server" });
    }
  });

  it("passes the code and the line position of a 400 on", async () => {
    const line = signedIn(() =>
      json(400, { error: "invalid_input", code: "invalid_amount", lineIndex: 1 }),
    );
    expect(await line.api.createPayment(NEW_PAYMENT)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_amount",
      lineIndex: 1,
    });
    const first = signedIn(() =>
      json(400, { error: "invalid_input", code: "invalid_amount", lineIndex: 0 }),
    );
    expect(await first.api.createPayment(NEW_PAYMENT)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_amount",
      lineIndex: 0,
    });
    const date = signedIn(() => json(400, { error: "invalid_input", code: "future_paid_on" }));
    expect(await date.api.createPayment(NEW_PAYMENT)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "future_paid_on",
    });
    for (const body of [
      { error: "invalid_input", code: 3, lineIndex: -1 },
      { error: "invalid_input", lineIndex: 1.5 },
      { error: "invalid_input", lineIndex: "1" },
      null,
    ]) {
      const { api } = signedIn(() => json(400, body));
      expect(await api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason: "invalid_input" });
    }
  });

  it("maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      expect(await api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 201 of the wrong shape and for a 200", async () => {
    const bad: unknown[] = [
      null,
      { sms: { status: "sent" } },
      { payment: PAYMENT },
      { payment: { ...PAYMENT, paidOn: undefined }, sms: { status: "sent" } },
      { payment: { ...PAYMENT, total: 7000.5 }, sms: { status: "sent" } },
      { payment: PAYMENT, sms: { status: "queued" } },
      { payment: PAYMENT, sms: { status: "queued", reason: "provider_error" } },
      { payment: PAYMENT, sms: { status: "failed" } },
      { payment: PAYMENT, sms: { status: "failed", reason: "timeout" } },
      { payment: PAYMENT, sms: "sent" },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(201, body));
      expect(await api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(200, { payment: PAYMENT, sms: { status: "sent" } }));
    expect(await wrong.api.createPayment(NEW_PAYMENT)).toEqual({ ok: false, reason: "server" });
  });
});

/** The loan as POST /loans sends it: LOAN without what GET /loans works out on read. */
const GIVEN_LOAN = {
  id: LOAN.id,
  memberId: LOAN.memberId,
  membershipId: LOAN.membershipId,
  principal: LOAN.principal,
  interestNote: LOAN.interestNote,
  notes: LOAN.notes,
  givenOn: LOAN.givenOn,
  expenseId: LOAN.expenseId,
  createdById: LOAN.createdById,
  createdAt: LOAN.createdAt,
};

const NEW_LOAN = {
  idempotencyKey: "key-0000000000000002",
  memberId: "m1",
  method: "CASH" as const,
  givenOn: "2026-10-20",
  principal: "50000.00",
  interestNote: "5% flat",
  notes: "",
};

const SENT_LOAN = {
  memberId: "m1",
  method: "CASH",
  givenOn: "2026-10-20",
  principal: "50000.00",
  interestNote: "5% flat",
  notes: "",
};

describe("createLoan", () => {
  it("posts the loan with the key in the Idempotency-Key header, not in the body", async () => {
    const { api, calls, keys } = signedIn(() => json(201, { loan: GIVEN_LOAN }));
    expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: true, loan: GIVEN_LOAN, replayed: false });
    expect(calls).toEqual([{ path: "/api/loans", method: "POST", auth: "Bearer acc1", body: SENT_LOAN }]);
    expect(keys).toEqual(["key-0000000000000002"]);
  });

  it("reads the Idempotent-Replayed header", async () => {
    const { api } = signedIn(() => replayed({ loan: GIVEN_LOAN }));
    expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: true, loan: GIVEN_LOAN, replayed: true });
  });

  it("on a 401 refreshes once and sends the same key and body again", async () => {
    const { api, calls, keys } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(201, { loan: GIVEN_LOAN }) : json(401, {});
    });
    expect(await api.createLoan(NEW_LOAN)).toMatchObject({ ok: true, replayed: false });
    expect(calls.map((c) => c.path)).toEqual(["/api/loans", "/api/auth/refresh", "/api/loans"]);
    expect(calls[2]?.body).toEqual(SENT_LOAN);
    expect(keys[2]).toBe("key-0000000000000002");
  });

  it("passes each 409 reason on, and answers server for a 409 it does not know", async () => {
    for (const error of ["member_inactive", "active_loan", "idempotency_conflict"]) {
      const { api } = signedIn(() => json(409, { error }));
      expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason: error });
    }
    for (const body of [{ error: "loan_overpayment" }, { error: "toString" }, null, "x"]) {
      const { api } = signedIn(() => json(409, body));
      expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason: "server" });
    }
  });

  it("passes the code of a 400 on", async () => {
    const date = signedIn(() => json(400, { error: "invalid_input", code: "future_given_on" }));
    expect(await date.api.createLoan(NEW_LOAN)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "future_given_on",
    });
    for (const body of [{ error: "invalid_input", code: 3 }, { error: "invalid_input" }, null]) {
      const { api } = signedIn(() => json(400, body));
      expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason: "invalid_input" });
    }
  });

  it("maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 201 of the wrong shape and for a 200", async () => {
    const bad: unknown[] = [
      null,
      {},
      { loan: null },
      { loan: { ...GIVEN_LOAN, givenOn: undefined } },
      { loan: { ...GIVEN_LOAN, givenOn: "20-10-2026" } },
      { loan: { ...GIVEN_LOAN, principal: 50000 } },
      { loan: { ...GIVEN_LOAN, principal: "50000" } },
      { loan: { ...GIVEN_LOAN, expenseId: undefined } },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(201, body));
      expect(await api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(200, { loan: GIVEN_LOAN }));
    expect(await wrong.api.createLoan(NEW_LOAN)).toEqual({ ok: false, reason: "server" });
  });
});

const EXPENSE = {
  id: "e1",
  category: "Others",
  amount: "15000.50",
  method: "CASH",
  spentOn: "2026-10-21",
  description: "Generator fuel",
  narration: "For the office",
  createdById: "u1",
  createdAt: "2026-10-23T09:00:00.000Z",
};

describe("listExpenses", () => {
  it("lists with no query when no filter is set", async () => {
    const { api, calls } = signedIn(() => json(200, { expenses: [EXPENSE], total: "15000.50" }));
    expect(await api.listExpenses({})).toEqual({
      ok: true,
      value: { expenses: [EXPENSE], total: "15000.50" },
    });
    expect(calls).toEqual([{ path: "/api/expenses", method: "GET", auth: "Bearer acc1", body: null }]);
  });

  it("sends each filter in a fixed order, each value made safe for the query", async () => {
    const { api, calls } = signedIn(() => json(200, { expenses: [], total: "0.00" }));
    await api.listExpenses({
      toDay: "2026-10-31",
      fromDay: "2026-10-01",
      method: "BANK_TRANSFER",
      category: "Payment to Union",
    });
    await api.listExpenses({ category: "a&b=c" });
    await api.listExpenses({ toDay: "2026-10-31" });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/expenses?category=Payment%20to%20Union&method=BANK_TRANSFER&fromDay=2026-10-01&toDay=2026-10-31",
      "/api/expenses?category=a%26b%3Dc",
      "/api/expenses?toDay=2026-10-31",
    ]);
  });

  it("maps 403, 400, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(400, { error: "invalid_input", code: "invalid_range" }), "invalid_input"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api } = signedIn(handler);
      expect(await api.listExpenses({})).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.listExpenses({})).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a reply of the wrong shape or with amounts that are not naira strings", async () => {
    const bad: unknown[] = [
      null,
      {},
      { expenses: [EXPENSE] },
      { expenses: [EXPENSE], total: 15000.5 },
      { expenses: [EXPENSE], total: "15000.5" },
      { expenses: "x", total: "0.00" },
      { expenses: [EXPENSE, null], total: "15000.50" },
      { expenses: [{ ...EXPENSE, amount: "15,000.50" }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, amount: 15000.5 }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, method: "CHEQUE" }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, spentOn: undefined }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, spentOn: "21-10-2026" }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, spentOn: "2026-10-21T00:00:00.000Z" }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, narration: null }], total: "15000.50" },
      { expenses: [{ ...EXPENSE, category: 3 }], total: "15000.50" },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listExpenses({})).toEqual({ ok: false, reason: "server" });
    }
  });
});

const NEW_EXPENSE = {
  idempotencyKey: "key-0000000000000003",
  category: "Others",
  method: "CASH" as const,
  spentOn: "2026-10-21",
  amount: "15000.50",
  description: "Generator fuel",
  narration: "For the office",
};

const SENT_EXPENSE = {
  category: "Others",
  method: "CASH",
  spentOn: "2026-10-21",
  amount: "15000.50",
  description: "Generator fuel",
  narration: "For the office",
};

describe("createExpense", () => {
  it("posts the expense with the key in the Idempotency-Key header, not in the body", async () => {
    const { api, calls, keys } = signedIn(() => json(201, { expense: EXPENSE }));
    expect(await api.createExpense(NEW_EXPENSE)).toEqual({ ok: true, expense: EXPENSE, replayed: false });
    expect(calls).toEqual([{ path: "/api/expenses", method: "POST", auth: "Bearer acc1", body: SENT_EXPENSE }]);
    expect(keys).toEqual(["key-0000000000000003"]);
  });

  it("reads the Idempotent-Replayed header", async () => {
    const { api } = signedIn(() => replayed({ expense: EXPENSE }));
    expect(await api.createExpense(NEW_EXPENSE)).toEqual({ ok: true, expense: EXPENSE, replayed: true });
  });

  it("on a 401 refreshes once and sends the same key and body again", async () => {
    const { api, calls, keys } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(201, { expense: EXPENSE }) : json(401, {});
    });
    expect(await api.createExpense(NEW_EXPENSE)).toMatchObject({ ok: true, replayed: false });
    expect(calls.map((c) => c.path)).toEqual(["/api/expenses", "/api/auth/refresh", "/api/expenses"]);
    expect(calls[2]?.body).toEqual(SENT_EXPENSE);
    expect(keys[2]).toBe("key-0000000000000003");
  });

  it("passes idempotency_conflict on, and answers server for any other 409", async () => {
    const { api } = signedIn(() => json(409, { error: "idempotency_conflict" }));
    expect(await api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason: "idempotency_conflict" });
    for (const body of [{ error: "active_loan" }, { error: "toString" }, null, "x"]) {
      const other = signedIn(() => json(409, body));
      expect(await other.api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason: "server" });
    }
  });

  it("passes the code of a 400 on", async () => {
    const day = signedIn(() => json(400, { error: "invalid_input", code: "future_spent_on" }));
    expect(await day.api.createExpense(NEW_EXPENSE)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "future_spent_on",
    });
    for (const body of [{ error: "invalid_input", code: 3 }, { error: "invalid_input" }, null]) {
      const { api } = signedIn(() => json(400, body));
      expect(await api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason: "invalid_input" });
    }
  });

  it("maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      expect(await api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 201 of the wrong shape and for a 200", async () => {
    const bad: unknown[] = [
      null,
      {},
      { expense: null },
      { expense: { ...EXPENSE, spentOn: undefined } },
      { expense: { ...EXPENSE, spentOn: "21-10-2026" } },
      { expense: { ...EXPENSE, amount: 15000.5 } },
      { expense: { ...EXPENSE, amount: "15000.5" } },
      { expense: { ...EXPENSE, method: "CHEQUE" } },
      { expense: { ...EXPENSE, narration: null } },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(201, body));
      expect(await api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(200, { expense: EXPENSE }));
    expect(await wrong.api.createExpense(NEW_EXPENSE)).toEqual({ ok: false, reason: "server" });
  });
});

const EXPENSE_EDIT = { ...SENT_EXPENSE, method: "CASH" as const };

describe("updateExpense", () => {
  it("puts every field to the expense's path, with no Idempotency-Key", async () => {
    const { api, calls, keys } = signedIn(() => json(200, { expense: EXPENSE }));
    expect(await api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: true, expense: EXPENSE });
    expect(calls).toEqual([{ path: "/api/expenses/e1", method: "PUT", auth: "Bearer acc1", body: SENT_EXPENSE }]);
    expect(keys).toEqual([null]);
  });

  it("makes the id safe for the path", async () => {
    const { api, calls } = signedIn(() => json(200, { expense: EXPENSE }));
    await api.updateExpense("a/b?c", EXPENSE_EDIT);
    expect(calls[0]?.path).toBe("/api/expenses/a%2Fb%3Fc");
  });

  it("passes not_editable on with its code, and answers server for any other 409", async () => {
    for (const code of ["loan_linked", "pay_off"]) {
      const { api } = signedIn(() => json(409, { error: "not_editable", code }));
      expect(await api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "not_editable", code });
    }
    const bare = signedIn(() => json(409, { error: "not_editable" }));
    expect(await bare.api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "not_editable" });
    for (const body of [{ error: "not_deletable", code: "pay_off" }, { error: "idempotency_conflict" }, null]) {
      const other = signedIn(() => json(409, body));
      expect(await other.api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "server" });
    }
  });

  it("passes the code of a 400 on", async () => {
    const day = signedIn(() => json(400, { error: "invalid_input", code: "narration_not_allowed" }));
    expect(await day.api.updateExpense("e1", EXPENSE_EDIT)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "narration_not_allowed",
    });
    const bare = signedIn(() => json(400, { error: "invalid_input", code: 3 }));
    expect(await bare.api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "invalid_input" });
  });

  it("maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      const { api } = signedIn(handler);
      expect(await api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 200 of the wrong shape and for a 201", async () => {
    for (const body of [null, {}, { expense: { ...EXPENSE, amount: "15000.5" } }, { expense: { ...EXPENSE, spentOn: 1 } }]) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, { expense: EXPENSE }));
    expect(await wrong.api.updateExpense("e1", EXPENSE_EDIT)).toEqual({ ok: false, reason: "server" });
  });
});

describe("deleteExpense", () => {
  it("deletes the expense's path and answers ok on 204", async () => {
    const { api, calls, keys } = signedIn(() => new Response(null, { status: 204 }));
    expect(await api.deleteExpense("a/b")).toEqual({ ok: true });
    expect(calls).toEqual([{ path: "/api/expenses/a%2Fb", method: "DELETE", auth: "Bearer acc1", body: null }]);
    expect(keys).toEqual([null]);
  });

  it("passes not_deletable on with its code, and answers server for any other 409 and for a 200", async () => {
    for (const code of ["loan_linked", "pay_off"]) {
      const { api } = signedIn(() => json(409, { error: "not_deletable", code }));
      expect(await api.deleteExpense("e1")).toEqual({ ok: false, reason: "not_deletable", code });
    }
    for (const body of [{ error: "not_editable", code: "pay_off" }, null]) {
      const other = signedIn(() => json(409, body));
      expect(await other.api.deleteExpense("e1")).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(200, {}));
    expect(await wrong.api.deleteExpense("e1")).toEqual({ ok: false, reason: "server" });
  });

  it("maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      const { api } = signedIn(handler);
      expect(await api.deleteExpense("e1")).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.deleteExpense("e1")).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });
});

const PAY_OFF = {
  id: "po1",
  memberId: "m1",
  membershipId: "IO-001",
  method: "BANK_TRANSFER",
  total: "25000.05",
  lines: [
    { category: "Shares", amount: "20000.05" },
    { category: "Savings", amount: "5000.00" },
  ],
  expenseId: "e9",
  createdById: "u1",
  createdAt: "2026-10-23T09:00:00.000Z",
};

const NEW_PAY_OFF = {
  idempotencyKey: "key-0000000000000004",
  memberId: "m1",
  method: "BANK_TRANSFER" as const,
  total: "25000.05",
};

const SENT_PAY_OFF = { memberId: "m1", method: "BANK_TRANSFER", total: "25000.05" };

describe("createPayOff", () => {
  it("posts the pay-off with the key in the Idempotency-Key header, not in the body", async () => {
    const { api, calls, keys } = signedIn(() => json(201, { payOff: PAY_OFF }));
    expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: true, payOff: PAY_OFF, replayed: false });
    expect(calls).toEqual([{ path: "/api/payoffs", method: "POST", auth: "Bearer acc1", body: SENT_PAY_OFF }]);
    expect(keys).toEqual(["key-0000000000000004"]);
  });

  it("reads the Idempotent-Replayed header", async () => {
    const { api } = signedIn(() => replayed({ payOff: PAY_OFF }));
    expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: true, payOff: PAY_OFF, replayed: true });
  });

  it("on a 401 refreshes once and sends the same key and body again", async () => {
    const { api, calls, keys } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(201, { payOff: PAY_OFF }) : json(401, {});
    });
    expect(await api.createPayOff(NEW_PAY_OFF)).toMatchObject({ ok: true, replayed: false });
    expect(calls.map((c) => c.path)).toEqual(["/api/payoffs", "/api/auth/refresh", "/api/payoffs"]);
    expect(calls[2]?.body).toEqual(SENT_PAY_OFF);
    expect(keys[2]).toBe("key-0000000000000004");
  });

  it("passes each 409 reason on, and answers server for a 409 it does not know", async () => {
    for (const error of [
      "member_inactive",
      "active_loan",
      "nothing_to_pay_off",
      "payout_changed",
      "idempotency_conflict",
    ]) {
      const { api } = signedIn(() => json(409, { error }));
      expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason: error });
    }
    for (const body of [{ error: "loan_overpayment" }, { error: "toString" }, null, "x"]) {
      const { api } = signedIn(() => json(409, body));
      expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason: "server" });
    }
  });

  it("passes the code of a 400 on", async () => {
    const total = signedIn(() => json(400, { error: "invalid_input", code: "invalid_total" }));
    expect(await total.api.createPayOff(NEW_PAY_OFF)).toEqual({
      ok: false,
      reason: "invalid_input",
      code: "invalid_total",
    });
    for (const body of [{ error: "invalid_input", code: 3 }, { error: "invalid_input" }, null]) {
      const { api } = signedIn(() => json(400, body));
      expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason: "invalid_input" });
    }
  });

  it("maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 201 of the wrong shape and for a 200", async () => {
    const bad: unknown[] = [
      null,
      {},
      { payOff: null },
      { payOff: { ...PAY_OFF, total: 25000.05 } },
      { payOff: { ...PAY_OFF, total: "25000.5" } },
      { payOff: { ...PAY_OFF, method: "CHEQUE" } },
      { payOff: { ...PAY_OFF, lines: null } },
      { payOff: { ...PAY_OFF, lines: [{ category: "Shares", amount: "20000" }] } },
      { payOff: { ...PAY_OFF, lines: [{ amount: "20000.05" }] } },
      { payOff: { ...PAY_OFF, lines: ["Shares"] } },
      { payOff: { ...PAY_OFF, expenseId: undefined } },
      { payOff: { ...PAY_OFF, membershipId: 1 } },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(201, body));
      expect(await api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(200, { payOff: PAY_OFF }));
    expect(await wrong.api.createPayOff(NEW_PAY_OFF)).toEqual({ ok: false, reason: "server" });
  });
});

/** The member as POST /members/:id/reactivate sends it back: Active again. */
const REACTIVATED = { ...MEMBER, status: "ACTIVE" as const };

describe("reactivateMember", () => {
  it("posts to the member's reactivate path with no body and no key, the id made safe", async () => {
    const { api, calls, keys } = signedIn(() => json(200, { member: REACTIVATED }));
    expect(await api.reactivateMember("a/b?c")).toEqual({ ok: true, member: REACTIVATED });
    expect(calls).toEqual([
      { path: "/api/members/a%2Fb%3Fc/reactivate", method: "POST", auth: "Bearer acc1", body: null },
    ]);
    expect(keys).toEqual([null]);
  });

  it("on a 401 refreshes once and posts again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, { member: REACTIVATED }) : json(401, {});
    });
    expect(await api.reactivateMember("m1")).toEqual({ ok: true, member: REACTIVATED });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/members/m1/reactivate",
      "/api/auth/refresh",
      "/api/members/m1/reactivate",
    ]);
  });

  it("passes already_active on, and answers server for a 409 it does not know", async () => {
    const active = signedIn(() => json(409, { error: "already_active" }));
    expect(await active.api.reactivateMember("m1")).toEqual({ ok: false, reason: "already_active" });
    for (const body of [{ error: "member_inactive" }, { error: "toString" }, null, "x"]) {
      const { api } = signedIn(() => json(409, body));
      expect(await api.reactivateMember("m1")).toEqual({ ok: false, reason: "server" });
    }
  });

  it("maps 400, 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      expect(await api.reactivateMember("m1")).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.reactivateMember("m1")).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 200 of the wrong shape and for a 201", async () => {
    const bad: unknown[] = [
      null,
      {},
      { member: null },
      { member: { ...REACTIVATED, status: "GONE" } },
      { member: { ...REACTIVATED, fullName: 1 } },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.reactivateMember("m1")).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, { member: REACTIVATED }));
    expect(await wrong.api.reactivateMember("m1")).toEqual({ ok: false, reason: "server" });
  });
});

/** A staff account as GET /staff and POST /staff send it (fictional, D-08). */
const STAFF = {
  id: "s1",
  email: "staff.one@example.test",
  displayName: "Staff One",
  role: "STAFF",
  isActive: true,
  permissions: ["members.view", "payments.view"],
  createdAt: "2026-10-23T09:00:00.000Z",
};

const NEW_STAFF = {
  displayName: "Staff One",
  email: "staff.one@example.test",
  password: "a long password 1",
  permissions: ["members.view", "payments.view"],
};

describe("listStaff", () => {
  it("reads GET /staff with the access token", async () => {
    const off = { ...STAFF, id: "s2", isActive: false, permissions: [] };
    const { api, calls } = signedIn(() => json(200, { staff: [STAFF, off] }));
    expect(await api.listStaff()).toEqual({ ok: true, value: [STAFF, off] });
    expect(calls).toEqual([{ path: "/api/staff", method: "GET", auth: "Bearer acc1", body: null }]);
  });

  it("maps 403, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api } = signedIn(handler);
      expect(await api.listStaff()).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.listStaff()).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a list of the wrong shape", async () => {
    const bad: unknown[] = [
      null,
      {},
      { staff: null },
      { staff: [null] },
      { staff: [{ ...STAFF, isActive: "true" }] },
      { staff: [{ ...STAFF, permissions: "members.view" }] },
      { staff: [{ ...STAFF, permissions: [1] }] },
      { staff: [{ ...STAFF, email: undefined }] },
      { staff: [{ ...STAFF, displayName: 1 }] },
      { staff: [{ ...STAFF, role: null }] },
      { staff: [{ ...STAFF, createdAt: 0 }] },
      { staff: [STAFF, { ...STAFF, id: 2 }] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listStaff()).toEqual({ ok: false, reason: "server" });
    }
  });
});

describe("createStaff", () => {
  it("posts the body as given, with no key, and reads the account back", async () => {
    const { api, calls, keys } = signedIn(() => json(201, { staff: STAFF }));
    expect(await api.createStaff(NEW_STAFF)).toEqual({ ok: true, staff: STAFF });
    expect(calls).toEqual([{ path: "/api/staff", method: "POST", auth: "Bearer acc1", body: NEW_STAFF }]);
    expect(keys).toEqual([null]);
  });

  it("on a 401 refreshes once and posts again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(201, { staff: STAFF }) : json(401, {});
    });
    expect(await api.createStaff(NEW_STAFF)).toEqual({ ok: true, staff: STAFF });
    expect(calls.map((c) => c.path)).toEqual(["/api/staff", "/api/auth/refresh", "/api/staff"]);
  });

  it("passes email_taken on, and answers server for a 409 it does not know", async () => {
    const taken = signedIn(() => json(409, { error: "email_taken" }));
    expect(await taken.api.createStaff(NEW_STAFF)).toEqual({ ok: false, reason: "email_taken" });
    for (const body of [{ error: "already_active" }, { error: "toString" }, null, "x"]) {
      const { api } = signedIn(() => json(409, body));
      expect(await api.createStaff(NEW_STAFF)).toEqual({ ok: false, reason: "server" });
    }
  });

  it("maps 400, 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
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
      expect(await api.createStaff(NEW_STAFF)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.createStaff(NEW_STAFF)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 201 of the wrong shape and for a 200", async () => {
    const bad: unknown[] = [
      null,
      {},
      { staff: null },
      { staff: { ...STAFF, isActive: 1 } },
      { staff: { ...STAFF, permissions: null } },
      { staff: { ...STAFF, id: undefined } },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(201, body));
      expect(await api.createStaff(NEW_STAFF)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(200, { staff: STAFF }));
    expect(await wrong.api.createStaff(NEW_STAFF)).toEqual({ ok: false, reason: "server" });
  });
});

describe("setStaffPermissions", () => {
  const LIST = ["members.view", "payments.view"];

  it("puts the list to the account's path, with no key, and reads the account back", async () => {
    const { api, calls, keys } = signedIn(() => json(200, { staff: STAFF }));
    expect(await api.setStaffPermissions("s1", LIST)).toEqual({ ok: true, value: STAFF });
    expect(calls).toEqual([
      { path: "/api/staff/s1/permissions", method: "PUT", auth: "Bearer acc1", body: { permissions: LIST } },
    ]);
    expect(keys).toEqual([null]);
  });

  it("makes the id safe in the path and sends an empty list as one", async () => {
    const { api, calls } = signedIn(() => json(200, { staff: { ...STAFF, permissions: [] } }));
    await api.setStaffPermissions("a/b?c", []);
    expect(calls[0]?.path).toBe("/api/staff/a%2Fb%3Fc/permissions");
    expect(calls[0]?.body).toEqual({ permissions: [] });
  });

  it("on a 401 refreshes once and puts again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, { staff: STAFF }) : json(401, {});
    });
    expect(await api.setStaffPermissions("s1", LIST)).toEqual({ ok: true, value: STAFF });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/staff/s1/permissions",
      "/api/auth/refresh",
      "/api/staff/s1/permissions",
    ]);
  });

  it("maps 400, 403, 404, 409, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(404, { error: "not_found" }), "not_found"],
      [() => json(409, { error: "email_taken" }), "server"],
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
      expect(await api.setStaffPermissions("s1", LIST)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.setStaffPermissions("s1", LIST)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 200 of the wrong shape and for a 201", async () => {
    const bad: unknown[] = [
      null,
      {},
      { staff: null },
      { staff: { ...STAFF, isActive: 1 } },
      { staff: { ...STAFF, permissions: [null] } },
      { staff: { ...STAFF, createdAt: undefined } },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.setStaffPermissions("s1", LIST)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, { staff: STAFF }));
    expect(await wrong.api.setStaffPermissions("s1", LIST)).toEqual({ ok: false, reason: "server" });
  });
});

describe("deactivateStaff and reactivateStaff", () => {
  const OFF = { ...STAFF, isActive: false };

  it("posts to the account's path with no body and no key, and reads the account back", async () => {
    const { api, calls, keys } = signedIn((call) =>
      json(200, { staff: call.path.endsWith("/deactivate") ? OFF : STAFF }),
    );
    expect(await api.deactivateStaff("s1")).toEqual({ ok: true, value: OFF });
    expect(await api.reactivateStaff("s1")).toEqual({ ok: true, value: STAFF });
    expect(calls).toEqual([
      { path: "/api/staff/s1/deactivate", method: "POST", auth: "Bearer acc1", body: null },
      { path: "/api/staff/s1/reactivate", method: "POST", auth: "Bearer acc1", body: null },
    ]);
    expect(keys).toEqual([null, null]);
  });

  it("makes the id safe in the path", async () => {
    const { api, calls } = signedIn(() => json(200, { staff: STAFF }));
    await api.deactivateStaff("a/b?c");
    await api.reactivateStaff("a/b?c");
    expect(calls.map((c) => c.path)).toEqual(["/api/staff/a%2Fb%3Fc/deactivate", "/api/staff/a%2Fb%3Fc/reactivate"]);
  });

  it("on a 401 refreshes once and posts again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, { staff: OFF }) : json(401, {});
    });
    expect(await api.deactivateStaff("s1")).toEqual({ ok: true, value: OFF });
    expect(calls.map((c) => c.path)).toEqual(["/api/staff/s1/deactivate", "/api/auth/refresh", "/api/staff/s1/deactivate"]);
  });

  it("maps 400, 403, 404, 409, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(404, { error: "not_found" }), "not_found"],
      [() => json(409, { error: "already_active" }), "server"],
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
      expect(await api.deactivateStaff("s1")).toEqual({ ok: false, reason });
      expect(await api.reactivateStaff("s1")).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.deactivateStaff("s1")).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 200 of the wrong shape and for a 201", async () => {
    const bad: unknown[] = [null, {}, { staff: null }, { staff: { ...STAFF, isActive: "no" } }, { member: STAFF }];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.deactivateStaff("s1")).toEqual({ ok: false, reason: "server" });
      expect(await api.reactivateStaff("s1")).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, { staff: STAFF }));
    expect(await wrong.api.reactivateStaff("s1")).toEqual({ ok: false, reason: "server" });
  });
});

describe("resetStaffPassword", () => {
  const PASSWORD = " a new long password ";

  it("puts the password as typed to the account's path, with no key, and reads the account back", async () => {
    const { api, calls, keys } = signedIn(() => json(200, { staff: STAFF }));
    expect(await api.resetStaffPassword("s1", PASSWORD)).toEqual({ ok: true, value: STAFF });
    expect(calls).toEqual([
      { path: "/api/staff/s1/password", method: "PUT", auth: "Bearer acc1", body: { password: PASSWORD } },
    ]);
    expect(keys).toEqual([null]);
  });

  it("makes the id safe in the path", async () => {
    const { api, calls } = signedIn(() => json(200, { staff: STAFF }));
    await api.resetStaffPassword("a/b?c", PASSWORD);
    expect(calls[0]?.path).toBe("/api/staff/a%2Fb%3Fc/password");
  });

  it("on a 401 refreshes once and puts again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, { staff: STAFF }) : json(401, {});
    });
    expect(await api.resetStaffPassword("s1", PASSWORD)).toEqual({ ok: true, value: STAFF });
    expect(calls.map((c) => c.path)).toEqual(["/api/staff/s1/password", "/api/auth/refresh", "/api/staff/s1/password"]);
  });

  it("maps 400, 403, 404, 409, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(404, { error: "not_found" }), "not_found"],
      [() => json(409, { error: "email_taken" }), "server"],
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
      expect(await api.resetStaffPassword("s1", PASSWORD)).toEqual({ ok: false, reason });
      expect(keeper.refreshToken()).toBe("ref1");
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.resetStaffPassword("s1", PASSWORD)).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a 200 of the wrong shape and for a 201", async () => {
    const bad: unknown[] = [null, {}, { staff: null }, { staff: { ...STAFF, permissions: "all" } }];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.resetStaffPassword("s1", PASSWORD)).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, { staff: STAFF }));
    expect(await wrong.api.resetStaffPassword("s1", PASSWORD)).toEqual({ ok: false, reason: "server" });
  });
});

const ENTRY = {
  id: "a1",
  createdAt: "2026-10-23T09:00:00.000Z",
  actorId: "u1",
  action: "staff.created",
  entityType: "User",
  entityId: "s1",
  detail: "permissions=2",
};

const PAGE = { entries: [ENTRY], limit: 50, offset: 0, hasMore: false };

describe("listAudit", () => {
  it("reads GET /audit with the page and no filters", async () => {
    const quiet = { ...ENTRY, id: "a2", actorId: null, entityId: null, detail: null };
    const page = { ...PAGE, entries: [ENTRY, quiet], hasMore: true };
    const { api, calls } = signedIn(() => json(200, page));
    expect(await api.listAudit({ limit: 50, offset: 0 })).toEqual({ ok: true, value: page });
    expect(calls).toEqual([{ path: "/api/audit?limit=50&offset=0", method: "GET", auth: "Bearer acc1", body: null }]);
  });

  it("sends the actor and action filters in a fixed order, each value made safe", async () => {
    const { api, calls } = signedIn(() => json(200, PAGE));
    await api.listAudit({ action: "login success", actorId: "a/b?c", limit: 20, offset: 40 });
    expect(calls[0]?.path).toBe("/api/audit?actorId=a%2Fb%3Fc&action=login%20success&limit=20&offset=40");
  });

  it("on a 401 refreshes once and reads again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, PAGE) : json(401, {});
    });
    expect(await api.listAudit({ limit: 50, offset: 0 })).toEqual({ ok: true, value: PAGE });
    expect(calls.map((c) => c.path)).toEqual(["/api/audit?limit=50&offset=0", "/api/auth/refresh", "/api/audit?limit=50&offset=0"]);
  });

  it("maps 400, 403, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api } = signedIn(handler);
      expect(await api.listAudit({ limit: 50, offset: 0 })).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.listAudit({ limit: 50, offset: 0 })).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a page of the wrong shape and for a 201", async () => {
    const bad: unknown[] = [
      null,
      [],
      {},
      { ...PAGE, entries: null },
      { ...PAGE, entries: "" },
      { ...PAGE, entries: [null] },
      { ...PAGE, entries: [ENTRY, { ...ENTRY, id: 2 }] },
      { ...PAGE, entries: [{ ...ENTRY, createdAt: undefined }] },
      { ...PAGE, entries: [{ ...ENTRY, action: null }] },
      { ...PAGE, entries: [{ ...ENTRY, entityType: 1 }] },
      { ...PAGE, entries: [{ ...ENTRY, actorId: 1 }] },
      { ...PAGE, entries: [{ ...ENTRY, entityId: undefined }] },
      { ...PAGE, entries: [{ ...ENTRY, detail: {} }] },
      { ...PAGE, limit: "50" },
      { ...PAGE, limit: 0 },
      { ...PAGE, limit: 1.5 },
      { ...PAGE, offset: -1 },
      { ...PAGE, offset: undefined },
      { ...PAGE, hasMore: "false" },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.listAudit({ limit: 50, offset: 0 })).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, PAGE));
    expect(await wrong.api.listAudit({ limit: 50, offset: 0 })).toEqual({ ok: false, reason: "server" });
  });
});

const DASHBOARD = {
  month: "2026-10",
  fromDay: "2026-10-01",
  toDay: "2026-10-31",
  income: { month: "40000.00", allTime: "125000.50" },
  expenditure: { month: "15000.50", allTime: "15000.50" },
  membershipWithdrawal: { month: "0.00", allTime: "20000.00" },
  totalOutflow: { month: "15000.50", allTime: "335000.50" },
  outstandingLoans: "300000.00",
  activeMembers: 3,
  recentExpenses: [EXPENSE],
};

describe("getDashboard", () => {
  it("reads GET /dashboard with no query when month and staff are left out", async () => {
    const { api, calls } = signedIn(() => json(200, DASHBOARD));
    expect(await api.getDashboard({})).toEqual({ ok: true, value: DASHBOARD });
    expect(calls).toEqual([{ path: "/api/dashboard", method: "GET", auth: "Bearer acc1", body: null }]);
  });

  it("sends month and createdById in a fixed order, each value made safe", async () => {
    const { api, calls } = signedIn(() => json(200, DASHBOARD));
    await api.getDashboard({ createdById: "a/b?c&d", month: "2026-10" });
    await api.getDashboard({ month: "2026-02" });
    await api.getDashboard({ createdById: "s1" });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/dashboard?month=2026-10&createdById=a%2Fb%3Fc%26d",
      "/api/dashboard?month=2026-02",
      "/api/dashboard?createdById=s1",
    ]);
  });

  it("keeps an empty month of recent expenses and zero members", async () => {
    const empty = { ...DASHBOARD, activeMembers: 0, recentExpenses: [] };
    const { api } = signedIn(() => json(200, empty));
    expect(await api.getDashboard({})).toEqual({ ok: true, value: empty });
  });

  it("on a 401 refreshes once and reads again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, DASHBOARD) : json(401, {});
    });
    expect(await api.getDashboard({})).toEqual({ ok: true, value: DASHBOARD });
    expect(calls.map((c) => c.path)).toEqual(["/api/dashboard", "/api/auth/refresh", "/api/dashboard"]);
  });

  it("maps 400, 403, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input", code: "invalid_month" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api } = signedIn(handler);
      expect(await api.getDashboard({})).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.getDashboard({})).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a reply of the wrong shape, amounts that are not naira strings, and a 201", async () => {
    const bad: unknown[] = [
      null,
      [],
      {},
      { dashboard: DASHBOARD },
      { ...DASHBOARD, month: undefined },
      { ...DASHBOARD, month: "2026-10-01" },
      { ...DASHBOARD, month: 202610 },
      { ...DASHBOARD, fromDay: "01-10-2026" },
      { ...DASHBOARD, toDay: undefined },
      { ...DASHBOARD, toDay: "31-10-2026" },
      { ...DASHBOARD, income: null },
      { ...DASHBOARD, income: { month: "40000.00" } },
      { ...DASHBOARD, income: { month: 40000, allTime: "125000.50" } },
      { ...DASHBOARD, expenditure: { month: "15000.5", allTime: "15000.50" } },
      { ...DASHBOARD, expenditure: undefined },
      { ...DASHBOARD, membershipWithdrawal: { month: "0.00", allTime: "-20000.00" } },
      { ...DASHBOARD, membershipWithdrawal: "0.00" },
      { ...DASHBOARD, totalOutflow: undefined },
      { ...DASHBOARD, totalOutflow: { month: "15000.50" } },
      { ...DASHBOARD, totalOutflow: { month: "15000.50", allTime: 335000.5 } },
      { ...DASHBOARD, totalOutflow: { month: "-15000.50", allTime: "335000.50" } },
      { ...DASHBOARD, outstandingLoans: "300,000.00" },
      { ...DASHBOARD, outstandingLoans: 300000 },
      { ...DASHBOARD, activeMembers: "3" },
      { ...DASHBOARD, activeMembers: -1 },
      { ...DASHBOARD, activeMembers: 1.5 },
      { ...DASHBOARD, activeMembers: undefined },
      { ...DASHBOARD, recentExpenses: null },
      { ...DASHBOARD, recentExpenses: [EXPENSE, null] },
      { ...DASHBOARD, recentExpenses: [{ ...EXPENSE, amount: "15000.5" }] },
      { ...DASHBOARD, recentExpenses: [{ ...EXPENSE, method: "CHEQUE" }] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.getDashboard({})).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, DASHBOARD));
    expect(await wrong.api.getDashboard({})).toEqual({ ok: false, reason: "server" });
  });
});

const REPORT = {
  fromDay: "2026-10-01",
  toDay: "2026-10-31",
  categories: [
    { category: "Shares", refundable: true, paid: "12000.00", paidOut: "5000.00" },
    { category: "Development Levy", refundable: false, paid: "1000.50", paidOut: "0.00" },
  ],
  totalPaid: "13000.50",
  totalPaidOut: "5000.00",
};

describe("getCategoryReport", () => {
  it("reads GET /reports/categories with no query when days and staff are left out", async () => {
    const { api, calls } = signedIn(() => json(200, REPORT));
    expect(await api.getCategoryReport({})).toEqual({ ok: true, value: REPORT });
    expect(calls).toEqual([{ path: "/api/reports/categories", method: "GET", auth: "Bearer acc1", body: null }]);
  });

  it("sends fromDay, toDay and createdById in a fixed order, each value made safe", async () => {
    const { api, calls } = signedIn(() => json(200, REPORT));
    await api.getCategoryReport({ createdById: "a/b?c&d", toDay: "2026-10-31", fromDay: "2026-10-01" });
    await api.getCategoryReport({ toDay: "2026-10-31" });
    await api.getCategoryReport({ fromDay: "2026-10-01" });
    await api.getCategoryReport({ createdById: "s1" });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/reports/categories?fromDay=2026-10-01&toDay=2026-10-31&createdById=a%2Fb%3Fc%26d",
      "/api/reports/categories?toDay=2026-10-31",
      "/api/reports/categories?fromDay=2026-10-01",
      "/api/reports/categories?createdById=s1",
    ]);
  });

  it("keeps null days (no bound) and an empty category list", async () => {
    const open = { ...REPORT, fromDay: null, toDay: null };
    const empty = { ...REPORT, categories: [], totalPaid: "0.00", totalPaidOut: "0.00" };
    const first = signedIn(() => json(200, open));
    expect(await first.api.getCategoryReport({})).toEqual({ ok: true, value: open });
    const second = signedIn(() => json(200, empty));
    expect(await second.api.getCategoryReport({})).toEqual({ ok: true, value: empty });
  });

  it("on a 401 refreshes once and reads again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? json(200, REPORT) : json(401, {});
    });
    expect(await api.getCategoryReport({})).toEqual({ ok: true, value: REPORT });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/reports/categories",
      "/api/auth/refresh",
      "/api/reports/categories",
    ]);
  });

  it("maps 400, 403, 500, a network failure and a lost session", async () => {
    const cases: [Handler, string][] = [
      [() => json(400, { error: "invalid_input", code: "invalid_range" }), "invalid_input"],
      [() => json(403, { error: "forbidden" }), "forbidden"],
      [() => json(500, { error: "server_error" }), "server"],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        "network",
      ],
    ];
    for (const [handler, reason] of cases) {
      const { api } = signedIn(handler);
      expect(await api.getCategoryReport({})).toEqual({ ok: false, reason });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.getCategoryReport({})).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers server for a reply of the wrong shape, amounts that are not naira strings, and a 201", async () => {
    const ROW = REPORT.categories[0];
    const bad: unknown[] = [
      null,
      [],
      {},
      { report: REPORT },
      { ...REPORT, fromDay: undefined },
      { ...REPORT, fromDay: "01-10-2026" },
      { ...REPORT, toDay: 20261031 },
      { ...REPORT, toDay: "" },
      { ...REPORT, totalPaid: "13000.5" },
      { ...REPORT, totalPaid: undefined },
      { ...REPORT, totalPaidOut: "-5000.00" },
      { ...REPORT, totalPaidOut: 5000 },
      { ...REPORT, categories: null },
      { ...REPORT, categories: {} },
      { ...REPORT, categories: [ROW, null] },
      { ...REPORT, categories: [{ ...ROW, category: 1 }] },
      { ...REPORT, categories: [{ ...ROW, refundable: "true" }] },
      { ...REPORT, categories: [{ ...ROW, paid: "12,000.00" }] },
      { ...REPORT, categories: [{ ...ROW, paid: undefined }] },
      { ...REPORT, categories: [{ ...ROW, paidOut: 5000 }] },
      { ...REPORT, categories: [{ ...ROW, paidOut: "5000" }] },
    ];
    for (const body of bad) {
      const { api } = signedIn(() => json(200, body));
      expect(await api.getCategoryReport({})).toEqual({ ok: false, reason: "server" });
    }
    const wrong = signedIn(() => json(201, REPORT));
    expect(await wrong.api.getCategoryReport({})).toEqual({ ok: false, reason: "server" });
  });
});

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xlsx(body: string, disposition: string | null, type: string = XLSX): Response {
  const headers: Record<string, string> = { "Content-Type": type };
  if (disposition !== null) headers["Content-Disposition"] = disposition;
  return new Response(body, { status: 200, headers });
}

describe("downloadExport", () => {
  it("reads GET /exports/:kind with no query and gives the file and its name", async () => {
    const { api, calls } = signedIn(() => xlsx("PK-file", 'attachment; filename="members-2026-10-24.xlsx"'));
    const result = await api.downloadExport("members", {});
    if (!result.ok) throw new Error("expected a file");
    expect(result.value.fileName).toBe("members-2026-10-24.xlsx");
    expect(result.value.blob.type).toBe(XLSX);
    expect(await result.value.blob.text()).toBe("PK-file");
    expect(calls).toEqual([{ path: "/api/exports/members", method: "GET", auth: "Bearer acc1", body: null }]);
  });

  it("sends fromDay, toDay, category and createdById in a fixed order, each value made safe", async () => {
    const { api, calls } = signedIn(() => xlsx("PK", null));
    await api.downloadExport("category", {
      createdById: "a/b?c&d",
      category: "Building Levy & More",
      toDay: "2026-10-31",
      fromDay: "2026-10-01",
    });
    await api.downloadExport("transactions", { toDay: "2026-10-31" });
    await api.downloadExport("expenses", { fromDay: "2026-10-01" });
    await api.downloadExport("cashflow", { createdById: "s1" });
    await api.downloadExport("category", { category: "Loan" });
    expect(calls.map((c) => c.path)).toEqual([
      "/api/exports/category?fromDay=2026-10-01&toDay=2026-10-31&category=Building%20Levy%20%26%20More&createdById=a%2Fb%3Fc%26d",
      "/api/exports/transactions?toDay=2026-10-31",
      "/api/exports/expenses?fromDay=2026-10-01",
      "/api/exports/cashflow?createdById=s1",
      "/api/exports/category?category=Loan",
    ]);
  });

  it("accepts the content type with parameters or in another case", async () => {
    for (const type of [`${XLSX}; charset=utf-8`, `${XLSX} ; charset=utf-8`, XLSX.toUpperCase()]) {
      const { api } = signedIn(() => xlsx("PK", null, type));
      expect((await api.downloadExport("members", {})).ok).toBe(true);
    }
  });

  it("names the file <kind>.xlsx when the header is missing or the name is not safe", async () => {
    const headers: (string | null)[] = [
      null,
      "attachment",
      'attachment; filename=""',
      'attachment; filename="../members.xlsx"',
      'attachment; filename="a/b.xlsx"',
      'attachment; filename="members.exe"',
      'attachment; filename="members.xlsx.exe"',
      'attachment; filename=".members.xlsx"',
      'attachment; filename=".xlsx"',
      'attachment; filename="members 2026.xlsx"',
      "attachment; filename=members.xlsx",
    ];
    for (const header of headers) {
      const { api } = signedIn(() => xlsx("PK", header));
      const result = await api.downloadExport("cashflow", {});
      expect(result.ok && result.value.fileName).toBe("cashflow.xlsx");
    }
  });

  it("on a 401 refreshes once and reads again", async () => {
    const { api, calls } = signedIn((call) => {
      if (call.path === "/api/auth/refresh") return json(200, { ...tokens(2), userId: "u1" });
      return call.auth === "Bearer acc2" ? xlsx("PK", null) : json(401, {});
    });
    expect((await api.downloadExport("expenses", {})).ok).toBe(true);
    expect(calls.map((c) => c.path)).toEqual(["/api/exports/expenses", "/api/auth/refresh", "/api/exports/expenses"]);
  });

  it("passes on the 400 code, and maps 403, 404, 500, a network failure and a lost session", async () => {
    const cases: [Handler, object][] = [
      [() => json(400, { error: "invalid_input", code: "invalid_range" }), { reason: "invalid_input", code: "invalid_range" }],
      [() => json(400, { error: "invalid_input", code: "invalid_category" }), { reason: "invalid_input", code: "invalid_category" }],
      [() => json(400, { error: "invalid_input" }), { reason: "invalid_input" }],
      [() => json(400, { error: "invalid_input", code: 7 }), { reason: "invalid_input" }],
      [() => new Response("not json", { status: 400 }), { reason: "invalid_input" }],
      [() => json(403, { error: "forbidden" }), { reason: "forbidden" }],
      [() => json(404, { error: "not_found" }), { reason: "not_found" }],
      [() => json(500, { error: "server_error" }), { reason: "server" }],
      [
        () => {
          throw new TypeError("Failed to fetch");
        },
        { reason: "network" },
      ],
    ];
    for (const [handler, failure] of cases) {
      const { api } = signedIn(handler);
      expect(await api.downloadExport("transactions", {})).toEqual({ ok: false, ...failure });
    }
    const gone = setup(() => json(401, { error: "invalid_token" }));
    expect(await gone.api.downloadExport("members", {})).toEqual({ ok: false, reason: "signed_out" });
    expect(gone.signedOutCount()).toBe(1);
  });

  it("answers network when the body of a 200 .xlsx reply cannot be read (A-257)", async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.error(new TypeError("connection lost"));
      },
    });
    const { api } = signedIn(() => new Response(broken, { status: 200, headers: { "Content-Type": XLSX } }));
    expect(await api.downloadExport("members", {})).toEqual({ ok: false, reason: "network" });
  });

  it("answers server for a 200 that is not an .xlsx file, an empty file, and a 201", async () => {
    const replies: Response[] = [
      json(200, { ok: true }),
      new Response("PK", { status: 200 }),
      xlsx("PK", null, "text/html"),
      xlsx("", null),
      new Response("PK", { status: 201, headers: { "Content-Type": XLSX } }),
    ];
    for (const reply of replies) {
      const { api } = signedIn(() => reply);
      expect(await api.downloadExport("members", {})).toEqual({ ok: false, reason: "server" });
    }
  });
});
