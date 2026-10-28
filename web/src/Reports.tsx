// Categories report page (7.6b, R-17): GET /reports/categories for a day range, for the holder of
// `reports.view`. Read-only. The server sums every figure and scopes Staff to their own records
// (DR-13); the browser shows the amounts as sent (A-18) and does no money sums. The holder of
// `users.manage` may pick one staff member's records; the names come from GET /staff (A-243 item 3).
// Title and subtitle from legacy-prototype/src/App.jsx (Categories), with the server's rows (A-244).
import { useEffect, useState, type FormEvent } from "react";
import { actorNames } from "./Audit.tsx";
import { startStaffId } from "./Dashboard.tsx";
import type { Api, CallFailure, CategoryReport, CategoryReportQuery, StaffAccount, User } from "./api.ts";
import { formatDay, formatNaira, isCalendarDay } from "./Members.tsx";

/** What the filter form holds, as typed. "" means no bound, or everyone the user may see. */
export interface ReportFilterInput {
  fromDay: string;
  toDay: string;
  staffId: string;
}

export const NO_REPORT_FILTER: ReportFilterInput = { fromDay: "", toDay: "", staffId: "" };

/** Checks the days in the server's order (from day, to day, range) and gives the query, or a message. */
export function checkReportFilter(
  input: ReportFilterInput,
): { ok: true; value: CategoryReportQuery } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  if (input.fromDay !== "" && !isCalendarDay(input.fromDay)) return refuse("Enter a real From day.");
  if (input.toDay !== "" && !isCalendarDay(input.toDay)) return refuse("Enter a real To day.");
  if (input.fromDay !== "" && input.toDay !== "" && input.fromDay > input.toDay) {
    return refuse("The From day cannot be after the To day.");
  }
  return {
    ok: true,
    value: {
      ...(input.fromDay !== "" ? { fromDay: input.fromDay } : {}),
      ...(input.toDay !== "" ? { toDay: input.toDay } : {}),
      ...(input.staffId !== "" ? { createdById: input.staffId } : {}),
    },
  };
}

/** The message for a failed read. Null for signed_out: the sign-in screen already shows. */
export function reportMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "invalid_input":
      return "The days or staff filter were refused. Press Clear and try again.";
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

/** The range the server used, in words. A null day is no bound. */
export function reportRange(fromDay: string | null, toDay: string | null): string {
  if (fromDay === null && toDay === null) return "All days";
  if (fromDay === null) return `Up to ${formatDay(toDay as string)}`;
  if (toDay === null) return `From ${formatDay(fromDay)}`;
  return `${formatDay(fromDay)} to ${formatDay(toDay)}`;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "loaded"; report: CategoryReport }
  | { kind: "failed"; message: string | null };

export interface ReportsProps {
  api: Pick<Api, "getCategoryReport" | "listStaff">;
  me: User;
  /** users.manage (the Super Admin alone, D-25): read the staff list and offer the staff filter. */
  canFilterStaff: boolean;
}

/**
 * The first read sends no days, so the report covers all days. "Apply" sends the days and the
 * staff filter; "Clear" goes back to all days and the start staff (D-110 item 3). The staff list
 * is read once; if it fails, there is no staff filter and the page goes back to everyone (as the
 * Dashboard, A-241 item 3, A-276).
 */
export default function Reports({ api, me, canFilterStaff }: ReportsProps) {
  const [startStaff, setStartStaff] = useState(() => startStaffId(me, canFilterStaff));
  const [form, setForm] = useState<ReportFilterInput>(() => ({ ...NO_REPORT_FILTER, staffId: startStaff }));
  const [query, setQuery] = useState<CategoryReportQuery>(() =>
    startStaff !== "" ? { createdById: startStaff } : {},
  );
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
      setQuery((q) => ({
        ...(q.fromDay !== undefined ? { fromDay: q.fromDay } : {}),
        ...(q.toDay !== undefined ? { toDay: q.toDay } : {}),
      }));
    });
    return () => {
      active = false;
    };
  }, [api, canFilterStaff]);

  useEffect(() => {
    let active = true;
    api.getCategoryReport(query).then((result) => {
      if (!active) return;
      setView(
        result.ok
          ? { kind: "loaded", report: result.value }
          : { kind: "failed", message: reportMessage(result.reason) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, query]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const checked = checkReportFilter(form);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setView({ kind: "loading" });
    setQuery(checked.value);
  }

  function clear() {
    setForm({ ...NO_REPORT_FILTER, staffId: startStaff });
    setError(null);
    setView({ kind: "loading" });
    setQuery(startStaff !== "" ? { createdById: startStaff } : {});
  }

  const report = view.kind === "loaded" ? view.report : null;

  return (
    <>
      <div className="title">
        <div>
          <h1>Categories</h1>
          <p>Contribution category totals</p>
        </div>
      </div>
      <form className="form report-filters" onSubmit={apply}>
        <label className="field">
          <span>From day</span>
          <input
            type="date"
            name="fromDay"
            value={form.fromDay}
            onChange={(e) => setForm({ ...form, fromDay: e.target.value })}
          />
        </label>
        <label className="field">
          <span>To day</span>
          <input
            type="date"
            name="toDay"
            value={form.toDay}
            onChange={(e) => setForm({ ...form, toDay: e.target.value })}
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
      {report && (
        <>
          <p className="form-note">
            {reportRange(report.fromDay, report.toDay)}. Paid is the total of payment lines; paid out is what
            pay-offs returned. Paid out is shown beside paid, not taken off it.
          </p>
          <section className="panel">
            <div className="table-wrap">
              <table className="category-report">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Refundable</th>
                    <th>Paid</th>
                    <th>Paid out</th>
                  </tr>
                </thead>
                <tbody>
                  {report.categories.map((r) => (
                    <tr key={r.category}>
                      <td>{r.category}</td>
                      <td>{r.refundable ? "Yes" : "No"}</td>
                      <td className="amount">{formatNaira(r.paid)}</td>
                      <td className="amount">{formatNaira(r.paidOut)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td></td>
                    <td className="amount">{formatNaira(report.totalPaid)}</td>
                    <td className="amount">{formatNaira(report.totalPaidOut)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
