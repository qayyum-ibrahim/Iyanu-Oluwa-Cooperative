// Sign-in, refresh and sign-out routes (D-31). Thin: all rules live in auth.ts and sessions.ts.
// Tokens travel in the JSON body (no cookies). Never log a body, a token or a password.

import { Router, type Request } from "express";
import { authenticate } from "./auth.js";
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

export function createAuthRouter(deps: AuthRouteDeps): Router {
  const router = Router();

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/login", async (req, res) => {
    const body = bodyOf(req);
    const now = deps.now();
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

  return router;
}