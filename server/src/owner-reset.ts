// Reset the owner password (D-36, OQ-15). Logic only: it talks to the Store.
// The terminal script (reset-owner-password.ts) calls this. Never log a password or a hash.

import { assertPasswordAllowed, hashPassword } from "./password.js";
import type { Store, UserRecord } from "./store.js";

export class NoOwnerError extends Error {
  constructor() {
    super("No Super Admin exists");
    this.name = "NoOwnerError";
  }
}

export class MultipleOwnersError extends Error {
  constructor() {
    super("More than one Super Admin exists");
    this.name = "MultipleOwnersError";
  }
}

export interface OwnerResetResult {
  email: string;
  isActive: boolean;
  tokensRevoked: number;
}

/** The one Super Admin (active or not). Throws NoOwnerError for none, MultipleOwnersError for two or more. */
export async function findOnlyOwner(store: Store): Promise<UserRecord> {
  const owners = (await store.users.list()).filter((u) => u.role === "SUPER_ADMIN");
  const [owner, ...rest] = owners;
  if (owner === undefined) throw new NoOwnerError();
  if (rest.length > 0) throw new MultipleOwnersError();
  return owner;
}

/**
 * Sets a new password for the only Super Admin.
 * Order: password rules, find the owner, hash and save, end all refresh tokens, clear the
 * lockout, write "owner.password_reset" (actor = the owner, detail: tokens_revoked=N).
 * Throws PasswordPolicyError, NoOwnerError or MultipleOwnersError. Nothing is saved in those cases.
 * Does not change isActive. The calls are separate Store calls, not one transaction (A-62).
 * An access token already issued works until it expires (A-63).
 * `now` is for tests.
 */
export async function resetOwnerPassword(
  store: Store,
  newPassword: unknown,
  now: Date = new Date(),
): Promise<OwnerResetResult> {
  assertPasswordAllowed(newPassword);
  const owner = await findOnlyOwner(store);

  const passwordHash = await hashPassword(newPassword);
  if (!(await store.users.setPasswordHash(owner.id, passwordHash))) throw new NoOwnerError();
  const revoked = await store.refreshTokens.revokeAllForUser(owner.id, now);
  await store.users.clearLockout(owner.id);
  await store.audit.append({
    actorId: owner.id,
    action: "owner.password_reset",
    entityType: "User",
    entityId: owner.id,
    detail: `tokens_revoked=${revoked}`,
  });
  return { email: owner.email, isActive: owner.isActive, tokensRevoked: revoked };
}