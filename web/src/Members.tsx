// Members list and add member (U.3e, R-01, R-02), member detail (U.3f, R-36). Search by name or
// Membership ID runs in the browser over the list the server sent (A-191 item 2). The server
// checks every field again. Amounts stay the naira strings the server sent (A-18); the browser
// only adds the naira sign and thousands commas, and does no sums.
import { useEffect, useState, type FormEvent } from "react";
import type {
  Api,
  CallFailure,
  CallResult,
  Loan,
  Member,
  MemberBalances,
  MemberStatusFilter,
  NewMember,
  Payment,
  PaymentMethod,
} from "./api.ts";

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

/** "25000.05" gives "₦25,000.05". Text of any other shape is shown as it came. */
export function formatNaira(amount: string): string {
  const match = /^(\d+)\.(\d{2})$/.exec(amount);
  if (match === null) return amount;
  const naira = match[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${naira}.${match[2]}`;
}

const LAGOS_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** The day in Lagos (A-201), for example "23 Oct 2026". Text that is not a time is shown as it came. */
export function formatDate(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : LAGOS_DATE.format(time);
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
};

const EMPTY: NewMember = { fullName: "", phone: "", address: "", occupation: "" };

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; members: Member[] }
  | { kind: "failed"; message: string | null };

type DetailApi = Pick<Api, "getMember" | "memberBalances" | "listPayments" | "listLoans">;

export interface MembersProps {
  api: Pick<Api, "listMembers" | "createMember"> & DetailApi;
  canCreate: boolean;
  canViewPayments: boolean;
  canViewLoans: boolean;
}

export default function Members({ api, canCreate, canViewPayments, canViewLoans }: MembersProps) {
  const [filter, setFilter] = useState<MemberStatusFilter>("active");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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

  if (openId !== null) {
    return (
      <MemberDetail
        key={openId}
        api={api}
        id={openId}
        canViewPayments={canViewPayments}
        canViewLoans={canViewLoans}
        onBack={() => setOpenId(null)}
      />
    );
  }

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
                  <th>Action</th>
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
                    <td>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`View ${m.fullName}`}
                        onClick={() => {
                          setNotice(null);
                          setOpenId(m.id);
                        }}
                      >
                        View
                      </button>
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

type Section<T> =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "loaded"; value: T }
  | { kind: "failed"; message: string | null };

function sectionOf<T>(result: CallResult<T>): Section<T> {
  return result.ok
    ? { kind: "loaded", value: result.value }
    : { kind: "failed", message: memberMessage(result.reason) };
}

/** Loading, or the message of a failed read, for a section that is not loaded. */
function SectionNote({ section }: { section: Section<unknown> }) {
  if (section.kind === "loading") return <p className="panel-note">Loading…</p>;
  if (section.kind === "failed" && section.message) {
    return (
      <em role="alert" className="error panel-note">
        {section.message}
      </em>
    );
  }
  return null;
}

interface MemberDetailProps {
  api: DetailApi;
  id: string;
  canViewPayments: boolean;
  canViewLoans: boolean;
  onBack(): void;
}

/**
 * One member: profile, balances (D-86), loans and payments (U.3f). The payments and loans
 * sections show only with payments.view and loans.view (A-201). Pay-offs are not listed: there is
 * no pay-off read (A-186); the balances already take them off.
 */
function MemberDetail({ api, id, canViewPayments, canViewLoans, onBack }: MemberDetailProps) {
  const [member, setMember] = useState<Section<Member>>({ kind: "loading" });
  const [balances, setBalances] = useState<Section<MemberBalances>>({ kind: "loading" });
  const [payments, setPayments] = useState<Section<Payment[]>>(
    canViewPayments ? { kind: "loading" } : { kind: "hidden" },
  );
  const [loans, setLoans] = useState<Section<Loan[]>>(
    canViewLoans ? { kind: "loading" } : { kind: "hidden" },
  );

  useEffect(() => {
    let active = true;
    const show =
      <T,>(set: (section: Section<T>) => void) =>
      (result: CallResult<T>) => {
        if (active) set(sectionOf(result));
      };
    api.getMember(id).then(show(setMember));
    api.memberBalances(id).then(show(setBalances));
    if (canViewPayments) api.listPayments(id).then(show(setPayments));
    if (canViewLoans) api.listLoans(id).then(show(setLoans));
    return () => {
      active = false;
    };
  }, [api, id, canViewPayments, canViewLoans]);

  const back = (
    <button type="button" className="secondary back" onClick={onBack}>
      ← Back to members
    </button>
  );

  if (member.kind !== "loaded") {
    return (
      <>
        {back}
        <SectionNote section={member} />
      </>
    );
  }

  const m = member.value;
  const onLoan = loans.kind === "loaded" && loans.value.some((l) => l.status === "ACTIVE");
  const orDash = (text: string) => (text === "" ? "—" : text);

  return (
    <>
      {back}
      <div className="title">
        <div>
          <h1>{m.fullName}</h1>
          <p>
            {m.membershipId} · Joined {formatDate(m.createdAt)}
          </p>
        </div>
        <div className="badges">
          <span className={m.status === "ACTIVE" ? "pill" : "status-inactive"}>
            {m.status === "ACTIVE" ? "Active" : "Inactive"}
          </span>
          {onLoan && <span className="loan">On loan</span>}
        </div>
      </div>

      <section className="panel detail-panel">
        <h2>Profile</h2>
        <dl className="profile">
          <dt>Phone</dt>
          <dd>{orDash(m.phone)}</dd>
          <dt>Address</dt>
          <dd>{orDash(m.address)}</dd>
          <dt>Occupation</dt>
          <dd>{orDash(m.occupation)}</dd>
        </dl>
      </section>

      <section className="panel detail-panel">
        <h2>Balances</h2>
        <SectionNote section={balances} />
        {balances.kind === "loaded" && (
          <>
            <div className="balance-summary">
              <div>
                <span>Refundable total (paid out at pay-off)</span>
                <b>{formatNaira(balances.value.refundableTotal)}</b>
              </div>
              <div>
                <span>Retained by cooperative</span>
                <b>{formatNaira(balances.value.nonRefundableTotal)}</b>
              </div>
            </div>
            <div className="table-wrap">
              <table className="balances">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Balance</th>
                    <th>Refundable</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.value.categories.map((c) => (
                    <tr key={c.category}>
                      <td>{c.category}</td>
                      <td className="amount">{formatNaira(c.balance)}</td>
                      <td>{c.refundable ? "Yes" : "No, retained"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {loans.kind !== "hidden" && (
        <section className="panel detail-panel">
          <h2>Loans</h2>
          <SectionNote section={loans} />
          {loans.kind === "loaded" && loans.value.length === 0 && (
            <p className="panel-note">No loans.</p>
          )}
          {loans.kind === "loaded" && loans.value.length > 0 && (
            <div className="table-wrap">
              <table className="loans">
                <thead>
                  <tr>
                    <th>Given</th>
                    <th>Principal</th>
                    <th>Repaid</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.value
                    .slice()
                    .reverse()
                    .map((l) => (
                      <tr key={l.id}>
                        <td>{formatDate(l.createdAt)}</td>
                        <td className="amount">{formatNaira(l.principal)}</td>
                        <td className="amount">{formatNaira(l.repaid)}</td>
                        <td className="amount">{formatNaira(l.outstanding)}</td>
                        <td>
                          <span className={l.status === "ACTIVE" ? "loan" : "pill"}>
                            {l.status === "ACTIVE" ? "Active" : "Fully repaid"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {payments.kind !== "hidden" && (
        <section className="panel detail-panel">
          <h2>Payments</h2>
          <SectionNote section={payments} />
          {payments.kind === "loaded" && payments.value.length === 0 && (
            <p className="panel-note">No payments yet.</p>
          )}
          {payments.kind === "loaded" && payments.value.length > 0 && (
            <div className="table-wrap">
              <table className="payments">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Breakdown</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.value
                    .slice()
                    .reverse()
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{formatDate(p.createdAt)}</td>
                        <td>{METHOD_LABELS[p.method]}</td>
                        <td>
                          {p.lines.map((l) => `${l.category} ${formatNaira(l.amount)}`).join(", ")}
                        </td>
                        <td className="amount">{formatNaira(p.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
