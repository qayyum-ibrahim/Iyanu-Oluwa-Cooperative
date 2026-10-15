// Sign-in logic (D-06, D-22, D-23, D-30). Pure logic: it talks only to the Store.
// No tokens and no routes here. Never log or store a password, a hash or the typed email.

import { InvalidEmailError, normalizeEmail } from "./email.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { Role, Store } from "./store.js";

/** Lock after this many failed sign-ins in a row (A-41: my choice, not the owner's). */
export const LOCKOUT_MAX_FAILURES = 5;
/** A lock lasts this many seconds (15 minutes). */
export const LOCKOUT_SECONDS = 900;

/** The user fields that may leave this module. The password hash never does. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

/** A failure carries no reason. Every kind of failure looks the same to the caller. */
export type AuthResult = { ok: true; user: AuthenticatedUser } | { ok: false };

/** Reasons are written to the audit log only (detail field). They are never returned. */
export type AuthFailureReason =
  | "invalid_input"
  | "unknown_email"
  | "bad_password"
  | "inactive"
  | "locked";

// A real hash of a fixed, public string. Checked when the email is unknown, so an unknown
// email costs about the same time as a known one. Built once, on first use.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-for-timing-only");
  return dummyHash;
}

async function fail(
  store: Store,
  actorId: string | null,
  reason: AuthFailureReason,
): Promise<AuthResult> {
  await store.audit.append({
    actorId,
    action: "login.failure",
    entityType: "User",
    entityId: actorId,
    detail: reason,
  });
  return { ok: false };
}

/**
 * Checks an email and password.
 * Success: writes "login.success" (actor = the user) and returns the user without the hash.
 * Failure: writes "login.failure" with a reason code in `detail` and returns { ok: false }.
 *   The same result comes back for an unknown email, a wrong password, a bad input, an
 *   inactive user and a locked user. The actor is the user when the email is known, otherwise none.
 * Lockout (D-30): LOCKOUT_MAX_FAILURES wrong passwords in a row lock the user for LOCKOUT_SECONDS
 *   and write "account.locked". While locked, even the right password is refused (reason "locked")
 *   and nothing is counted. The hash is still checked, so the time taken does not reveal the lock.
 *   A correct password resets the count. An unknown email has no user to count.
 * An inactive user is refused even with the right password.
 * `now` is for tests. Never throws for bad input. If an audit or lockout write fails the error is
 * thrown (fail closed): no sign-in without its audit entry.
 */
export async function authenticate(
  store: Store,
  email: unknown,
  password: unknown,
  now: Date = new Date(),
): Promise<AuthResult> {
  if (typeof password !== "string") return fail(store, null, "invalid_input");

  let normalized: string;
  try {
    normalized = normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return fail(store, null, "invalid_input");
    throw error;
  }

  const user = await store.users.findByEmail(normalized);
  if (user === null) {
    await verifyPassword(await getDummyHash(), password);
    return fail(store, null, "unknown_email");
  }

  const state = await store.users.getLockout(user.id);
  const isLocked =
    state !== null && state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();

  const matches = await verifyPassword(user.passwordHash, password);
  if (isLocked) return fail(store, user.id, "locked");

  if (!matches) {
    const after = await store.users.recordFailedLogin(
      user.id,
      now,
      LOCKOUT_MAX_FAILURES,
      LOCKOUT_SECONDS,
    );
    const result = await fail(store, user.id, "bad_password");
    if (after.lockedUntil !== null) {
      await store.audit.append({
        actorId: user.id,
        action: "account.locked",
        entityType: "User",
        entityId: user.id,
        detail: `failures=${after.failedCount}`,
      });
    }
    return result;
  }

  if (!user.isActive) return fail(store, user.id, "inactive");

  if (state !== null && (state.failedCount > 0 || state.lockedUntil !== null)) {
    await store.users.clearLockout(user.id);
  }
  await store.audit.append({
    actorId: user.id,
    action: "login.success",
    entityType: "User",
    entityId: user.id,
  });
  return {
    ok: true,
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
  };
}