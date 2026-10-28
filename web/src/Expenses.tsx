// Expenses page (U.6c, R-10, R-11): the list with filters for category, method and days spent,
// newest first, and the total. The server filters, scopes Staff to the expenses they recorded
// (DR-13) and sums the total; the browser shows the total as sent (A-18) and does no money sums.
// Record an expense (U.6d, A-220). Edit and delete (U.6e, D-95, A-221): no buttons on Loan and
// Membership Withdrawal rows, as the system sets them; the server still refuses with a 409.
// Expenses are running costs only (D-106, D-107): the server lists no Loan or Membership
// Withdrawal row, and the category filter offers the running costs alone.
// One card per month of the day spent, newest month first (9.1g, D-110 item 2); no month subtotal.
import { useEffect, useState, type FormEvent } from "react";
import type {
  Api,
  CallFailure,
  CreateExpenseResult,
  DeleteExpenseResult,
  Expense,
  ExpenseFilter,
  ExpenseList,
  NewExpense,
  PaymentMethod,
  UpdateExpenseResult,
} from "./api.ts";
import { formatMonth } from "./Dashboard.tsx";
import {
  METHOD_LABELS,
  formatDay,
  formatNaira,
  isCalendarDay,
  koboToNaira,
  lagosToday,
  nairaToKobo,
  newIdempotencyKey,
} from "./Members.tsx";

/**
 * The expense categories in the order of DR-11, copied from server/src/expense-categories.ts
 * (A-191 item 5). The Exports page offers all of them; the Expenses page filter offers the running
 * costs only, MANUAL_EXPENSE_CATEGORIES below (D-107).
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
  if (input.category !== "" && !MANUAL_EXPENSE_CATEGORIES.includes(input.category)) {
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

export interface ExpenseMonth {
  /** "YYYY-MM" of the day spent. */
  month: string;
  expenses: Expense[];
}

/**
 * Groups the rows by the month of the day spent, as saved (a calendar day, D-94). Months come in
 * the order of their first row, and rows keep their order, so newest-first rows give the newest
 * month first.
 */
export function expenseMonths(rows: Expense[]): ExpenseMonth[] {
  const months: ExpenseMonth[] = [];
  const byMonth = new Map<string, ExpenseMonth>();
  for (const row of rows) {
    const month = row.spentOn.slice(0, 7);
    let group = byMonth.get(month);
    if (group === undefined) {
      group = { month, expenses: [] };
      byMonth.set(month, group);
      months.push(group);
    }
    group.expenses.push(row);
  }
  return months;
}

// Expense form helpers (U.6d, R-10). The form is ExpenseForm below.

/**
 * The categories a person may pick, in DR-11 order: all but Loan and Membership Withdrawal,
 * which the system sets (MANUAL_EXPENSE_CATEGORIES in server/src/expense-categories.ts). These are
 * the running costs, so the list filter offers them too (D-107).
 */
export const MANUAL_EXPENSE_CATEGORIES: readonly string[] = EXPENSE_CATEGORIES.filter(
  (c) => c !== "Loan" && c !== "Membership Withdrawal",
);

/** EXPENSE_TEXT_MAX in server/src/expenses.ts: the longest description or narration, after trimming. */
export const EXPENSE_TEXT_MAX = 200;

/** The one category that needs a narration (DR-11); every other one must leave it empty. */
export const OTHERS_CATEGORY = "Others";

/** What the expense form holds, as typed. category "" means none chosen yet. */
export interface ExpenseFormInput {
  spentOn: string;
  category: string;
  method: PaymentMethod;
  amount: string;
  description: string;
  narration: string;
}

/** The body fields ready to send, the amount as "15000.00" (A-18) and the texts trimmed. */
export type CheckedExpense = Omit<NewExpense, "idempotencyKey">;

/**
 * Checks the form in the server's order (category, day spent, amount, description, narration)
 * and gives the fields to send, or a message. `today` is the day in Lagos. The method comes from
 * a list of two, so it is not checked here. The server checks again.
 */
export function checkExpense(
  input: ExpenseFormInput,
  today: string,
): { ok: true; value: CheckedExpense } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  if (!MANUAL_EXPENSE_CATEGORIES.includes(input.category)) return refuse("Choose a category.");
  if (!isCalendarDay(input.spentOn)) return refuse("Enter the expense date.");
  if (input.spentOn > today) return refuse("The expense date cannot be after today.");
  const amount = nairaToKobo(input.amount);
  if (amount === null || amount <= 0n) {
    return refuse("Enter an amount above ₦0.00, with at most 2 decimals.");
  }
  const description = input.description.trim();
  if (description.length > EXPENSE_TEXT_MAX) {
    return refuse(`The description may have at most ${EXPENSE_TEXT_MAX} characters.`);
  }
  const narration = input.narration.trim();
  if (narration.length > EXPENSE_TEXT_MAX) {
    return refuse(`The narration may have at most ${EXPENSE_TEXT_MAX} characters.`);
  }
  if (input.category === OTHERS_CATEGORY) {
    if (narration.length === 0) return refuse("Others needs a narration: say what the money was for.");
  } else if (narration.length > 0) {
    return refuse("Only Others takes a narration.");
  }
  return {
    ok: true,
    value: {
      category: input.category,
      method: input.method,
      spentOn: input.spentOn,
      amount: koboToNaira(amount),
      description,
      narration,
    },
  };
}

/** Messages for the 400 codes of POST /expenses (server/src/expenses.ts). */
const EXPENSE_CODE_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["unknown_category", "Choose a category."],
  ["system_only", "Loan and Membership Withdrawal are recorded by the system."],
  ["invalid_method", "Choose Cash or Bank transfer."],
  ["invalid_spent_on", "The expense date was refused. Enter a real date."],
  ["future_spent_on", "The expense date cannot be after today."],
  ["invalid_amount", "The amount was refused. Enter an amount with at most 2 decimals."],
  ["amount_not_positive", "The amount must be above ₦0.00."],
  ["invalid_description", `The description may have at most ${EXPENSE_TEXT_MAX} characters.`],
  ["invalid_narration", `The narration may have at most ${EXPENSE_TEXT_MAX} characters.`],
  ["missing_narration", "Others needs a narration: say what the money was for."],
  ["narration_not_allowed", "Only Others takes a narration."],
]);

/**
 * The message for a refused expense. Null for signed_out: the sign-in screen already shows.
 * After network and server the expense may be saved; the form keeps the key, so pressing again
 * sends the same attempt and the server never saves it twice (D-65).
 */
export function expenseMessage(result: Extract<CreateExpenseResult, { ok: false }>): string | null {
  switch (result.reason) {
    case "idempotency_conflict":
      return "This attempt was already sent with other details. Check the expense list, then start again.";
    case "invalid_input": {
      const known = result.code === undefined ? undefined : EXPENSE_CODE_MESSAGES.get(result.code);
      return known ?? "The expense was refused. Check the fields and try again.";
    }
    case "forbidden":
      return "You do not have permission to do this.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Press Record expense again: it will not be saved twice.";
    default:
      return "Something went wrong. Press Record expense again: it will not be saved twice.";
  }
}

type SavedExpense = Extract<CreateExpenseResult, { ok: true }>;

/** "Office Maintenance expense of ₦15,000.00 on 20 Oct 2026". */
function expenseSummary(expense: Expense): string {
  return `${expense.category} expense of ${formatNaira(expense.amount)} on ${formatDay(expense.spentOn)}`;
}

/** The notice after an expense is recorded: the category, the amount and the day. */
export function savedExpenseMessage(saved: SavedExpense): string {
  return `${expenseSummary(saved.expense)} recorded.`;
}

/** The notice after an edit, from the expense the server sent back. */
export function editedExpenseMessage(expense: Expense): string {
  return `${expenseSummary(expense)} saved.`;
}

/** The notice after a delete, from the row that was deleted. */
export function deletedExpenseMessage(expense: Expense): string {
  return `${expenseSummary(expense)} deleted.`;
}

/**
 * True when the row may show Edit and Delete: only the categories a person may pick. Loan and
 * Membership Withdrawal are set by the system (D-69, D-78). An expense that names a loan or a
 * pay-off under another category is not in the list's fields; the server refuses it (409).
 */
export function isChangeable(expense: Expense): boolean {
  return MANUAL_EXPENSE_CATEGORIES.includes(expense.category);
}

/** The 409 codes of PUT and DELETE /expenses/:id (server/src/expenses.ts). */
function lockedMessage(code: string | undefined, done: "edited" | "deleted"): string {
  if (code === "loan_linked") return `This expense is linked to a loan and cannot be ${done}.`;
  if (code === "pay_off") return `This expense is part of a pay-off and cannot be ${done}.`;
  return `This expense cannot be ${done}.`;
}

const EXPENSE_NOT_FOUND = "This expense was not found. It may have been deleted.";

/**
 * The message for a refused edit. Null for signed_out. A PUT sends every field again, so
 * pressing again after a network or server failure gives the same expense (no key, A-177).
 */
export function editExpenseMessage(result: Extract<UpdateExpenseResult, { ok: false }>): string | null {
  switch (result.reason) {
    case "not_editable":
      return lockedMessage(result.code, "edited");
    case "not_found":
      return EXPENSE_NOT_FOUND;
    case "invalid_input": {
      const known = result.code === undefined ? undefined : EXPENSE_CODE_MESSAGES.get(result.code);
      return known ?? "The changes were refused. Check the fields and try again.";
    }
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

/** The message for a refused delete. Null for signed_out. A repeated delete answers not_found. */
export function deleteExpenseMessage(result: Extract<DeleteExpenseResult, { ok: false }>): string | null {
  switch (result.reason) {
    case "not_deletable":
      return lockedMessage(result.code, "deleted");
    case "not_found":
      return EXPENSE_NOT_FOUND;
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

interface ExpenseFormProps {
  api: Pick<Api, "createExpense" | "updateExpense">;
  /** The expense to edit, or null to record a new one. */
  editing: Expense | null;
  /** Called with the notice to show. */
  onSaved(message: string): void;
  onCancel(): void;
}

/**
 * Record an expense (date, category, amount, method, description, and a narration for Others).
 * One Idempotency-Key per attempt, as the loan form (D-65, A-220): a change to any field makes
 * the next press a new attempt; a retry after a network or server failure sends the same key.
 * With `editing` the form opens with the saved fields and sends them all with PUT (A-177);
 * an edit has no key.
 */
function ExpenseForm({ api, editing, onSaved, onCancel }: ExpenseFormProps) {
  const [form, setForm] = useState<ExpenseFormInput>(() =>
    editing === null
      ? {
          spentOn: lagosToday(),
          category: "",
          method: "BANK_TRANSFER",
          amount: "",
          description: "",
          narration: "",
        }
      : {
          spentOn: editing.spentOn,
          category: editing.category,
          method: editing.method,
          amount: editing.amount,
          description: editing.description,
          narration: editing.narration,
        },
  );
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function change(next: ExpenseFormInput) {
    setForm(next);
    setKey(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = checkExpense(form, lagosToday());
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    if (editing !== null) {
      setBusy(true);
      setError(null);
      const edited = await api.updateExpense(editing.id, checked.value);
      if (edited.ok) {
        onSaved(editedExpenseMessage(edited.expense));
        return;
      }
      setBusy(false);
      const message = editExpenseMessage(edited);
      if (message !== null) setError(message);
      return;
    }
    const attemptKey = key ?? newIdempotencyKey();
    setKey(attemptKey);
    setBusy(true);
    setError(null);
    const result = await api.createExpense({ ...checked.value, idempotencyKey: attemptKey });
    if (result.ok) {
      onSaved(savedExpenseMessage(result));
      return;
    }
    setBusy(false);
    // The key was used with other details: the next press is a new attempt.
    if (result.reason === "idempotency_conflict") setKey(null);
    const message = expenseMessage(result);
    if (message !== null) setError(message);
  }

  return (
    <form className="form expense-form" onSubmit={submit}>
      <h2 className="form-title">{editing === null ? "Record expense" : "Edit expense"}</h2>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            name="spentOn"
            required
            max={lagosToday()}
            value={form.spentOn}
            onChange={(e) => change({ ...form, spentOn: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Category</span>
          <select
            name="category"
            value={form.category}
            onChange={(e) => {
              const category = e.target.value;
              // Only Others takes a narration, so leaving Others empties it.
              change({ ...form, category, narration: category === OTHERS_CATEGORY ? form.narration : "" });
            }}
          >
            <option value="">Choose a category</option>
            {MANUAL_EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Amount (₦)</span>
          <input
            type="text"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => change({ ...form, amount: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Payment method</span>
          <select
            name="method"
            value={form.method}
            onChange={(e) => change({ ...form, method: e.target.value as PaymentMethod })}
          >
            <option value="BANK_TRANSFER">{METHOD_LABELS.BANK_TRANSFER}</option>
            <option value="CASH">{METHOD_LABELS.CASH}</option>
          </select>
        </label>
        <label className="field">
          <span>Description</span>
          <input
            type="text"
            name="description"
            maxLength={EXPENSE_TEXT_MAX}
            value={form.description}
            onChange={(e) => change({ ...form, description: e.target.value })}
          />
        </label>
        {form.category === OTHERS_CATEGORY && (
          <label className="field">
            <span>Narration</span>
            <input
              type="text"
              name="narration"
              maxLength={EXPENSE_TEXT_MAX}
              value={form.narration}
              onChange={(e) => change({ ...form, narration: e.target.value })}
            />
          </label>
        )}
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
          {busy ? "Saving…" : editing === null ? "Record expense" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

interface DeleteConfirmProps {
  api: Pick<Api, "deleteExpense">;
  expense: Expense;
  /** Called with the notice to show. */
  onDeleted(message: string): void;
  onCancel(): void;
}

/** Asks before a delete. The server soft-deletes (DR-12): the row leaves the list and the total. */
function DeleteConfirm({ api, expense, onDeleted, onCancel }: DeleteConfirmProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await api.deleteExpense(expense.id);
    if (result.ok) {
      onDeleted(deletedExpenseMessage(expense));
      return;
    }
    setBusy(false);
    const message = deleteExpenseMessage(result);
    if (message !== null) setError(message);
  }

  return (
    <section className="form expense-delete">
      <h2 className="form-title">Delete expense</h2>
      <p className="form-note">
        Delete the {expenseSummary(expense)}? It leaves the list and the total.
      </p>
      {error && (
        <em role="alert" className="error">
          {error}
        </em>
      )}
      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="danger-btn" onClick={() => void remove()} disabled={busy}>
          {busy ? "Deleting…" : "Delete expense"}
        </button>
      </div>
    </section>
  );
}

/** The one form or confirm open on the page, if any (one at a time, as member detail). */
type Open =
  | { kind: "record" }
  | { kind: "edit"; expense: Expense }
  | { kind: "delete"; expense: Expense }
  | null;

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; list: ExpenseList }
  | { kind: "failed"; message: string | null };

export interface ExpensesProps {
  api: Pick<Api, "listExpenses" | "createExpense" | "updateExpense" | "deleteExpense">;
  /** expenses.create: show "Record expense". */
  canCreate: boolean;
  /** expenses.edit: show Edit on rows a person may change. */
  canEdit: boolean;
  /** expenses.delete: show Delete on rows a person may change. */
  canDelete: boolean;
}

/**
 * The list loads with no filters. "Apply" sends the filters, "Clear" empties them and loads the
 * full list again. Rows are newest first: the server sends oldest first by day spent, then time
 * recorded (D-94), and the page reverses them, as member detail does for payments and loans.
 * After an expense is recorded, edited or deleted, the form closes, a notice shows and the list
 * is read again with the filters in use, so the total is the server's (A-220, A-221).
 */
export default function Expenses({ api, canCreate, canEdit, canDelete }: ExpensesProps) {
  const [form, setForm] = useState<ExpenseFilterInput>(NO_FILTER);
  const [query, setQuery] = useState<ExpenseFilter>({});
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reads, setReads] = useState(0);

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
  }, [api, query, reads]);

  function done(message: string) {
    setOpen(null);
    setNotice(message);
    setList({ kind: "loading" });
    setReads((n) => n + 1);
  }

  function openPanel(next: NonNullable<Open>) {
    setNotice(null);
    setOpen(next);
  }

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
  const actions = canEdit || canDelete;

  return (
    <>
      <div className="title">
        <div>
          <h1>Expenses</h1>
          <p>Track cooperative expenditure</p>
        </div>
        {canCreate && open === null && (
          <button type="button" className="primary-btn" onClick={() => openPanel({ kind: "record" })}>
            + Record expense
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {open !== null && open.kind !== "delete" && (
        <ExpenseForm
          key={open.kind === "edit" ? open.expense.id : "record"}
          api={api}
          editing={open.kind === "edit" ? open.expense : null}
          onSaved={done}
          onCancel={() => setOpen(null)}
        />
      )}
      {open !== null && open.kind === "delete" && (
        <DeleteConfirm api={api} expense={open.expense} onDeleted={done} onCancel={() => setOpen(null)} />
      )}
      <form className="form expense-filters" onSubmit={apply}>
        <label className="field">
          <span>Category</span>
          <select
            name="category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">All categories</option>
            {MANUAL_EXPENSE_CATEGORIES.map((c) => (
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
        {expenseMonths(rows).map((group) => (
          <section key={group.month} className="expense-month" aria-label={formatMonth(group.month)}>
            <h3>{formatMonth(group.month)}</h3>
            <div className="table-wrap">
              <table className="expenses">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Method</th>
                    {actions && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.expenses.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDay(e.spentOn)}</td>
                      <td>{e.category}</td>
                      <td>{[e.description, e.narration].filter((t) => t !== "").join(" · ") || "—"}</td>
                      <td className="amount">{formatNaira(e.amount)}</td>
                      <td>{METHOD_LABELS[e.method]}</td>
                      {actions && (
                        <td className="row-actions">
                          {open === null && isChangeable(e) && (
                            <>
                              {canEdit && (
                                <button
                                  type="button"
                                  className="secondary"
                                  aria-label={`Edit ${expenseSummary(e)}`}
                                  onClick={() => openPanel({ kind: "edit", expense: e })}
                                >
                                  Edit
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  className="secondary"
                                  aria-label={`Delete ${expenseSummary(e)}`}
                                  onClick={() => openPanel({ kind: "delete", expense: e })}
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </section>
    </>
  );
}
