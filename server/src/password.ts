// Password hashing (D-23). Uses argon2id with the library's default cost settings.
// Pure logic: no database, no network. Never log a password or a hash.

import { argon2id, hash, verify } from "argon2";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordPolicyError";
  }
}

/** Throws PasswordPolicyError if the password is not a string or has a bad length. Length counts UTF-16 code units, as JavaScript does. */
export function assertPasswordAllowed(plain: unknown): asserts plain is string {
  if (typeof plain !== "string") {
    throw new PasswordPolicyError("Password must be text");
  }
  if (plain.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordPolicyError(`Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
  }
}

/** Returns a PHC string such as "$argon2id$v=19$m=...". The password is used exactly as given (no trimming). */
export async function hashPassword(plain: string): Promise<string> {
  assertPasswordAllowed(plain);
  return hash(plain, { type: argon2id });
}

/**
 * True only if the password matches the hash.
 * Returns false (never throws) for a wrong password, a malformed hash,
 * or a password outside the length limits (so huge inputs are never hashed).
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  if (typeof storedHash !== "string" || typeof plain !== "string") return false;
  if (plain.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}