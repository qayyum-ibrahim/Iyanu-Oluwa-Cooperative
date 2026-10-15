// Sessions: issue, rotate, end (D-06, D-27, D-28, D-29). Logic only: it talks to the Store.
// No routes here. Never log or store a token. Only hashes are stored (A-33).

import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import {
  ACCESS_TOKEN_SECONDS,
  TokenConfigError,
  assertSecretAllowed,
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  isRefreshTokenShape,
} from "./tokens.js";

/** Life of a refresh token: 7 days, counted from each rotation (A-38). */
export const REFRESH_TOKEN_SECONDS = 604_800;

/** A mistake in our own code, such as starting a session for a user who cannot have one. */
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

export interface Session {
  userId: string;
  accessToken: string;
  accessExpiresAt: Date;
  /** Give this to the client once. Only its hash is stored. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** A failure carries no reason. Every kind of failure looks the same to the caller. */
export type SessionResult = { ok: true; session: Session } | { ok: false };

const FAILED: SessionResult = { ok: false };

function assertNow(now: Date): void {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TokenConfigError("The time is not a valid date.");
  }
}

async function mint(
  store: Store,
  secret: string,
  userId: string,
  familyId: string,
  now: Date,
): Promise<Session> {
  const accessToken = createAccessToken(secret, userId, now);
  const issuedSeconds = Math.floor(now.getTime() / 1000);
  const refresh = createRefreshToken();
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_SECONDS * 1000);
  await store.refreshTokens.create({
    userId,
    familyId,
    tokenHash: refresh.hash,
    expiresAt: refreshExpiresAt,
  });
  return {
    userId,
    accessToken,
    accessExpiresAt: new Date((issuedSeconds + ACCESS_TOKEN_SECONDS) * 1000),
    refreshToken: refresh.token,
    refreshExpiresAt,
  };
}

/**
 * Starts a session after a successful sign-in: a new family, one access token, one refresh token.
 * Throws SessionError if the user does not exist or is inactive, TokenConfigError for a bad
 * secret or time. Nothing is stored when it throws.
 */
export async function issueSession(
  store: Store,
  secret: string,
  userId: unknown,
  now: Date,
): Promise<Session> {
  assertSecretAllowed(secret);
  assertNow(now);
  if (typeof userId !== "string" || userId.length === 0) {
    throw new SessionError("A session needs a user id.");
  }
  const user = await store.users.findById(userId);
  if (user === null || !user.isActive) {
    throw new SessionError("A session cannot be started for this user.");
  }
  return mint(store, secret, user.id, randomUUID(), now);
}

/**
 * Exchanges a refresh token for a new session in the same family. The old token is marked used.
 * - A used token that comes back: the whole family is revoked and "session.reuse_detected" is
 *   written (fail closed: an audit error is thrown, after the revoke).
 * - Unknown, badly shaped, revoked or expired tokens fail quietly.
 * - An inactive or missing user: every token of that user is revoked.
 * - Lost race (another caller used the token first): fails, nothing revoked (A-40).
 * Never throws for a bad token. Throws TokenConfigError for a bad secret or time.
 */
export async function refreshSession(
  store: Store,
  secret: string,
  presented: unknown,
  now: Date,
): Promise<SessionResult> {
  assertSecretAllowed(secret);
  assertNow(now);
  if (!isRefreshTokenShape(presented)) return FAILED;

  const record = await store.refreshTokens.findByHash(hashRefreshToken(presented));
  if (record === null) return FAILED;
  if (record.revokedAt !== null) return FAILED;

  if (record.usedAt !== null) {
    await store.refreshTokens.revokeFamily(record.familyId, now);
    await store.audit.append({
      actorId: record.userId,
      action: "session.reuse_detected",
      entityType: "RefreshToken",
      entityId: record.id,
      detail: "used_token_presented",
    });
    return FAILED;
  }

  if (now.getTime() >= record.expiresAt.getTime()) return FAILED;

  const user = await store.users.findById(record.userId);
  if (user === null || !user.isActive) {
    await store.refreshTokens.revokeAllForUser(record.userId, now);
    return FAILED;
  }

  if (!(await store.refreshTokens.consume(record.id, now))) return FAILED;
  return { ok: true, session: await mint(store, secret, user.id, record.familyId, now) };
}

/**
 * Ends a session: revokes the whole family of the presented token and writes "session.logout".
 * Returns true only if something was revoked. A bad, unknown or already-ended token gives
 * false and writes nothing. Never throws for a bad token.
 */
export async function signOut(store: Store, presented: unknown, now: Date): Promise<boolean> {
  assertNow(now);
  if (!isRefreshTokenShape(presented)) return false;
  const record = await store.refreshTokens.findByHash(hashRefreshToken(presented));
  if (record === null) return false;
  const changed = await store.refreshTokens.revokeFamily(record.familyId, now);
  if (changed === 0) return false;
  await store.audit.append({
    actorId: record.userId,
    action: "session.logout",
    entityType: "User",
    entityId: record.userId,
  });
  return true;
}