// API client for the auth routes (server/src/auth-routes.ts) and the member routes
// (server/src/members-routes.ts, U.3d). Tokens travel in the JSON body
// and the Authorization header, never in the URL. Never log a body, a token or a password.
// A 401 on a signed-in call triggers one refresh and one retry; a refused refresh signs out.
// Amounts arrive as naira strings (A-18) and are kept as strings; the browser does no money sums.

import { API_PREFIX } from "./api-proxy.ts";
import type { SessionKeeper } from "./session.ts";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface Me {
  user: User;
  permissions: string[];
}

export type LoginResult =
  | { ok: true; me: Me }
  | { ok: false; reason: "invalid_credentials" | "network" | "server" };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong_password" | "invalid_input" | "signed_out" | "network" | "server" };

/** A member as GET /members and GET /members/:id send it (MemberView in server/src/members.ts). */
export interface Member {
  id: string;
  membershipId: string;
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
  status: "ACTIVE" | "INACTIVE";
  createdById: string;
  createdAt: string;
}

export interface NewMember {
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
}

/** GET /members/:id/balances (D-86). Amounts are naira strings such as "25000.05". */
export interface MemberBalances {
  memberId: string;
  categories: { category: string; balance: string; refundable: boolean }[];
  refundableTotal: string;
  nonRefundableTotal: string;
}

export type MemberStatusFilter = "active" | "inactive" | "all";

/** "signed_out": the session is gone (onSignedOut was called). "server": any other answer. */
export type CallFailure =
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "signed_out"
  | "network"
  | "server";

export type CallResult<T> = { ok: true; value: T } | { ok: false; reason: CallFailure };

/** "rejected": the server refused the refresh token. "failed": no answer or an odd answer. */
type RefreshOutcome = "ok" | "rejected" | "failed";

export type RefreshLock = <T>(run: () => Promise<T>) => Promise<T>;

export const REFRESH_LOCK_NAME = "iyanu.refresh";

/** The part of the LockManager interface we use, so tests can pass a fake. */
export interface LockRequester {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * A Web Lock shared by every tab of this origin. The refresh token is shared through
 * localStorage and the server revokes the whole session when a used token comes back, so two
 * tabs must never refresh at once. Without Web Locks (no secure context) the refresh runs at once.
 */
export function browserRefreshLock(
  locks: LockRequester | undefined = globalThis.navigator?.locks,
): RefreshLock {
  if (locks === undefined) return (run) => run();
  return (run) => locks.request(REFRESH_LOCK_NAME, run);
}

export interface ApiDeps {
  fetch: typeof fetch;
  keeper: SessionKeeper;
  /** Runs a refresh so that no other tab refreshes at the same time. Default: runs it now. */
  lock?: RefreshLock;
  /** Called when a signed-in call finds the session gone (refresh refused). */
  onSignedOut?: () => void;
  base?: string;
}

export interface Api {
  login(email: string, password: string): Promise<LoginResult>;
  /** Signs in again from the stored refresh token, if any. Null if there is no session. */
  restore(): Promise<Me | null>;
  me(): Promise<Me | null>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult>;
  listMembers(status: MemberStatusFilter): Promise<CallResult<Member[]>>;
  getMember(id: string): Promise<CallResult<Member>>;
  createMember(input: NewMember): Promise<CallResult<Member>>;
  memberBalances(id: string): Promise<CallResult<MemberBalances>>;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tokensOf(body: unknown): { accessToken: string; refreshToken: string } | null {
  if (!isObject(body)) return null;
  const { accessToken, refreshToken } = body;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return null;
  return { accessToken, refreshToken };
}

function meOf(body: unknown): Me | null {
  if (!isObject(body) || !isObject(body["user"]) || !Array.isArray(body["permissions"])) {
    return null;
  }
  const user = body["user"];
  const { id, email, displayName, role } = user;
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof displayName !== "string" ||
    typeof role !== "string"
  ) {
    return null;
  }
  const permissions = body["permissions"].filter((p): p is string => typeof p === "string");
  return { user: { id, email, displayName, role }, permissions };
}

const MEMBER_TEXT_FIELDS = [
  "id",
  "membershipId",
  "fullName",
  "phone",
  "address",
  "occupation",
  "createdById",
  "createdAt",
] as const;

function memberOf(value: unknown): Member | null {
  if (!isObject(value)) return null;
  for (const field of MEMBER_TEXT_FIELDS) {
    if (typeof value[field] !== "string") return null;
  }
  const status = value["status"];
  if (status !== "ACTIVE" && status !== "INACTIVE") return null;
  const v = value as Record<(typeof MEMBER_TEXT_FIELDS)[number], string>;
  return {
    id: v.id,
    membershipId: v.membershipId,
    fullName: v.fullName,
    phone: v.phone,
    address: v.address,
    occupation: v.occupation,
    status,
    createdById: v.createdById,
    createdAt: v.createdAt,
  };
}

/** Naira as koboToNairaString (server/src/payments.ts) writes it: never negative, two decimals. */
const NAIRA = /^\d+\.\d{2}$/;

function balancesOf(value: unknown): MemberBalances | null {
  if (!isObject(value) || !Array.isArray(value["categories"])) return null;
  const { memberId, refundableTotal, nonRefundableTotal } = value;
  if (
    typeof memberId !== "string" ||
    typeof refundableTotal !== "string" ||
    typeof nonRefundableTotal !== "string" ||
    !NAIRA.test(refundableTotal) ||
    !NAIRA.test(nonRefundableTotal)
  ) {
    return null;
  }
  const categories: MemberBalances["categories"] = [];
  for (const row of value["categories"]) {
    if (!isObject(row)) return null;
    const { category, balance, refundable } = row;
    if (
      typeof category !== "string" ||
      typeof balance !== "string" ||
      !NAIRA.test(balance) ||
      typeof refundable !== "boolean"
    ) {
      return null;
    }
    categories.push({ category, balance, refundable });
  }
  return { memberId, categories, refundableTotal, nonRefundableTotal };
}

function failureOf(status: number): CallFailure {
  if (status === 403) return "forbidden";
  if (status === 400) return "invalid_input";
  if (status === 404) return "not_found";
  return "server";
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function createApi(deps: ApiDeps): Api {
  const base = deps.base ?? API_PREFIX;
  const { keeper } = deps;
  const lock = deps.lock ?? ((run) => run());
  let refreshing: Promise<RefreshOutcome> | null = null;

  function post(path: string, body: unknown): Promise<Response> {
    return deps.fetch(base + path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  }

  // Runs under the lock, so the stored token is read after any other tab has rotated it.
  async function doRefresh(): Promise<RefreshOutcome> {
    const refreshToken = keeper.refreshToken();
    if (refreshToken === null) return "rejected";
    let response: Response;
    try {
      response = await post("/refresh", { refreshToken });
    } catch {
      return "failed";
    }
    if (response.status === 401) {
      keeper.clear();
      return "rejected";
    }
    if (response.status !== 200) return "failed";
    const tokens = tokensOf(await readJson(response));
    if (tokens === null) return "failed";
    keeper.save(tokens);
    return "ok";
  }

  // One refresh at a time, in this tab and across tabs: the server rotates the refresh token,
  // so a second refresh with the old token would be read as reuse and end the session.
  function refresh(): Promise<RefreshOutcome> {
    refreshing ??= lock(doRefresh)
      .catch((): RefreshOutcome => "failed")
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  function signedOut(): void {
    keeper.clear();
    deps.onSignedOut?.();
  }

  /** A signed-in call. Null means the session is gone (onSignedOut was called). */
  async function authed(path: string, init: RequestInit = {}): Promise<Response | null> {
    const send = (token: string) =>
      deps.fetch(base + path, {
        ...init,
        headers: { ...JSON_HEADERS, ...init.headers, Authorization: `Bearer ${token}` },
      });

    let token = keeper.accessToken();
    if (token === null) {
      const outcome = await refresh();
      if (outcome === "rejected") {
        signedOut();
        return null;
      }
      token = keeper.accessToken();
      if (outcome !== "ok" || token === null) throw new Error("refresh_failed");
    }
    const first = await send(token);
    if (first.status !== 401) return first;

    const outcome = await refresh();
    if (outcome === "rejected") {
      signedOut();
      return null;
    }
    const next = keeper.accessToken();
    if (outcome !== "ok" || next === null) throw new Error("refresh_failed");
    const second = await send(next);
    if (second.status === 401) {
      signedOut();
      return null;
    }
    return second;
  }

  async function me(): Promise<Me | null> {
    const response = await authed("/me");
    if (response === null || response.status !== 200) return null;
    return meOf(await readJson(response));
  }

  /**
   * A signed-in call whose reply is read by `read` from the body's `key` field.
   * `expected` is the success status; any other status maps through failureOf.
   */
  async function call<T>(
    path: string,
    init: RequestInit,
    expected: number,
    key: string,
    read: (value: unknown) => T | null,
  ): Promise<CallResult<T>> {
    let response: Response | null;
    try {
      response = await authed(path, init);
    } catch {
      return { ok: false, reason: "network" };
    }
    if (response === null) return { ok: false, reason: "signed_out" };
    if (response.status !== expected) return { ok: false, reason: failureOf(response.status) };
    const body = await readJson(response);
    const value = isObject(body) ? read(body[key]) : null;
    if (value === null) return { ok: false, reason: "server" };
    return { ok: true, value };
  }

  const memberPath = (id: string) => `/members/${encodeURIComponent(id)}`;

  return {
    async login(email, password) {
      let response: Response;
      try {
        response = await post("/login", { email, password });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response.status === 401) return { ok: false, reason: "invalid_credentials" };
      if (response.status !== 200) return { ok: false, reason: "server" };
      const tokens = tokensOf(await readJson(response));
      if (tokens === null) return { ok: false, reason: "server" };
      keeper.save(tokens);
      try {
        const who = await me();
        if (who !== null) return { ok: true, me: who };
      } catch {
        // Fall through: treat as a server fault.
      }
      keeper.clear();
      return { ok: false, reason: "server" };
    },

    async restore() {
      if (keeper.refreshToken() === null) return null;
      const outcome = await refresh();
      if (outcome !== "ok") return null;
      try {
        return await me();
      } catch {
        return null;
      }
    },

    me,

    async logout() {
      const refreshToken = keeper.refreshToken();
      keeper.clear();
      if (refreshToken === null) return;
      try {
        await post("/logout", { refreshToken });
      } catch {
        // Signed out here anyway; the server token expires on its own.
      }
    },

    async changePassword(currentPassword, newPassword) {
      let response: Response | null;
      try {
        response = await authed("/password", {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response === null) return { ok: false, reason: "signed_out" };
      if (response.status === 204) {
        // The server revoked every refresh token (D-36): sign in again.
        keeper.clear();
        return { ok: true };
      }
      if (response.status === 403) return { ok: false, reason: "wrong_password" };
      if (response.status === 400) return { ok: false, reason: "invalid_input" };
      return { ok: false, reason: "server" };
    },

    listMembers(status) {
      return call(`/members?status=${status}`, {}, 200, "members", (value) => {
        if (!Array.isArray(value)) return null;
        const members = value.map(memberOf);
        return members.every((m) => m !== null) ? (members as Member[]) : null;
      });
    },

    getMember(id) {
      return call(memberPath(id), {}, 200, "member", memberOf);
    },

    createMember(input) {
      return call(
        "/members",
        { method: "POST", body: JSON.stringify(input) },
        201,
        "member",
        memberOf,
      );
    },

    memberBalances(id) {
      return call(`${memberPath(id)}/balances`, {}, 200, "balances", balancesOf);
    },
  };
}
