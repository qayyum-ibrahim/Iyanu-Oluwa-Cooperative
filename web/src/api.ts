// API client for the auth routes (server/src/auth-routes.ts). Tokens travel in the JSON body
// and the Authorization header, never in the URL. Never log a body, a token or a password.
// A 401 on a signed-in call triggers one refresh and one retry; a refused refresh signs out.

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

/** "rejected": the server refused the refresh token. "failed": no answer or an odd answer. */
type RefreshOutcome = "ok" | "rejected" | "failed";

export interface ApiDeps {
  fetch: typeof fetch;
  keeper: SessionKeeper;
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

const JSON_HEADERS = { "Content-Type": "application/json" };

export function createApi(deps: ApiDeps): Api {
  const base = deps.base ?? API_PREFIX;
  const { keeper } = deps;
  let refreshing: Promise<RefreshOutcome> | null = null;

  function post(path: string, body: unknown): Promise<Response> {
    return deps.fetch(base + path, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  }

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

  // One refresh at a time: the server rotates the refresh token, so a second refresh with
  // the old token would be refused.
  function refresh(): Promise<RefreshOutcome> {
    refreshing ??= doRefresh().finally(() => {
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
  };
}
