// Sign-in logic (D-06, D-22, D-23). Pure logic: it talks only to the Store.
// No tokens and no routes here. Never log or store a password, a hash or the typed email.

import { InvalidEmailError, normalizeEmail } from "./email.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { Role, Store } from "./store.js";

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
export type AuthFailureReason = "invalid_input" | "unknown_email" | "bad_password" | "inactive";

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
 *   The same result comes back for an unknown email, a wrong password, a bad input and an
 *   inactive user. The actor is the user when the email is known, otherwise none.
 * An inactive user is refused even with the right password.
 * Never throws for bad input. If the audit write fails the error is thrown (fail closed):
 * no sign-in without its audit entry.
 */
export async function authenticate(
  store: Store,
  email: unknown,
  password: unknown,
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

  const matches = await verifyPassword(user.passwordHash, password);
  if (!matches) return fail(store, user.id, "bad_password");
  if (!user.isActive) return fail(store, user.id, "inactive");

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