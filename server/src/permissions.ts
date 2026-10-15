// Permission table (D-04, D-05, DR-13, DR-14). Pure logic: no database, no network.
// One list of named permissions, one rule for who holds each, one rule for who may grant.
// Deny by default: anything not listed here, or not granted, is refused.

import type { Role } from "./store.js";

interface PermissionDef {
  readonly key: string;
  readonly label: string;
  /** False: never given to Staff. Only the Super Admin holds it. */
  readonly staffGrantable: boolean;
}

// Order is the order of the prototype's list (legacy-prototype/src/App.jsx), then the two
// new rights from D-05 (OQ-13 default). Do not reorder: a test pins this list.
export const PERMISSION_TABLE = [
  { key: "dashboard", label: "View dashboard", staffGrantable: true },
  { key: "members.view", label: "View members", staffGrantable: true },
  { key: "members.create", label: "Add members", staffGrantable: true },
  { key: "members.edit", label: "Edit members", staffGrantable: true },
  { key: "members.delete", label: "Delete members", staffGrantable: true },
  { key: "payments.view", label: "View payments", staffGrantable: true },
  { key: "payments.create", label: "Record payments", staffGrantable: true },
  { key: "payments.edit", label: "Edit payments", staffGrantable: true },
  { key: "payments.delete", label: "Delete payments", staffGrantable: true },
  { key: "expenses.view", label: "View expenses", staffGrantable: true },
  { key: "expenses.create", label: "Record expenses", staffGrantable: true },
  { key: "expenses.edit", label: "Edit expenses", staffGrantable: true },
  { key: "expenses.delete", label: "Delete expenses", staffGrantable: true },
  { key: "loans.view", label: "View loans", staffGrantable: true },
  { key: "loans.create", label: "Create loans", staffGrantable: true },
  { key: "loans.edit", label: "Edit loans", staffGrantable: true },
  { key: "loans.delete", label: "Delete loans", staffGrantable: true },
  { key: "reports.view", label: "View reports", staffGrantable: true },
  { key: "reports.export", label: "Export reports", staffGrantable: true },
  { key: "users.manage", label: "Manage staff", staffGrantable: false },
  { key: "loans.disburse", label: "Disburse loans", staffGrantable: true },
  { key: "payoff.process", label: "Process member pay-off", staffGrantable: true },
] as const satisfies readonly PermissionDef[];

export type Permission = (typeof PERMISSION_TABLE)[number]["key"];

const BY_KEY: ReadonlyMap<string, PermissionDef> = new Map<string, PermissionDef>(
  PERMISSION_TABLE.map((p): [string, PermissionDef] => [p.key, p]),
);

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_TABLE.map((p) => p.key);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && BY_KEY.has(value);
}

export interface PermissionSubject {
  readonly role: Role;
  readonly isActive: boolean;
  /** Permissions granted to a Staff user. Ignored for the Super Admin. */
  readonly permissions: readonly string[];
}

/**
 * Does this user hold this permission right now?
 * Super Admin: every listed permission. Staff: only what is granted and grantable.
 * Inactive users, unknown permissions and unknown roles are always refused.
 */
export function hasPermission(subject: PermissionSubject, permission: unknown): boolean {
  if (!isPermission(permission)) return false;
  if (!subject.isActive) return false;
  if (subject.role === "SUPER_ADMIN") return true;
  if (subject.role !== "STAFF") return false;
  const def = BY_KEY.get(permission);
  if (def === undefined || !def.staffGrantable) return false;
  return subject.permissions.includes(permission);
}

/**
 * May this actor give this permission to a staff account?
 * Granting needs `users.manage`, which only the Super Admin holds, so loans.disburse and
 * payoff.process (DR-14) are grantable by the Super Admin alone. A test pins that.
 * If `users.manage` ever becomes grantable to Staff, add a check for DR-14 here first.
 */
export function canGrant(actor: PermissionSubject, permission: unknown): boolean {
  if (!isPermission(permission)) return false;
  const def = BY_KEY.get(permission);
  if (def === undefined || !def.staffGrantable) return false;
  return hasPermission(actor, "users.manage");
}

export class PermissionGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionGrantError";
  }
}

/**
 * Checks a requested permission list for a staff account and returns it cleaned:
 * no duplicates, in table order. All or nothing: one bad entry throws and nothing is returned.
 * Throws PermissionGrantError if the actor may not grant, the input is not a list,
 * an entry is unknown, or an entry may not be granted to Staff.
 */
export function normalizeStaffGrants(actor: PermissionSubject, requested: unknown): Permission[] {
  if (!hasPermission(actor, "users.manage")) {
    throw new PermissionGrantError("Only the Super Admin can grant permissions.");
  }
  if (!Array.isArray(requested)) {
    throw new PermissionGrantError("Permissions must be a list.");
  }
  const list: unknown[] = requested;
  const wanted = new Set<Permission>();
  for (const item of list) {
    if (!isPermission(item)) {
      throw new PermissionGrantError("The list contains an unknown permission.");
    }
    if (!canGrant(actor, item)) {
      throw new PermissionGrantError(`The permission ${item} cannot be granted to staff.`);
    }
    wanted.add(item);
  }
  return ALL_PERMISSIONS.filter((p) => wanted.has(p));
}