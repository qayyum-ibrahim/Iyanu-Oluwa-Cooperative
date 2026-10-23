// Expenses page (U.6c, R-10, R-11): the list with filters for category, method and days spent,
// newest first, and the total. The server filters, scopes Staff to the expenses they recorded
// (DR-13) and sums the total; the browser shows the total as sent (A-18) and does no money sums.
// Record, edit and delete come in U.6d.
import { useEffect, useState, type FormEvent } from "react";
import type { Api, CallFailure, ExpenseFilter, ExpenseList, PaymentMethod } from "./api.ts";
import { METHOD_LABELS, formatDay, formatNaira, isCalendarDay } from "./Members.tsx";

/**
 * The expense categories in the order of DR-11, copied from server/src/expense-categories.ts
 * (A-191 item 5). The filter offers all of them, Loan and Membership Withdrawal too.
 */
export const EXPENSE_CATEGORIES = [
  "Loan",
  "Expenses",
  "Allowances",
  "Members Credit",
  "Membership Withdrawal",
  "Asset Purchase",
  "Office Maintenance",
  "Payment to Union",
  "Payment to Apexes",
  "Others",
] as const;

/** What the filter form holds, as typed. "" means no filter on that field. */
export interface ExpenseFilterInput {
  category: string;
  method: PaymentMethod | "";
  fromDay: string;
  toDay: string;
}

export const NO_FILTER: ExpenseFilterInput = { category: "", method: "", fromDay: "", toDay: "" };

/**
 * Checks the filters in the server's order (category, method, from day, to day, range) and
 * gives the query to send, or a message. The server checks again.
 */
export function checkExpenseFilter(
  input: ExpenseFilterInput,
): { ok: true; value: ExpenseFilter } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  if (input.category !== "" && !(EXPENSE_CATEGORIES as readonly string[]).includes(input.category)) {
    return refuse("Choose a category from the list.");
  }
  if (input.fromDay !== "" && !isCalendarDay(input.fromDay)) return refuse("Enter a real From day.");
  if (input.toDay !== "" && !isCalendarDay(input.toDay)) return refuse("Enter a real To day.");
  if (input.fromDay !== "" && input.toDay !== "" && input.fromDay > input.toDay) {
    return refuse("The From day cannot be after the To day.");
  }
  return {
    ok: true,
    value: {
      ...(input.category !== "" ? { category: input.category } : {}),
      ...(input.method !== "" ? { method: input.method } : {}),
      ...(input.fromDay !== "" ? { fromDay: input.fromDay } : {}),
      ...(input.toDay !== "" ? { toDay: input.toDay } : {}),
    },
  };
}

/** The message for a failed expense list. Null for signed_out: the sign-in screen already shows. */
export function expenseListMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to do this.";
    case "invalid_input":
      return "The filters were refused. Check the days and try again.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

/** "1 expense", "3 expenses". */
export function expenseCount(n: number): string {
  return `${n} ${n === 1 ? "expense" : "expenses"}`;
}

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; list: ExpenseList }
  | { kind: "failed"; message: string | null };

export interface ExpensesProps {
  api: Pick<Api, "listExpenses">;
}

/**
 * The list loads with no filters. "Apply" sends the filters, "Clear" empties them and loads the
 * full list again. Rows are newest first: the server sends oldest first by day spent, then time
 * recorded (D-94), and the page reverses them, as member detail does for payments and loans.
 */
export default function Expenses({ api }: ExpensesProps) {
  const [form, setForm] = useState<ExpenseFilterInput>(NO_FILTER);
  const [query, setQuery] = useState<ExpenseFilter>({});
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listExpenses(query).then((result) => {
      if (!active) return;
      setList(
        result.ok
          ? { kind: "loaded", list: result.value }
          : { kind: "failed", message: expenseListMessage(result.reason) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, query]);

  function apply(event: FormEvent) {
    event.preventDefault();
    const checked = checkExpenseFilter(form);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setList({ kind: "loading" });
    setQuery(checked.value);
  }

  function clear() {
    setForm(NO_FILTER);
    setError(null);
    setList({ kind: "loading" });
    setQuery({});
  }

  const rows = list.kind === "loaded" ? list.list.expenses.slice().reverse() : [];

  return (
    <>
      <div className="title">
        <div>
          <h1>Expenses</h1>
          <p>Track cooperative expenditure</p>
        </div>
      </div>
      <form className="form expense-filters" onSubmit={apply}>
        <label className="field">
          <span>Category</span>
          <select
            name="category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Payment method</span>
          <select
            name="method"
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod | "" })}
          >
            <option value="">All methods</option>
            <option value="BANK_TRANSFER">{METHOD_LABELS.BANK_TRANSFER}</option>
            <option value="CASH">{METHOD_LABELS.CASH}</option>
          </select>
        </label>
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
      <section className="panel">
        <h2>Expense history</h2>
        {list.kind === "loading" && <p className="panel-note">Loading…</p>}
        {list.kind === "failed" && list.message && (
          <em role="alert" className="error panel-note">
            {list.message}
          </em>
        )}
        {list.kind === "loaded" && (
          <div className="expense-total">
            <span>{expenseCount(rows.length)}</span>
            <b>Total {formatNaira(list.list.total)}</b>
          </div>
        )}
        {list.kind === "loaded" && rows.length === 0 && (
          <p className="panel-note">No expenses found.</p>
        )}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="expenses">
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
                {rows.map((e) => (
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
  );
}
