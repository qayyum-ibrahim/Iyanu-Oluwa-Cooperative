// Member logic (step 3.2, D-40, DR-13, DR-15). Rules over the Store: no HTTP here.
// Staff see only the members they recorded. The Super Admin sees all (OQ-09).
// Audit details hold the Membership ID only, never a name or phone.

import { memberBalances } from "./balances.js";
import { koboToNairaString } from "./payments.js";
import { hasPermission, type PermissionSubject } from "./permissions.js";
import type { MemberRecord, MemberStatus, Store } from "./store.js";

/** Longest full name accepted (A-82: my choice, same as a display name). */
export const FULL_NAME_MAX = 100;
/** Longest phone, address or occupation accepted (A-82: my choice). */
export const MEMBER_TEXT_MAX = 200;
const USER_FILTER_MAX = 100;

/** Who is acting: the user id (the actor, DR-15) and what they may do. */
export interface MemberActor {
  id: string;
  subject: PermissionSubject;
}

/** A member as it may leave this module. */
export interface MemberView {
  id: string;
  membershipId: string;
  fullName: string;
  phone: string;
  address: string;
  occupation: string;
  status: MemberStatus;
  createdById: string;
  createdAt: string;
}

export type MemberFailure = "forbidden" | "invalid_input" | "not_found" | "already_active";
export type MemberResult<T> = { ok: true; value: T } | { ok: false; reason: MemberFailure };

const failure = (reason: MemberFailure): { ok: false; reason: MemberFailure } => ({
  ok: false,
  reason,
});

const toView = (m: MemberRecord): MemberView => ({
  id: m.id,
  membershipId: m.membershipId,
  fullName: m.fullName,
  phone: m.phone,
  address: m.address,
  occupation: m.occupation,
  status: m.status,
  createdById: m.createdById,
  createdAt: m.createdAt.toISOString(),
});

/** Only the Super Admin sees every member. Staff see their own (DR-13). */
const seesAll = (actor: MemberActor): boolean => actor.subject.role === "SUPER_ADMIN";

type Text = { ok: true; value: string } | { ok: false };

/** Optional text: missing or null gives "". Anything else must be text of at most 200 characters after trimming. */
function optionalText(value: unknown): Text {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > MEMBER_TEXT_MAX) return { ok: false };
  return { ok: true, value: trimmed };
}

export interface NewMemberInput {
  fullName: unknown;
  phone?: unknown;
  address?: unknown;
  occupation?: unknown;
}

/**
 * Records a member for the caller and writes one audit entry "member.created"
 * (actor = the caller, detail = the Membership ID only).
 * Order: permission check, then all input checks, then saving. Nothing is saved for bad input.
 * The member and the audit entry are two Store calls, not one transaction (same pattern as A-54).
 */
export async function createMember(
  store: Store,
  actor: MemberActor,
  input: NewMemberInput,
): Promise<MemberResult<MemberView>> {
  if (!hasPermission(actor.subject, "members.create")) return failure("forbidden");

  if (typeof input.fullName !== "string") return failure("invalid_input");
  const fullName = input.fullName.trim();
  if (fullName.length === 0 || fullName.length > FULL_NAME_MAX) return failure("invalid_input");
  const phone = optionalText(input.phone);
  const address = optionalText(input.address);
  const occupation = optionalText(input.occupation);
  if (!phone.ok || !address.ok || !occupation.ok) return failure("invalid_input");

  const member = await store.members.create({
    fullName,
    phone: phone.value,
    address: address.value,
    occupation: occupation.value,
    createdById: actor.id,
  });
  await store.audit.append({
    actorId: actor.id,
    action: "member.created",
    entityType: "Member",
    entityId: member.id,
    detail: `membership_id=${member.membershipId}`,
  });
  return { ok: true, value: toView(member) };
}

type StatusFilter = { ok: true; value: MemberStatus | undefined } | { ok: false };

/** Missing means Active. "all" means no filter (value undefined). */
function parseStatus(raw: unknown): StatusFilter {
  if (raw === undefined) return { ok: true, value: "ACTIVE" };
  if (typeof raw !== "string") return { ok: false };
  switch (raw.toLowerCase()) {
    case "active":
      return { ok: true, value: "ACTIVE" };
    case "inactive":
      return { ok: true, value: "INACTIVE" };
    case "all":
      return { ok: true, value: undefined };
    default:
      return { ok: false };
  }
}

type UserFilter = { ok: true; value: string | undefined } | { ok: false };

function parseUserFilter(raw: unknown): UserFilter {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw === "string" && raw.length >= 1 && raw.length <= USER_FILTER_MAX) {
    return { ok: true, value: raw };
  }
  return { ok: false };
}

/** Raw values as they arrive from a query string. Anything may be wrong; this code checks it. */
export interface MemberListInput {
  status?: unknown;
  createdById?: unknown;
}

/**
 * Members in Membership ID order. Status defaults to Active.
 * Staff: always only their own members, and a `createdById` filter is checked but ignored.
 * Super Admin: all members, or the ones recorded by `createdById`.
 */
export async function listMembers(
  store: Store,
  actor: MemberActor,
  input: MemberListInput,
): Promise<MemberResult<MemberView[]>> {
  if (!hasPermission(actor.subject, "members.view")) return failure("forbidden");
  const status = parseStatus(input.status);
  const userFilter = parseUserFilter(input.createdById);
  if (!status.ok || !userFilter.ok) return failure("invalid_input");

  const createdById = seesAll(actor) ? userFilter.value : actor.id;
  const rows = await store.members.list({
    ...(createdById !== undefined ? { createdById } : {}),
    ...(status.value !== undefined ? { status: status.value } : {}),
  });
  return { ok: true, value: rows.map(toView) };
}

/**
 * One member. An unknown id, a non-text id, or a member a Staff caller may not see
 * all give not_found, so the answer does not reveal that the member exists.
 */
export async function getMember(
  store: Store,
  actor: MemberActor,
  id: unknown,
): Promise<MemberResult<MemberView>> {
  if (!hasPermission(actor.subject, "members.view")) return failure("forbidden");
  if (typeof id !== "string" || id.length === 0) return failure("not_found");
  const member = await store.members.findById(id);
  if (member === null) return failure("not_found");
  if (!seesAll(actor) && member.createdById !== actor.id) return failure("not_found");
  return { ok: true, value: toView(member) };
}

/** A member's balances as they may leave this module. Amounts are naira strings (A-18). */
export interface MemberBalancesView {
  memberId: string;
  categories: { category: string; balance: string; refundable: boolean }[];
  /** What a pay-off would pay out now (DR-05). */
  refundableTotal: string;
  /** Shown as "Retained by cooperative" (OQ-14); never paid out. */
  nonRefundableTotal: string;
}

/**
 * One member's balances (DR-03, DR-05, OQ-14), worked out by memberBalances from their payments
 * less their pay-offs (D-72, D-73). Same access as getMember: members.view, and an unknown id,
 * a non-text id, or a member a Staff caller may not see all give not_found (DR-13).
 * The member, payments and pay-offs are read in one transaction, so a pay-off saved in between
 * cannot be counted against payments read before it. Nothing is written; no audit (A-75).
 * Broken data makes memberBalances throw BalanceError, which the route answers with 500.
 */
export async function getMemberBalances(
  store: Store,
  actor: MemberActor,
  id: unknown,
): Promise<MemberResult<MemberBalancesView>> {
  if (!hasPermission(actor.subject, "members.view")) return failure("forbidden");
  if (typeof id !== "string" || id.length === 0) return failure("not_found");

  return store.transaction(async (tx): Promise<MemberResult<MemberBalancesView>> => {
    const member = await tx.members.findById(id);
    if (member === null) return failure("not_found");
    if (!seesAll(actor) && member.createdById !== actor.id) return failure("not_found");

    const payments = await tx.payments.listByMember(member.id);
    const balances = memberBalances(payments, await tx.payOffs.listByMember(member.id));
    return {
      ok: true,
      value: {
        memberId: member.id,
        categories: balances.categories.map((c) => ({
          category: c.category,
          balance: koboToNairaString(c.balance),
          refundable: c.refundable,
        })),
        refundableTotal: koboToNairaString(balances.refundableTotal),
        nonRefundableTotal: koboToNairaString(balances.nonRefundableTotal),
      },
    };
  });
}

/**
 * Makes an Inactive member Active again (DR-16, D-71, A-179) and writes one audit entry
 * "member.reactivated" (detail: the Membership ID and the new status). Both in one transaction.
 * Needs members.edit. Staff may reactivate only a member they recorded; any other member, an
 * unknown id or a non-text id gives not_found. An Active member gives already_active, nothing saved.
 */
export async function reactivateMember(
  store: Store,
  actor: MemberActor,
  id: unknown,
): Promise<MemberResult<MemberView>> {
  if (!hasPermission(actor.subject, "members.edit")) return failure("forbidden");
  if (typeof id !== "string" || id.length === 0) return failure("not_found");

  return store.transaction(async (tx): Promise<MemberResult<MemberView>> => {
    const member = await tx.members.findById(id);
    if (member === null) return failure("not_found");
    if (!seesAll(actor) && member.createdById !== actor.id) return failure("not_found");
    if (member.status === "ACTIVE") return failure("already_active");

    if (!(await tx.members.setStatus(member.id, "ACTIVE"))) {
      throw new Error("The member to reactivate is missing");
    }
    await tx.audit.append({
      actorId: actor.id,
      action: "member.reactivated",
      entityType: "Member",
      entityId: member.id,
      detail: `membership_id=${member.membershipId} member_status=ACTIVE`,
    });
    return { ok: true, value: toView({ ...member, status: "ACTIVE" }) };
  });
}
