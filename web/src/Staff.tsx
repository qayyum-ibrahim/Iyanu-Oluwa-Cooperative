// Staff & access page (U.8a, R-19, R-21): the staff list and the add staff form, for the holder of
// `users.manage` (the Super Admin alone, D-25). The server checks every rule again; the Super
// Admin is not listed (listStaff in server/src/staff.ts). Labels from legacy-prototype/src/App.jsx
// (UserManagement); the server has no username or phone, so the form has neither (A-224).
// Change a staff account's permissions (U.8b, A-225). Deactivate, reactivate and reset password
// come in U.8c.
import { useEffect, useState, type FormEvent } from "react";
import type { Api, CallFailure, CreateStaffResult, NewStaff, StaffAccount } from "./api.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./ChangePassword.tsx";
import { formatDate } from "./Members.tsx";

/**
 * The permissions a staff account may hold, in the order of PERMISSION_TABLE in
 * server/src/permissions.ts with its labels, copied as the category lists are (A-191 item 5).
 * `users.manage` is left out: it is never given to Staff. loans.disburse and payoff.process may
 * be granted only by the Super Admin (DR-14), who is the only one who sees this page.
 */
export const STAFF_PERMISSIONS: readonly { key: string; label: string }[] = [
  { key: "dashboard", label: "View dashboard" },
  { key: "members.view", label: "View members" },
  { key: "members.create", label: "Add members" },
  { key: "members.edit", label: "Edit members" },
  { key: "members.delete", label: "Delete members" },
  { key: "payments.view", label: "View payments" },
  { key: "payments.create", label: "Record payments" },
  { key: "payments.edit", label: "Edit payments" },
  { key: "payments.delete", label: "Delete payments" },
  { key: "expenses.view", label: "View expenses" },
  { key: "expenses.create", label: "Record expenses" },
  { key: "expenses.edit", label: "Edit expenses" },
  { key: "expenses.delete", label: "Delete expenses" },
  { key: "loans.view", label: "View loans" },
  { key: "loans.create", label: "Create loans" },
  { key: "loans.edit", label: "Edit loans" },
  { key: "loans.delete", label: "Delete loans" },
  { key: "reports.view", label: "View reports" },
  { key: "reports.export", label: "Export reports" },
  { key: "loans.disburse", label: "Disburse loans" },
  { key: "payoff.process", label: "Process member pay-off" },
];

/** DISPLAY_NAME_MAX in server/src/staff.ts: the longest name, after trimming. */
export const STAFF_NAME_MAX = 100;

/** EMAIL_MAX_LENGTH and the shape in server/src/email.ts. */
export const STAFF_EMAIL_MAX = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** The list in table order with no repeats, or null if it holds an entry the grid does not list. */
export function cleanPermissions(permissions: readonly string[]): string[] | null {
  const known = STAFF_PERMISSIONS.map((p) => p.key);
  if (permissions.some((p) => !known.includes(p))) return null;
  return known.filter((p) => permissions.includes(p));
}

export const UNKNOWN_PERMISSION = "The permission list has an unknown entry. Reload the page.";

/** The list with `key` added if missing, or taken out if there. */
function toggled(permissions: string[], key: string): string[] {
  return permissions.includes(key) ? permissions.filter((p) => p !== key) : [...permissions, key];
}

/** What the add staff form holds, as typed. */
export interface StaffFormInput {
  displayName: string;
  email: string;
  password: string;
  confirm: string;
  permissions: string[];
}

export const BLANK_STAFF: StaffFormInput = {
  displayName: "",
  email: "",
  password: "",
  confirm: "",
  permissions: [],
};

/**
 * Checks the form in the server's order (email, password, name, permissions) and gives the body
 * to send, or a message. The name and email are trimmed; the password is sent exactly as typed,
 * as the server hashes it unchanged. Permissions go in table order, with no repeats.
 */
export function checkNewStaff(
  input: StaffFormInput,
): { ok: true; value: NewStaff } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  const email = input.email.trim();
  if (email.length > STAFF_EMAIL_MAX || !EMAIL_SHAPE.test(email.toLowerCase())) {
    return refuse("Enter a valid email address.");
  }
  if (input.password.length < PASSWORD_MIN_LENGTH || input.password.length > PASSWORD_MAX_LENGTH) {
    return refuse(`The password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`);
  }
  if (input.password !== input.confirm) return refuse("The two passwords do not match.");
  const displayName = input.displayName.trim();
  if (displayName.length === 0) return refuse("Enter the full name.");
  if (displayName.length > STAFF_NAME_MAX) {
    return refuse(`The full name may have at most ${STAFF_NAME_MAX} characters.`);
  }
  const permissions = cleanPermissions(input.permissions);
  if (permissions === null) return refuse(UNKNOWN_PERMISSION);
  return { ok: true, value: { displayName, email, password: input.password, permissions } };
}

/** The message for a failed staff list. Null for signed_out: the sign-in screen already shows. */
export function staffListMessage(reason: CallFailure): string | null {
  switch (reason) {
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

/**
 * The message for a refused add staff. Null for signed_out. There is no key: after a network or
 * server failure the account may be saved, and pressing again then answers email_taken.
 */
export function staffMessage(result: Extract<CreateStaffResult, { ok: false }>): string | null {
  switch (result.reason) {
    case "email_taken":
      return "Another account already uses this email.";
    case "invalid_input":
      return "The account was refused. Check the full name, email, password and permissions.";
    case "forbidden":
      return "You do not have permission to do this.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Check the staff list before you try again: the account may have been created.";
    default:
      return "Something went wrong. Check the staff list before you try again: the account may have been created.";
  }
}

/** The notice after an account is created, from the account the server sent back. */
export function createdStaffMessage(staff: StaffAccount): string {
  return `Staff account created for ${staff.displayName} (${staff.email}).`;
}

/**
 * The message for a refused permissions change. Null for signed_out. A repeat of the same list
 * is harmless (the server replaces the list), so a network or server failure says to try again.
 */
export function permissionsMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "not_found":
      return "This staff account was not found. Reload the page.";
    case "invalid_input":
      return "The permissions were refused. Reload the page and try again.";
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

/** The notice after a change, from the account the server sent back. */
export function savedPermissionsMessage(staff: StaffAccount): string {
  return `Permissions saved for ${staff.displayName}: ${permissionCount(staff.permissions.length).toLowerCase()}.`;
}

/** "None", "1 permission", "5 permissions". */
export function permissionCount(n: number): string {
  if (n === 0) return "None";
  return `${n} ${n === 1 ? "permission" : "permissions"}`;
}

/** The tick boxes for the permissions Staff may hold, in table order. */
function PermissionGrid({ value, onToggle }: { value: string[]; onToggle(key: string): void }) {
  return (
    <div className="permission-grid">
      <b>Permissions</b>
      {STAFF_PERMISSIONS.map((p) => (
        <label key={p.key}>
          <input
            type="checkbox"
            name="permission"
            value={p.key}
            checked={value.includes(p.key)}
            onChange={() => onToggle(p.key)}
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}

interface StaffFormProps {
  api: Pick<Api, "createStaff">;
  /** Called with the notice to show. */
  onSaved(message: string): void;
  onCancel(): void;
}

/** Add a staff account: full name, email, password twice, and the permissions (none ticked). */
function StaffForm({ api, onSaved, onCancel }: StaffFormProps) {
  const [form, setForm] = useState<StaffFormInput>(BLANK_STAFF);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setForm({ ...form, permissions: toggled(form.permissions, key) });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = checkNewStaff(form);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.createStaff(checked.value);
    if (result.ok) {
      onSaved(createdStaffMessage(result.staff));
      return;
    }
    setBusy(false);
    const message = staffMessage(result);
    if (message !== null) setError(message);
  }

  return (
    <form className="form staff-form" onSubmit={submit}>
      <h2 className="form-title">Create staff account</h2>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Full name</span>
          <input
            type="text"
            name="displayName"
            maxLength={STAFF_NAME_MAX}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="off"
            maxLength={STAFF_EMAIL_MAX}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label className="field">
          <span>
            Password ({PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters)
          </span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </label>
        <PermissionGrid value={form.permissions} onToggle={toggle} />
      </fieldset>
      {error && (
        <em role="alert" className="error">
          {error}
        </em>
      )}
      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Creating…" : "Create staff account"}
        </button>
      </div>
    </form>
  );
}

interface PermissionsFormProps {
  api: Pick<Api, "setStaffPermissions">;
  staff: StaffAccount;
  /** Called with the notice to show. */
  onSaved(message: string): void;
  onCancel(): void;
}

/** Change one account's permissions: the grid opens with what the account holds now. */
function PermissionsForm({ api, staff, onSaved, onCancel }: PermissionsFormProps) {
  const [permissions, setPermissions] = useState<string[]>(staff.permissions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleaned = cleanPermissions(permissions);
    if (cleaned === null) {
      setError(UNKNOWN_PERMISSION);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.setStaffPermissions(staff.id, cleaned);
    if (result.ok) {
      onSaved(savedPermissionsMessage(result.value));
      return;
    }
    setBusy(false);
    const message = permissionsMessage(result.reason);
    if (message !== null) setError(message);
  }

  return (
    <form className="form staff-form" onSubmit={submit}>
      <h2 className="form-title">Permissions for {staff.displayName}</h2>
      <p className="panel-note">{staff.email}. The change applies from the account's next request.</p>
      <fieldset disabled={busy}>
        <PermissionGrid value={permissions} onToggle={(key) => setPermissions(toggled(permissions, key))} />
      </fieldset>
      {error && (
        <em role="alert" className="error">
          {error}
        </em>
      )}
      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Saving…" : "Save permissions"}
        </button>
      </div>
    </form>
  );
}

/** What is open above the list: nothing, the add staff form or one account's permissions. */
type Panel = { kind: "none" } | { kind: "add" } | { kind: "permissions"; staff: StaffAccount };

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; staff: StaffAccount[] }
  | { kind: "failed"; message: string | null };

export interface StaffProps {
  api: Pick<Api, "listStaff" | "createStaff" | "setStaffPermissions">;
}

/**
 * The list loads on open, oldest account first as the server sends it. One form is open at a
 * time; the row buttons show only when none is. After a save, the form closes, a notice shows
 * and the list is read again.
 */
export default function Staff({ api }: StaffProps) {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [notice, setNotice] = useState<string | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let active = true;
    api.listStaff().then((result) => {
      if (!active) return;
      setList(
        result.ok
          ? { kind: "loaded", staff: result.value }
          : { kind: "failed", message: staffListMessage(result.reason) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, reads]);

  function saved(message: string) {
    setPanel({ kind: "none" });
    setNotice(message);
    setList({ kind: "loading" });
    setReads((n) => n + 1);
  }

  return (
    <>
      <div className="title">
        <div>
          <h1>Staff &amp; access</h1>
          <p>Create staff logins and assign permissions</p>
        </div>
        {panel.kind === "none" && (
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              setNotice(null);
              setPanel({ kind: "add" });
            }}
          >
            + Add staff
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {panel.kind === "add" && (
        <StaffForm api={api} onSaved={saved} onCancel={() => setPanel({ kind: "none" })} />
      )}
      {panel.kind === "permissions" && (
        <PermissionsForm
          key={panel.staff.id}
          api={api}
          staff={panel.staff}
          onSaved={saved}
          onCancel={() => setPanel({ kind: "none" })}
        />
      )}
      <section className="panel">
        <h2>Staff accounts</h2>
        {list.kind === "loading" && <p className="panel-note">Loading…</p>}
        {list.kind === "failed" && list.message && (
          <em role="alert" className="error panel-note">
            {list.message}
          </em>
        )}
        {list.kind === "loaded" && list.staff.length === 0 && (
          <p className="panel-note">No staff accounts yet.</p>
        )}
        {list.kind === "loaded" && list.staff.length > 0 && (
          <div className="table-wrap">
            <table className="staff">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.staff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.displayName}</td>
                    <td>{s.email}</td>
                    <td>
                      {s.isActive ? (
                        <span className="pill">Active</span>
                      ) : (
                        <span className="status-inactive">Inactive</span>
                      )}
                    </td>
                    <td>{permissionCount(s.permissions.length)}</td>
                    <td>{formatDate(s.createdAt)}</td>
                    <td className="row-actions">
                      {panel.kind === "none" && (
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Change permissions for ${s.displayName}`}
                          onClick={() => {
                            setNotice(null);
                            setPanel({ kind: "permissions", staff: s });
                          }}
                        >
                          Permissions
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
