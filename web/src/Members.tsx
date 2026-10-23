// Members list and add member (U.3e, R-01, R-02). Search by name or Membership ID runs in the
// browser over the list the server sent (A-191 item 2). The server checks every field again.
import { useEffect, useState, type FormEvent } from "react";
import type { Api, CallFailure, Member, MemberStatusFilter, NewMember } from "./api.ts";

// The server's limits (server/src/members.ts). The server checks again.
export const FULL_NAME_MAX = 100;
export const MEMBER_TEXT_MAX = 200;

export const FILTERS: { value: MemberStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

/** Members whose name or Membership ID contains the search text, ignoring case. */
export function searchMembers(members: Member[], search: string): Member[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return members;
  return members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(needle) || m.membershipId.toLowerCase().includes(needle),
  );
}

/** A message for the new member's fields, or null if they may be sent. */
export function checkNewMember(input: NewMember): string | null {
  const fullName = input.fullName.trim();
  if (fullName.length === 0 || fullName.length > FULL_NAME_MAX) {
    return `The full name must be 1 to ${FULL_NAME_MAX} characters.`;
  }
  for (const value of [input.phone, input.address, input.occupation]) {
    if (value.trim().length > MEMBER_TEXT_MAX) {
      return `Phone, address and occupation may have at most ${MEMBER_TEXT_MAX} characters each.`;
    }
  }
  return null;
}

/** The message for a failed member call. Null for signed_out: the sign-in screen already shows. */
export function memberMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to do this.";
    case "invalid_input":
      return "The member details were refused. Check the fields and try again.";
    case "not_found":
      return "Member not found.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

const EMPTY: NewMember = { fullName: "", phone: "", address: "", occupation: "" };

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; members: Member[] }
  | { kind: "failed"; message: string | null };

export interface MembersProps {
  api: Pick<Api, "listMembers" | "createMember">;
  canCreate: boolean;
}

export default function Members({ api, canCreate }: MembersProps) {
  const [filter, setFilter] = useState<MemberStatusFilter>("active");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listMembers(filter).then((result) => {
      if (!active) return;
      setList(
        result.ok
          ? { kind: "loaded", members: result.value }
          : { kind: "failed", message: memberMessage(result.reason) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, filter, reload]);

  function changeFilter(next: MemberStatusFilter) {
    if (next === filter) return;
    setList({ kind: "loading" });
    setFilter(next);
  }

  function added(member: Member) {
    setShowForm(false);
    setNotice(`${member.fullName} was added as ${member.membershipId}.`);
    setList({ kind: "loading" });
    setReload((n) => n + 1);
  }

  const rows = list.kind === "loaded" ? searchMembers(list.members, search) : [];
  const filterLabel = FILTERS.find((f) => f.value === filter)?.label ?? "";

  return (
    <>
      <div className="title">
        <div>
          <h1>Members</h1>
          <p>Manage cooperative members</p>
        </div>
        {canCreate && !showForm && (
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              setNotice(null);
              setShowForm(true);
            }}
          >
            + Add member
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {showForm && (
        <AddMemberForm api={api} onAdded={added} onCancel={() => setShowForm(false)} />
      )}
      <div className="member-toolbar">
        <input
          type="search"
          className="search"
          aria-label="Search by name or Membership ID"
          placeholder="Search by name or Membership ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={filter === f.value ? "filter-active" : ""}
              aria-pressed={filter === f.value}
              onClick={() => changeFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <section className="panel">
        <h2>
          {list.kind === "loaded"
            ? `${rows.length} ${filter === "all" ? "" : filterLabel.toLowerCase() + " "}members`
            : "Members"}
        </h2>
        {list.kind === "loading" && <p className="panel-note">Loading…</p>}
        {list.kind === "failed" && list.message && (
          <em role="alert" className="error panel-note">
            {list.message}
          </em>
        )}
        {list.kind === "loaded" && rows.length === 0 && (
          <p className="panel-note">No members found.</p>
        )}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Membership ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.membershipId}</td>
                    <td>
                      <b>{m.fullName}</b>
                    </td>
                    <td>{m.phone}</td>
                    <td>
                      <span className={m.status === "ACTIVE" ? "pill" : "status-inactive"}>
                        {m.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
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

interface AddMemberFormProps {
  api: Pick<Api, "createMember">;
  onAdded(member: Member): void;
  onCancel(): void;
}

function AddMemberForm({ api, onAdded, onCancel }: AddMemberFormProps) {
  const [form, setForm] = useState<NewMember>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkNewMember(form);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.createMember({
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      occupation: form.occupation.trim(),
    });
    if (result.ok) {
      onAdded(result.value);
      return;
    }
    setBusy(false);
    const message = memberMessage(result.reason);
    if (message !== null) setError(message);
  }

  const field = (key: keyof NewMember, label: string, max: number, required = false) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        name={key}
        required={required}
        maxLength={max}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className="form member-form" onSubmit={submit}>
      <h2 className="form-title">Add member</h2>
      {field("fullName", "Full name", FULL_NAME_MAX, true)}
      {field("phone", "Phone number", MEMBER_TEXT_MAX)}
      {field("address", "Address", MEMBER_TEXT_MAX)}
      {field("occupation", "Occupation", MEMBER_TEXT_MAX)}
      <p className="form-note">New members are Active. The Membership ID is given by the system.</p>
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
          {busy ? "Saving…" : "Save member"}
        </button>
      </div>
    </form>
  );
}
