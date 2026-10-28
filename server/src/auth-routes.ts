// Sign-in, refresh, sign-out and "who am I" routes (D-31, D-33). Thin: all rules live in
// auth.ts, sessions.ts and guards.ts. Tokens travel in the JSON body (no cookies).
// Never log a body, a token or a password.

import { Router, type Request } from "express";
import { changeOwnPassword } from "./account.js";
import { authenticate } from "./auth.js";
import { getAuth, requireAuth, sendUnauthorized } from "./guards.js";
import { ALL_PERMISSIONS, hasPermission } from "./permissions.js";
import { LOGIN_LIMIT_MAX, LOGIN_LIMIT_WINDOW_SECONDS, createRateLimiter } from "./rate-limit.js";
import { SessionError, issueSession, refreshSession, signOut, type Session } from "./sessions.js";
import type { Store } from "./store.js";

export interface AuthRouteDeps {
  store: Store;
  tokenSecret: string;
  now: () => Date;
}

/** The JSON body as a plain object. Anything else (missing, text, array) counts as empty. */
function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function sessionJson(session: Session) {
  return {
    accessToken: session.accessToken,
    accessExpiresAt: session.accessExpiresAt.toISOString(),
    refreshToken: session.refreshToken,
    refreshExpiresAt: session.refreshExpiresAt.toISOString(),
  };
}

/** Every sign-in failure looks the same (D-26). */
const INVALID_CREDENTIALS = { error: "invalid_credentials" };
const INVALID_TOKEN = { error: "invalid_token" };
const TOO_MANY_REQUESTS = { error: "too_many_requests" };

export function createAuthRouter(deps: AuthRouteDeps): Router {
  const router = Router();
  // One counter per router, so each app (and each test app) starts with its own (A-42, A-284).
  const loginLimiter = createRateLimiter(LOGIN_LIMIT_MAX, LOGIN_LIMIT_WINDOW_SECONDS);

  router.post("/login", async (req, res) => {
    const now = deps.now();
    // The socket address, not X-Forwarded-For: no "trust proxy" until hosting is known (OQ-01).
    const limit = loginLimiter.hit(req.socket.remoteAddress ?? "unknown", now);
    if (!limit.ok) {
      res.set("Retry-After", String(limit.retryAfterSeconds));
      res.status(429).json(TOO_MANY_REQUESTS);
      return;
    }
    const body = bodyOf(req);
    const result = await authenticate(deps.store, body["email"], body["password"], now);
    if (!result.ok) {
      res.status(401).json(INVALID_CREDENTIALS);
      return;
    }
    try {
      const session = await issueSession(deps.store, deps.tokenSecret, result.user.id, now);
      res.status(200).json({ ...sessionJson(session), user: result.user });
    } catch (error) {
      if (error instanceof SessionError) {
        res.status(401).json(INVALID_CREDENTIALS);
        return;
      }
      throw error;
    }
  });

  router.post("/refresh", async (req, res) => {
    const body = bodyOf(req);
    const result = await refreshSession(
      deps.store,
      deps.tokenSecret,
      body["refreshToken"],
      deps.now(),
    );
    if (!result.ok) {
      res.status(401).json(INVALID_TOKEN);
      return;
    }
    res.status(200).json({ ...sessionJson(result.session), userId: result.session.userId });
  });

  // Always 204: the reply must not tell a caller whether a token was real.
  router.post("/logout", async (req, res) => {
    const body = bodyOf(req);
    await signOut(deps.store, body["refreshToken"], deps.now());
    res.status(204).end();
  });

  // Change your own password (D-36). 204 on success; the caller must sign in again.
  router.post("/password", requireAuth(deps), async (req, res) => {
    const auth = getAuth(res);
    if (auth === null) {
      sendUnauthorized(res);
      return;
    }
    const body = bodyOf(req);
    const result = await changeOwnPassword(
      deps.store,
      auth.user.id,
      body["currentPassword"],
      body["newPassword"],
      deps.now(),
    );
    if (!result.ok) {
      res.status(result.reason === "wrong_password" ? 403 : 400).json({ error: result.reason });
      return;
    }
    res.status(204).end();
  });

  // Who am I? The user (never the hash) and the permissions held right now.
  router.get("/me", requireAuth(deps), (_req, res) => {
    const auth = getAuth(res);
    if (auth === null) {
      sendUnauthorized(res);
      return;
    }
    res.status(200).json({
      user: auth.user,
      permissions: ALL_PERMISSIONS.filter((permission) => hasPermission(auth.subject, permission)),
    });
  });

  return router;
}