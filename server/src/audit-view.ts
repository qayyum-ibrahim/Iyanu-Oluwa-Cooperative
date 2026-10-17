// Audit viewer logic (step 2.6). Read-only. Never log entries or filters.
// Rules: only a holder of `users.manage` may read (the Super Admin alone, D-25). Input is checked
// before the store is called. Entries with no actor are included unless an actor filter is given (A-28).

import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { AuditRecord, Store } from "./store.js";

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;
export const AUDIT_MAX_OFFSET = 1_000_000;
const MAX_FILTER_LENGTH = 100;

export type AuditViewFailure = "forbidden" | "invalid_input";

export interface AuditEntryView {
  id: string;
  createdAt: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
}

export interface AuditPage {
  entries: AuditEntryView[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type AuditViewResult =
  | { ok: true; value: AuditPage }
  | { ok: false; reason: AuditViewFailure };

export interface AuditViewer {
  subject: PermissionSubject;
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface AuditViewQuery {
  actorId?: unknown;
  action?: unknown;
  limit?: unknown;
  offset?: unknown;
}

/** A whole number from a number or a string of 1 to 9 digits. Anything else gives null. */
function wholeNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "string" && /^[0-9]{1,9}$/.test(value)) return Number(value);
  return null;
}

type Text = { ok: true; value: string | undefined } | { ok: false };

/** A filter: absent, or text of 1 to 100 characters. */
function filterText(value: unknown): Text {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === "string" && value.length >= 1 && value.length <= MAX_FILTER_LENGTH) {
    return { ok: true, value };
  }
  return { ok: false };
}

const toView = (a: AuditRecord): AuditEntryView => ({
  id: a.id,
  createdAt: a.createdAt.toISOString(),
  actorId: a.actorId,
  action: a.action,
  entityType: a.entityType,
  entityId: a.entityId,
  detail: a.detail,
});

export async function listAuditEntries(
  store: Store,
  viewer: AuditViewer,
  query: AuditViewQuery,
): Promise<AuditViewResult> {
  if (!hasPermission(viewer.subject, "users.manage")) return { ok: false, reason: "forbidden" };

  let limit = AUDIT_DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    const n = wholeNumber(query.limit);
    if (n === null || n < 1 || n > AUDIT_MAX_LIMIT) return { ok: false, reason: "invalid_input" };
    limit = n;
  }
  let offset = 0;
  if (query.offset !== undefined) {
    const n = wholeNumber(query.offset);
    if (n === null || n < 0 || n > AUDIT_MAX_OFFSET) return { ok: false, reason: "invalid_input" };
    offset = n;
  }
  const actorId = filterText(query.actorId);
  const action = filterText(query.action);
  if (!actorId.ok || !action.ok) return { ok: false, reason: "invalid_input" };

  // Ask for one extra row to learn whether there is a next page.
  const rows = await store.audit.list({
    ...(actorId.value !== undefined ? { actorId: actorId.value } : {}),
    ...(action.value !== undefined ? { action: action.value } : {}),
    limit: limit + 1,
    offset,
  });
  return {
    ok: true,
    value: {
      entries: rows.slice(0, limit).map(toView),
      limit,
      offset,
      hasMore: rows.length > limit,
    },
  };
}