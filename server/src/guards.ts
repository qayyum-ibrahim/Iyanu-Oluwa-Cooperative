// Route guards (D-04, D-05, D-33, D-34). Deny by default.
// requireAuth: who is calling? requirePermission: may they do this?
// Never log a token or a header. Every refusal looks the same to the caller.

import type { Request, RequestHandler, Response } from "express";
import type { AuthenticatedUser } from "./auth.js";
import { hasPermission, type Permission, type PermissionSubject } from "./permissions.js";
import type { Store, UserRecord } from "./store.js";
import { verifyAccessToken } from "./tokens.js";

export interface GuardDeps {
  store: Store;
  tokenSecret: string;
  now: () => Date;
}

/** Who is calling, and what they may do. Set by requireAuth, read with getAuth. */
export interface AuthContext {
  user: AuthenticatedUser;
  subject: PermissionSubject;
}

const LOCALS_KEY = "auth";

/**
 * The permission view of a user. Staff hold what is stored on their account (D-34); the names
 * are checked against the table by hasPermission on every call (A-27). The Super Admin holds
 * everything through hasPermission and ignores the list.
 */
export function subjectOf(user: UserRecord): PermissionSubject {
  return { role: user.role, isActive: user.isActive, permissions: user.permissions };
}

/** The caller set by requireAuth, or null if no guard ran on this request. */
export function getAuth(res: Response): AuthContext | null {
  const value: unknown = res.locals[LOCALS_KEY];
  if (typeof value !== "object" || value === null) return null;
  return value as AuthContext;
}

/** 401 with the one body every refusal uses. */
export function sendUnauthorized(res: Response): void {
  res.set("Cache-Control", "no-store");
  res.status(401).json({ error: "unauthorized" });
}

/** The token from "Authorization: Bearer <token>". Only the header counts, never the URL. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Lets a request through only with a valid access token for an existing, active user.
 * The user is loaded from the store on every request, so a change to a user shows at once (A-27).
 * Every failure (no header, bad token, expired, unknown or inactive user) is 401 { error: "unauthorized" }.
 * Replies from guarded routes are marked no-store.
 */
export function requireAuth(deps: GuardDeps): RequestHandler {
  return async (req, res, next) => {
    delete res.locals[LOCALS_KEY];
    res.set("Cache-Control", "no-store");

    const token = bearerToken(req);
    if (token === null) {
      sendUnauthorized(res);
      return;
    }
    const result = verifyAccessToken(deps.tokenSecret, token, deps.now());
    if (!result.ok) {
      sendUnauthorized(res);
      return;
    }
    const user = await deps.store.users.findById(result.userId);
    if (user === null || !user.isActive) {
      sendUnauthorized(res);
      return;
    }
    const context: AuthContext = {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      subject: subjectOf(user),
    };
    res.locals[LOCALS_KEY] = context;
    next();
  };
}

/**
 * Put it after requireAuth. 403 { error: "forbidden" } if the caller lacks the permission.
 * If requireAuth did not run, the answer is 401 (fail closed).
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (_req, res, next) => {
    const auth = getAuth(res);
    if (auth === null) {
      sendUnauthorized(res);
      return;
    }
    if (!hasPermission(auth.subject, permission)) {
      res.set("Cache-Control", "no-store");
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}