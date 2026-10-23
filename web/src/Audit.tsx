// Audit log page (U.8d, R-22): GET /audit with the actor and action filters and paging, for the
// holder of `users.manage` (the Super Admin alone, D-25). Read-only. The server sends actor ids;
// names come from the staff list and the signed-in user, and an unknown id shows as sent (A-227).
// Table headers from legacy-prototype/src/App.jsx (Recent Activity Log): Time, User, Action, Details.
import { useEffect, useState, type FormEvent } from "react";
import type { Api, AuditEntry, AuditFilter, AuditPage, CallFailure, StaffAccount, User } from "./api.ts";

/** AUDIT_DEFAULT_LIMIT in server/src/audit-view.ts. */
export const AUDIT_PAGE_SIZE = 50;

/**
 * Every action the server writes, read from the audit writers in server/src (U.8d), copied as the
 * category lists are (A-191 item 5). If the server adds one, this list must change too.
 */
export const AUDIT_ACTIONS: readonly string[] = [
  "account.locked",
  "expense.created",
  "expense.deleted",
  "expense.updated",
  "loan.disbursed",
  "login.failure",
  "login.success",
  "member.created",
  "member.reactivated",
  "owner.password_reset",
  "owner.setup",
  "password.change_failed",
  "password.changed",
  "payment.created",
  "payoff.processed",
  "session.logout",
  "session.reuse_detected",
  "staff.created",
  "staff.deactivated",
  "staff.password_reset",
  "staff.permissions_changed",
  "staff.reactivated",
];

const LAGOS_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The time in Lagos, as "1 Nov 2026, 00:30". Text that is not a time is shown as it came. */
export function formatTime(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : LAGOS_TIME.format(time);
}

/** Actor id to name: the signed-in user as "You (name)", then each staff account. */
export function actorNames(me: User, staff: readonly StaffAccount[]): Map<string, string> {
  const names = new Map<string, string>([[me.id, `You (${me.displayName})`]]);
  for (const s of staff) {
    if (!names.has(s.id)) names.set(s.id, s.displayName);
  }
  return names;
}

/** The User cell: "—" for no actor, the name if known, else the id as sent. */
export function actorLabel(actorId: string | null, names: ReadonlyMap<string, string>): string {
  if (actorId === null) return "—";
  return names.get(actorId) ?? actorId;
}

/** "Entries 51–100", "No entries". */
export function pageRange(offset: number, count: number): string {
  if (count === 0) return "No entries";
  return `Entries ${offset + 1}–${offset + count}`;
}

/** The message for a failed read. Null for signed_out: the sign-in screen already shows. */
export function auditListMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "invalid_input":
      return "The filters were refused. Press Clear and try again.";
    case "forbidden":
      return "You do not have permission to do this.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; page: AuditPage }
  | { kind: "failed"; message: string | null };

export interface AuditProps {
  api: Pick<Api, "listAudit" | "listStaff">;
  me: User;
}

const FIRST_PAGE: AuditFilter = { limit: AUDIT_PAGE_SIZE, offset: 0 };

/**
 * The first page loads with no filters, newest first as the server sends it. "Apply" sends the
 * filters from the first page; "Clear" empties them. "Newer" and "Older" move one page and keep
 * the filters. The staff list is read once for the names; if it fails, ids show instead.
 */
export default function Audit({ api, me }: AuditProps) {
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState<AuditFilter>(FIRST_PAGE);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [staff, setStaff] = useState<StaffAccount[]>([]);

  useEffect(() => {
    let active = true;
    api.listStaff().then((result) => {
      if (active && result.ok) setStaff(result.value);
    });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    api.listAudit(query).then((result) => {
      if (!active) return;
      setList(
        result.ok
          ? { kind: "loaded", page: result.value }
          : { kind: "failed", message: auditListMessage(result.reason) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, query]);

  function load(next: AuditFilter) {
    setList({ kind: "loading" });
    setQuery(next);
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    load({
      ...(actorId !== "" ? { actorId } : {}),
      ...(action !== "" ? { action } : {}),
      ...FIRST_PAGE,
    });
  }

  function clear() {
    setActorId("");
    setAction("");
    load(FIRST_PAGE);
  }

  const names = actorNames(me, staff);
  const page = list.kind === "loaded" ? list.page : null;

  return (
    <>
      <div className="title">
        <div>
          <h1>Audit log</h1>
          <p>Who did what, newest first</p>
        </div>
      </div>
      <form className="form audit-filters" onSubmit={apply}>
        <label className="field">
          <span>User</span>
          <select name="actorId" value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">All users</option>
            {[...names].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Action</span>
          <select name="action" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={clear}>
            Clear
          </button>
          <button type="submit" className="primary-btn">
            Apply
          </button>
        </div>
      </form>
      <section className="panel">
        <h2>Recent activity</h2>
        {list.kind === "loading" && <p className="panel-note">Loading…</p>}
        {list.kind === "failed" && list.message && (
          <em role="alert" className="error panel-note">
            {list.message}
          </em>
        )}
        {page && page.entries.length === 0 && <p className="panel-note">No entries found.</p>}
        {page && page.entries.length > 0 && (
          <div className="table-wrap">
            <table className="audit">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {page.entries.map((e: AuditEntry) => (
                  <tr key={e.id}>
                    <td>{formatTime(e.createdAt)}</td>
                    <td>{actorLabel(e.actorId, names)}</td>
                    <td>{e.action}</td>
                    <td>{e.entityType}</td>
                    <td className="audit-detail">{e.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page && (
          <div className="audit-paging">
            <span>{pageRange(page.offset, page.entries.length)}</span>
            <div>
              <button
                type="button"
                className="secondary"
                disabled={page.offset === 0}
                onClick={() => load({ ...query, offset: Math.max(0, page.offset - page.limit) })}
              >
                Newer
              </button>
              <button
                type="button"
                className="secondary"
                disabled={!page.hasMore}
                onClick={() => load({ ...query, offset: page.offset + page.limit })}
              >
                Older
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
