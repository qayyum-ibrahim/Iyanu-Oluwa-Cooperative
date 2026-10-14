// Creating the first Super Admin (D-06). Pure logic: it talks only to the Store.
// The terminal script (setup-owner.ts) calls this. Never log a password or a hash.

import { normalizeEmail } from "./email.js";
import { assertPasswordAllowed, hashPassword } from "./password.js";
import type { Store, UserRecord } from "./store.js";

export class OwnerAlreadyExistsError extends Error {
  constructor() {
    super("A Super Admin already exists.");
    this.name = "OwnerAlreadyExistsError";
  }
}

export interface NewOwner {
  email: unknown;
  password: unknown;
  displayName: string;
}

/**
 * Creates the Super Admin and one audit entry ("owner.setup", actor = the new owner).
 * Throws OwnerAlreadyExistsError if any Super Admin exists.
 * Throws InvalidEmailError or PasswordPolicyError for bad input. Nothing is saved in those cases.
 * A blank display name becomes "Owner".
 */
export async function createOwner(store: Store, input: NewOwner): Promise<UserRecord> {
  if (await store.users.hasSuperAdmin()) throw new OwnerAlreadyExistsError();

  const email = normalizeEmail(input.email);
  const password: unknown = input.password;
  assertPasswordAllowed(password);
  const displayName = input.displayName.trim() || "Owner";

  const passwordHash = await hashPassword(password);
  const owner = await store.users.create({
    email,
    passwordHash,
    displayName,
    role: "SUPER_ADMIN",
  });
  await store.audit.append({
    actorId: owner.id,
    action: "owner.setup",
    entityType: "User",
    entityId: owner.id,
  });
  return owner;
}