// Change your own password (D-36, OQ-15). Logic only: it talks to the Store.
// Never log or return a password or a hash. Audit details hold reason codes and counts only.

import { LOCKOUT_MAX_FAILURES, LOCKOUT_SECONDS } from "./auth.js";
import {
  PasswordPolicyError,
  assertPasswordAllowed,
  hashPassword,
  verifyPassword,
} from "./password.js";
import type { Store } from "./store.js";

export type ChangePasswordFailure = "invalid_input" | "wrong_password";
export type ChangePasswordResult =
  | { ok: true; tokensRevoked: number }
  | { ok: false; reason: ChangePasswordFailure };

// Unknown user, inactive user, wrong password and locked all look the same to the caller.
const WRONG: ChangePasswordResult = { ok: false, reason: "wrong_password" };
const INVALID: ChangePasswordResult = { ok: false, reason: "invalid_input" };

function isAllowedPassword(value: unknown): value is string {
  try {
    assertPasswordAllowed(value);
    return true;
  } catch (error) {
    if (error instanceof PasswordPolicyError) return false;
    throw error;
  }
}

async function auditFailure(store: Store, userId: string, detail: string): Promise<void> {
  await store.audit.append({
    actorId: userId,
    action: "password.change_failed",
    entityType: "User",
    entityId: userId,
    detail,
  });
}

/**
 * Changes the password of the signed-in user.
 * Order: input checks (no password is checked yet), user lookup, lockout check, current
 * password check, "new differs from current" check, then hashing and saving.
 * - A wrong current password counts as a failed sign-in (same lockout, A-61) and writes
 *   "password.change_failed" (detail: wrong_password). While locked, even the right current
 *   password is refused (detail: locked) and nothing is counted. The hash is still checked.
 * - Success: saves the new hash, revokes every refresh token of the user, resets the lockout
 *   count, writes "password.changed" (detail: tokens_revoked=N). The caller must sign in again.
 *   An access token already issued works until it expires (A-50, A-63).
 * - The calls are separate Store calls, not one transaction (A-62).
 * `now` is for tests. Never throws for bad input. A Store or audit error is thrown.
 */
export async function changeOwnPassword(
  store: Store,
  userId: unknown,
  currentPassword: unknown,
  newPassword: unknown,
  now: Date = new Date(),
): Promise<ChangePasswordResult> {
  if (typeof currentPassword !== "string" || !isAllowedPassword(newPassword)) return INVALID;
  if (typeof userId !== "string" || userId.length === 0) return WRONG;
  const user = await store.users.findById(userId);
  if (user === null || !user.isActive) return WRONG;

  const state = await store.users.getLockout(user.id);
  const isLocked =
    state !== null && state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
  const matches = await verifyPassword(user.passwordHash, currentPassword);

  if (isLocked) {
    await auditFailure(store, user.id, "locked");
    return WRONG;
  }
  if (!matches) {
    const after = await store.users.recordFailedLogin(
      user.id,
      now,
      LOCKOUT_MAX_FAILURES,
      LOCKOUT_SECONDS,
    );
    await auditFailure(store, user.id, "wrong_password");
    if (after.lockedUntil !== null) {
      await store.audit.append({
        actorId: user.id,
        action: "account.locked",
        entityType: "User",
        entityId: user.id,
        detail: `failures=${after.failedCount}`,
      });
    }
    return WRONG;
  }
  if (newPassword === currentPassword) return INVALID;

  const passwordHash = await hashPassword(newPassword);
  if (!(await store.users.setPasswordHash(user.id, passwordHash))) return WRONG;
  const revoked = await store.refreshTokens.revokeAllForUser(user.id, now);
  if (state !== null && (state.failedCount > 0 || state.lockedUntil !== null)) {
    await store.users.clearLockout(user.id);
  }
  await store.audit.append({
    actorId: user.id,
    action: "password.changed",
    entityType: "User",
    entityId: user.id,
    detail: `tokens_revoked=${revoked}`,
  });
  return { ok: true, tokensRevoked: revoked };
}