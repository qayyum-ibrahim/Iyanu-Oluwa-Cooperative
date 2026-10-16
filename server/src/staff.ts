// Staff accounts (D-04, D-05, D-34). Logic only: it talks to the Store.
// Every function checks that the caller holds `users.manage` (only the Super Admin does, DR-14).
// Never log or return a password or a hash. Audit details hold permission names, never emails.

import { InvalidEmailError, normalizeEmail } from "./email.js";
import { PasswordPolicyError, assertPasswordAllowed, hashPassword } from "./password.js";
import {
  PermissionGrantError,
  hasPermission,
  normalizeStaffGrants,
  type Permission,
  type PermissionSubject,
} from "./permissions.js";
import { DuplicateEmailError, type Role, type Store, type UserRecord } from "./store.js";

/** Who is acting: the user id (for the audit log) and what they may do. */
export interface StaffActor {
  id: string;
  subject: PermissionSubject;
}

/** A staff account as it may leave this module. The password hash never does. */
export interface StaffView {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  permissions: string[];
  createdAt: Date;
}

export type StaffFailure = "forbidden" | "invalid_input" | "email_taken" | "not_found";
export type StaffResult<T> = { ok: true; value: T } | { ok: false; reason: StaffFailure };

/** Longest display name accepted (A-56: my choice). */
export const DISPLAY_NAME_MAX = 100;

const failure = (reason: StaffFailure): { ok: false; reason: StaffFailure } => ({
  ok: false,
  reason,
});

function toView(u: UserRecord): StaffView {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    permissions: [...u.permissions],
    createdAt: u.createdAt,
  };
}

const mayManage = (actor: StaffActor): boolean => hasPermission(actor.subject, "users.manage");

/** The cleaned grant list (no duplicates, table order), or null if it is not allowed. */
function cleanGrants(actor: StaffActor, requested: unknown): Permission[] | null {
  try {
    return normalizeStaffGrants(actor.subject, requested);
  } catch (error) {
    if (error instanceof PermissionGrantError) return null;
    throw error;
  }
}

function isAllowedPassword(value: unknown): value is string {
  try {
    assertPasswordAllowed(value);
    return true;
  } catch (error) {
    if (error instanceof PasswordPolicyError) return false;
    throw error;
  }
}

export interface NewStaffInput {
  email: unknown;
  password: unknown;
  displayName: unknown;
  /** Missing means no permissions. */
  permissions?: unknown;
}

/**
 * Creates an active Staff account and one audit entry "staff.created" (actor = the caller).
 * Order: permission check, then all input checks, then hashing, then saving. Nothing is saved
 * for bad input. Reasons: forbidden, invalid_input, email_taken (the email is normalised first).
 * The user and the audit entry are two Store calls, not one transaction (A-54).
 */
export async function createStaff(
  store: Store,
  actor: StaffActor,
  input: NewStaffInput,
): Promise<StaffResult<StaffView>> {
  if (!mayManage(actor)) return failure("forbidden");

  let email: string;
  try {
    email = normalizeEmail(input.email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return failure("invalid_input");
    throw error;
  }
  const password: unknown = input.password;
  if (!isAllowedPassword(password)) return failure("invalid_input");
  if (typeof input.displayName !== "string") return failure("invalid_input");
  const displayName = input.displayName.trim();
  if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) {
    return failure("invalid_input");
  }
  const grants = input.permissions === undefined ? [] : cleanGrants(actor, input.permissions);
  if (grants === null) return failure("invalid_input");

  const passwordHash = await hashPassword(password);
  let user: UserRecord;
  try {
    user = await store.users.create({
      email,
      passwordHash,
      displayName,
      role: "STAFF",
      permissions: grants,
    });
  } catch (error) {
    if (error instanceof DuplicateEmailError) return failure("email_taken");
    throw error;
  }
  await store.audit.append({
    actorId: actor.id,
    action: "staff.created",
    entityType: "User",
    entityId: user.id,
    detail: `permissions=${grants.join(",")}`,
  });
  return { ok: true, value: toView(user) };
}

/** Every Staff account, oldest first. The Super Admin is not listed. */
export async function listStaff(store: Store, actor: StaffActor): Promise<StaffResult<StaffView[]>> {
  if (!mayManage(actor)) return failure("forbidden");
  const users = await store.users.list();
  return { ok: true, value: users.filter((u) => u.role === "STAFF").map(toView) };
}

/**
 * Replaces the permission list of one Staff account and writes "staff.permissions_changed"
 * (detail: before and after, permission names only). The list is all or nothing.
 * An unknown id, a non-text id or a Super Admin id is not_found: this does not change owners.
 * The change is seen on the target's next request (A-27).
 */
export async function setStaffPermissions(
  store: Store,
  actor: StaffActor,
  userId: unknown,
  requested: unknown,
): Promise<StaffResult<StaffView>> {
  if (!mayManage(actor)) return failure("forbidden");
  if (typeof userId !== "string" || userId.length === 0) return failure("not_found");
  const user = await store.users.findById(userId);
  if (user === null || user.role !== "STAFF") return failure("not_found");
  const grants = cleanGrants(actor, requested);
  if (grants === null) return failure("invalid_input");

  if (!(await store.users.setPermissions(user.id, grants))) return failure("not_found");
  await store.audit.append({
    actorId: actor.id,
    action: "staff.permissions_changed",
    entityType: "User",
    entityId: user.id,
    detail: `before=${user.permissions.join(",")} after=${grants.join(",")}`,
  });
  const updated = await store.users.findById(user.id);
  if (updated === null) return failure("not_found");
  return { ok: true, value: toView(updated) };
}

async function setStaffActive(
  store: Store,
  actor: StaffActor,
  userId: unknown,
  active: boolean,
  now: Date,
): Promise<StaffResult<StaffView>> {
  if (!mayManage(actor)) return failure("forbidden");
  if (typeof userId !== "string" || userId.length === 0) return failure("not_found");
  const user = await store.users.findById(userId);
  // A Super Admin id is not_found: this does not deactivate owners (A-24, A-60).
  if (user === null || user.role !== "STAFF") return failure("not_found");
  // Already in the wanted state: nothing to change, revoke or audit (A-59).
  if (user.isActive === active) return { ok: true, value: toView(user) };

  if (!(await store.users.setActive(user.id, active))) return failure("not_found");
  // Order matters for safety: the account is closed first, then its sessions end, then the
  // audit entry is written. If a later call fails, the account is already refused (A-58).
  const revoked = active ? 0 : await store.refreshTokens.revokeAllForUser(user.id, now);
  await store.audit.append({
    actorId: actor.id,
    action: active ? "staff.reactivated" : "staff.deactivated",
    entityType: "User",
    entityId: user.id,
    ...(active ? {} : { detail: `tokens_revoked=${revoked}` }),
  });
  const updated = await store.users.findById(user.id);
  if (updated === null) return failure("not_found");
  return { ok: true, value: toView(updated) };
}

/**
 * Makes a Staff account inactive, ends all its sessions (refresh tokens) and writes
 * "staff.deactivated" (actor = the caller, detail: how many tokens were revoked).
 * Its access token stops working at once, because requireAuth loads the user on every request.
 * `now` is for tests.
 */
export function deactivateStaff(
  store: Store,
  actor: StaffActor,
  userId: unknown,
  now: Date = new Date(),
): Promise<StaffResult<StaffView>> {
  return setStaffActive(store, actor, userId, false, now);
}

/**
 * Makes a Staff account active again and writes "staff.reactivated". Sessions that were
 * ended stay ended: the person signs in again.
 */
export function reactivateStaff(
  store: Store,
  actor: StaffActor,
  userId: unknown,
  now: Date = new Date(),
): Promise<StaffResult<StaffView>> {
  return setStaffActive(store, actor, userId, true, now);
}