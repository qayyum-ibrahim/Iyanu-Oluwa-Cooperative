// Dashboard page (7.5b, R-15, R-16): GET /dashboard for one Lagos month, for the holder of
// `dashboard`. Read-only. The server sums every figure and scopes Staff to their own records
// (DR-13); the browser shows the amounts as sent (A-18) and does no money sums. The Super Admin
// may pick one staff member's records; the names come from GET /staff (A-241 item 3).
// Card labels from legacy-prototype/src/App.jsx (Dashboard), with the server's figures (A-242).
// Total Outflow cards: every outflow, Loan and Membership Withdrawal included (D-106, D-107).
import { useEffect, useState, type FormEvent } from "react";
import { actorNames } from "./Audit.tsx";
import type { Api, CallFailure, Dashboard as DashboardView, DashboardQuery, StaffAccount, User } from "./api.ts";
import { METHOD_LABELS, formatDay, formatNaira, lagosToday } from "./Members.tsx";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MONTH_INPUT = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** This month in Lagos, "YYYY-MM". */
export function lagosMonth(now: Date = new Date()): string {
  return lagosToday(now).slice(0, 7);
}

/** "2026-10" gives "Oct 2026". Other text is shown as it came. */
export function formatMonth(month: string): string {
  const match = MONTH_INPUT.exec(month);
  if (match === null) return month;
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/** What the filter form holds, as typed. staffId "" means everyone the user may see. */
export interface DashboardFilterInput {
  month: string;
  staffId: string;
}

/** Checks the month (the server checks again) and gives the query to send, or a message. */
export function checkDashboardFilter(
  input: DashboardFilterInput,
): { ok: true; value: DashboardQuery } | { ok: false; message: string } {
  if (input.month === "") return { ok: false, message: "Choose a month." };
  if (!MONTH_INPUT.test(input.month)) return { ok: false, message: "Enter a real month." };
  return {
    ok: true,
    value: { month: input.month, ...(input.staffId !== "" ? { createdById: input.staffId } : {}) },
  };
}

/**
 * The staff filter a page starts on and Clear goes back to: the signed-in user when the filter is
 * offered, else everyone (D-110 item 3). "All staff" stays a choice.
 */
export function startStaffId(me: User, canFilterStaff: boolean): string {
  return canFilterStaff ? me.id : "";
}

/** The message for a failed read. Null for signed_out: the sign-in screen already shows. */
export function dashboardMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "invalid_input":
      return "The month or staff filter was refused. Press Clear and try again.";
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

/** The cards in order: label and amount (or count) as the server sent it. */
export function dashboardCards(d: DashboardView): { label: string; value: string }[] {
  const month = formatMonth(d.month);
  return [
    { label: "Active Members", value: String(d.activeMembers) },
    { label: `Income · ${month}`, value: formatNaira(d.income.month) },
    { label: "Income · All Time", value: formatNaira(d.income.allTime) },
    { label: `Total Expenditures · ${month}`, value: formatNaira(d.expenditure.month) },
    { label: "Total Expenditures · All Time", value: formatNaira(d.expenditure.allTime) },
    { label: "Outstanding Loans", value: formatNaira(d.outstandingLoans) },
    { label: `Withdrawals · ${month}`, value: formatNaira(d.membershipWithdrawal.month) },
    { label: "Withdrawals · All Time", value: formatNaira(d.membershipWithdrawal.allTime) },
    { label: `Total Outflow · ${month}`, value: formatNaira(d.totalOutflow.month) },
    { label: "Total Outflow · All Time", value: formatNaira(d.totalOutflow.allTime) },
  ];
}

type ViewState =
  | { kind: "loading" }
  | { kind: "loaded"; dashboard: DashboardView }
  | { kind: "failed"; message: string | null };

export interface DashboardProps {
  api: Pick<Api, "getDashboard" | "listStaff">;
  me: User;
  /** users.manage (the Super Admin alone, D-25): read the staff list and offer the staff filter. */
  canFilterStaff: boolean;
}

/**
 * The first read sends no month, so the server gives this Lagos month; the picker starts there.
 * "Apply" sends the month and the staff filter; "Clear" goes back to this month and the start staff.
 * The staff list is read once; if it fails, there is no staff filter (A-241 item 3) and the page
 * goes back to everyone, so no hidden filter stays (A-276).
 */
export default function Dashboard({ api, me, canFilterStaff }: DashboardProps) {
  const [startStaff, setStartStaff] = useState(() => startStaffId(me, canFilterStaff));
  const [form, setForm] = useState<DashboardFilterInput>(() => ({ month: lagosMonth(), staffId: startStaff }));
  const [query, setQuery] = useState<DashboardQuery>(() => (startStaff !== "" ? { createdById: startStaff } : {}));
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);

  useEffect(() => {
    if (!canFilterStaff) return;
    let active = true;
    api.listStaff().then((result) => {
      if (!active) return;
      if (result.ok) {
        setStaff(result.value);
        return;
      }
      setStartStaff("");
      setForm((f) => ({ ...f, staffId: "" }));
      setView({ kind: "loading" });
      setQuery((q) => (q.month !== undefined ? { month: q.month } : {}));
    });
    return () => {
      active = false;
    };
  }, [api, canFilterStaff]);

  useEffect(() => {
    let active = true;
    api.getDashboard(query).then((result) => {
      if (!active) return;
      setView(
        result.ok
          ? { kind: "loaded", dashboard: result.value }
          : { kind: "failed", message: dashboardMessage(result.reason) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, query]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const checked = checkDashboardFilter(form);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setView({ kind: "loading" });
    setQuery(checked.value);
  }

  function clear() {
    setForm({ month: lagosMonth(), staffId: startStaff });
    setError(null);
    setView({ kind: "loading" });
    setQuery(startStaff !== "" ? { createdById: startStaff } : {});
  }

  const dashboard = view.kind === "loaded" ? view.dashboard : null;

  return (
    <>
      <div className="title">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of cooperative activity, income and expenditure</p>
        </div>
      </div>
      <form className="form dashboard-filters" onSubmit={apply}>
        <label className="field">
          <span>Month</span>
          <input
            type="month"
            name="month"
            value={form.month}
            onChange={(e) => setForm({ ...form, month: e.target.value })}
          />
        </label>
        {staff !== null && (
          <label className="field">
            <span>Staff</span>
            <select
              name="staffId"
              value={form.staffId}
              onChange={(e) => setForm({ ...form, staffId: e.target.value })}
            >
              <option value="">All staff</option>
              {[...actorNames(me, staff)].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <em role="alert" className="error">
            {error}
          </em>
        )}
        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={clear}>
            Clear
          </button>
          <button type="submit" className="primary-btn">
            Apply
          </button>
        </div>
      </form>
      {view.kind === "loading" && <p className="panel-note">Loading…</p>}
      {view.kind === "failed" && view.message && (
        <em role="alert" className="error">
          {view.message}
        </em>
      )}
      {dashboard && (
        <>
          <p className="form-note">
            {formatDay(dashboard.fromDay)} to {formatDay(dashboard.toDay)}. Total Expenditures is the
            running costs only. Total Outflow is all money going out: running costs, loans given and
            Membership Withdrawals. Income counts every payment line.
          </p>
          <div className="cards">
            {dashboardCards(dashboard).map((c) => (
              <div key={c.label} className="card">
                <span>{c.label}</span>
                <b>{c.value}</b>
              </div>
            ))}
          </div>
          <section className="panel">
            <h2>Recent expenses</h2>
            {dashboard.recentExpenses.length === 0 && (
              <p className="panel-note">No expenses this month.</p>
            )}
            {dashboard.recentExpenses.length > 0 && (
              <div className="table-wrap">
                <table className="recent-expenses">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentExpenses.map((e) => (
                      <tr key={e.id}>
                        <td>{formatDay(e.spentOn)}</td>
                        <td>{e.category}</td>
                        <td>{[e.description, e.narration].filter((t) => t !== "").join(" · ") || "—"}</td>
                        <td className="amount">{formatNaira(e.amount)}</td>
                        <td>{METHOD_LABELS[e.method]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
