// Exports page (8.6, R-23): GET /exports/:kind for the holder of `reports.export`. The server
// builds each .xlsx file, sums the money and scopes Staff to their own records (D-104, DR-13); the
// browser only sends the filters and saves the file it gets (A-254 item 2). The holder of
// `users.manage` may pick one staff member's records; the names come from GET /staff (A-243 item 3).
// Title, subtitle and button labels from legacy-prototype/src/App.jsx (Exports), without CSV (A-255).
import { useEffect, useState } from "react";
import { actorNames } from "./Audit.tsx";
import type { Api, DownloadExportResult, ExportFile, ExportKind, ExportQuery, StaffAccount, User } from "./api.ts";
import { EXPENSE_CATEGORIES } from "./Expenses.tsx";
import { PAYMENT_CATEGORIES, isCalendarDay } from "./Members.tsx";

/** What the filter form holds, as typed. "" means no bound, no category, or everyone the user may see. */
export interface ExportFilterInput {
  fromDay: string;
  toDay: string;
  category: string;
  staffId: string;
}

export const NO_EXPORT_FILTER: ExportFilterInput = { fromDay: "", toDay: "", category: "", staffId: "" };

/** The categories of the single category export: DR-04, then DR-11; the two lists share no name (A-252 item 3). */
export const EXPORT_CATEGORIES: readonly string[] = [...PAYMENT_CATEGORIES, ...EXPENSE_CATEGORIES];

/** The five buttons, in the prototype's order, then the two exports it did not have. */
export const EXPORT_BUTTONS: readonly { kind: ExportKind; label: string }[] = [
  { kind: "members", label: "Export Full Members List" },
  { kind: "transactions", label: "Export Filtered Transactions" },
  { kind: "expenses", label: "Export Filtered Expenses" },
  { kind: "cashflow", label: "Export Cashflow" },
  { kind: "category", label: "Export Category" },
];

/**
 * Checks the form for one kind in the server's order (category, from day, to day, range) and gives
 * the query, or a message. Members reads no days and only the category kind reads a category, as
 * the server (A-253 item 3), so those fields are neither checked nor sent for the other kinds.
 */
export function checkExport(
  kind: ExportKind,
  input: ExportFilterInput,
): { ok: true; value: ExportQuery } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  const staff = input.staffId !== "" ? { createdById: input.staffId } : {};
  if (kind === "members") return { ok: true, value: staff };
  if (kind === "category" && !EXPORT_CATEGORIES.includes(input.category)) return refuse("Choose a category.");
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
      ...(kind === "category" ? { category: input.category } : {}),
      ...staff,
    },
  };
}

/** The message for a failed export. Null for signed_out: the sign-in screen already shows. */
export function exportMessage(result: Extract<DownloadExportResult, { ok: false }>): string | null {
  switch (result.reason) {
    case "invalid_input":
      if (result.code === "invalid_category") return "The category was refused. Choose one from the list.";
      if (result.code === "invalid_created_by_id") return "The staff filter was refused. Press Clear and try again.";
      return "The days were refused. Check them and try again.";
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
 * Saves the file through a link with `download`, as the prototype's CSV export did. The address is
 * let go after the click has started the download (A-255).
 */
export function browserSaveFile(file: ExportFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ExportsProps {
  api: Pick<Api, "downloadExport" | "listStaff">;
  me: User;
  /** users.manage (the Super Admin alone, D-25): read the staff list and offer the staff filter. */
  canFilterStaff: boolean;
  saveFile: (file: ExportFile) => void;
}

/**
 * Nothing is read until a button is pressed. One export runs at a time; the buttons wait meanwhile.
 * The staff list is read once; if it fails, there is no staff filter (as the Dashboard, A-241 item 3).
 */
export default function Exports({ api, me, canFilterStaff, saveFile }: ExportsProps) {
  const [form, setForm] = useState<ExportFilterInput>(NO_EXPORT_FILTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);

  useEffect(() => {
    if (!canFilterStaff) return;
    let active = true;
    api.listStaff().then((result) => {
      if (active && result.ok) setStaff(result.value);
    });
    return () => {
      active = false;
    };
  }, [api, canFilterStaff]);

  async function download(kind: ExportKind) {
    setSaved(null);
    const checked = checkExport(kind, form);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await api.downloadExport(kind, checked.value);
    setBusy(false);
    if (!result.ok) {
      setError(exportMessage(result));
      return;
    }
    saveFile(result.value);
    setSaved(result.value.fileName);
  }

  function clear() {
    setForm(NO_EXPORT_FILTER);
    setError(null);
    setSaved(null);
  }

  return (
    <>
      <div className="title">
        <div>
          <h1>Export</h1>
          <p>Filter and export cooperative records to Excel</p>
        </div>
      </div>
      <form className="form export-filters" onSubmit={(e) => e.preventDefault()}>
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
        <label className="field">
          <span>Category</span>
          <select
            name="category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="">Choose a category</option>
            {EXPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={clear} disabled={busy}>
            Clear
          </button>
        </div>
      </form>
      <p className="form-note">
        The members list holds every member, whatever the days. The category is used only by Export Category.
      </p>
      <div className="export-grid">
        {EXPORT_BUTTONS.map((b) => (
          <button key={b.kind} type="button" className="primary-btn" onClick={() => download(b.kind)} disabled={busy}>
            {b.label}
          </button>
        ))}
      </div>
      {busy && <p className="panel-note">Preparing the file…</p>}
      {error && (
        <em role="alert" className="error">
          {error}
        </em>
      )}
      {saved && (
        <p role="status" className="notice">
          Downloaded {saved}.
        </p>
      )}
    </>
  );
}
