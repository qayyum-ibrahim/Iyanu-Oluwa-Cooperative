// Exports page (8.6, 9.1m, R-23): GET /exports for the holder of `reports.export`. The kinds ticked
// go into one file, one sheet per kind, as Excel or PDF (D-110 items 4 to 7). The server builds
// the file, sums the money and scopes Staff to their own records (D-104, DR-13); the browser only
// sends the filters and saves the file it gets (A-254 item 2). The holder of `users.manage` may
// pick one staff member's records; the names come from GET /staff (A-243 item 3). The member
// choice reads GET /members?status=all the first time One member is ticked.
import { useEffect, useState } from "react";
import { actorNames } from "./Audit.tsx";
import { startStaffId } from "./Dashboard.tsx";
import type {
  Api,
  CallFailure,
  DownloadExportResult,
  ExportFile,
  ExportFormat,
  ExportKind,
  ExportQuery,
  MemberListRow,
  StaffAccount,
  User,
} from "./api.ts";
import { EXPENSE_CATEGORIES } from "./Expenses.tsx";
import { PAYMENT_CATEGORIES, isCalendarDay } from "./Members.tsx";

/** What the form holds, as typed. "" means no bound, no category, no member, or everyone the user may see. */
export interface ExportFilterInput {
  kinds: ExportKind[];
  format: ExportFormat;
  fromDay: string;
  toDay: string;
  category: string;
  memberId: string;
  staffId: string;
}

export const NO_EXPORT_FILTER: ExportFilterInput = {
  kinds: [],
  format: "xlsx",
  fromDay: "",
  toDay: "",
  category: "",
  memberId: "",
  staffId: "",
};

/** The categories of the single category export: DR-04, then DR-11; the two lists share no name (A-252 item 3). */
export const EXPORT_CATEGORIES: readonly string[] = [...PAYMENT_CATEGORIES, ...EXPENSE_CATEGORIES];

/** The tick boxes, in the server's sheet order (D-110 item 4). */
export const EXPORT_KIND_CHOICES: readonly { kind: ExportKind; label: string }[] = [
  { kind: "members", label: "Full members list" },
  { kind: "transactions", label: "Transactions" },
  { kind: "expenses", label: "Expenses" },
  { kind: "cashflow", label: "Cashflow" },
  { kind: "category", label: "One category" },
  { kind: "member", label: "One member" },
];

/** The format choices: Excel first, as before 9.1m. */
export const EXPORT_FORMATS: readonly { format: ExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "pdf", label: "PDF" },
];

/** The kinds that read the days, as DATED_KINDS in server/src/exports.ts. */
const DATED_KINDS: readonly ExportKind[] = ["transactions", "expenses", "cashflow", "category"];

/**
 * Checks the form in the server's order (kinds, category, from day, to day, range, member) and gives
 * the query, or a message. Each part is checked and sent only when a ticked kind reads it, as the
 * server (A-278): the days for the kinds with days, the category for One category, the member for
 * One member, and the staff filter for any kind but One member (A-277).
 */
export function checkExport(
  input: ExportFilterInput,
): { ok: true; value: ExportQuery } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  const kinds = EXPORT_KIND_CHOICES.map((c) => c.kind).filter((k) => input.kinds.includes(k));
  if (kinds.length === 0) return refuse("Tick at least one export.");
  const dated = kinds.some((k) => DATED_KINDS.includes(k));
  const category = kinds.includes("category");
  const member = kinds.includes("member");
  if (category && !EXPORT_CATEGORIES.includes(input.category)) return refuse("Choose a category.");
  if (dated) {
    if (input.fromDay !== "" && !isCalendarDay(input.fromDay)) return refuse("Enter a real From day.");
    if (input.toDay !== "" && !isCalendarDay(input.toDay)) return refuse("Enter a real To day.");
    if (input.fromDay !== "" && input.toDay !== "" && input.fromDay > input.toDay) {
      return refuse("The From day cannot be after the To day.");
    }
  }
  if (member && input.memberId === "") return refuse("Choose a member.");
  return {
    ok: true,
    value: {
      kinds,
      format: input.format,
      ...(dated && input.fromDay !== "" ? { fromDay: input.fromDay } : {}),
      ...(dated && input.toDay !== "" ? { toDay: input.toDay } : {}),
      ...(category ? { category: input.category } : {}),
      ...(member ? { memberId: input.memberId } : {}),
      ...(input.staffId !== "" && kinds.some((k) => k !== "member") ? { createdById: input.staffId } : {}),
    },
  };
}

/** The message for a failed export. Null for signed_out: the sign-in screen already shows. */
export function exportMessage(result: Extract<DownloadExportResult, { ok: false }>): string | null {
  switch (result.reason) {
    case "invalid_input":
      if (result.code === "invalid_category") return "The category was refused. Choose one from the list.";
      if (result.code === "invalid_created_by_id") return "The staff filter was refused. Press Clear and try again.";
      if (result.code === "missing_member_id" || result.code === "invalid_member_id") {
        return "The member was refused. Choose one from the list.";
      }
      if (result.code === "missing_kinds" || result.code === "invalid_kinds" || result.code === "invalid_format") {
        return "The export was refused. Press Clear and try again.";
      }
      return "The days were refused. Check them and try again.";
    case "forbidden":
      return "You do not have permission to do this.";
    case "not_found":
      return "The member was not found. Choose another.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

/** The note when the member list cannot be read. Null for signed_out: the sign-in screen already shows. */
export function exportMembersMessage(reason: CallFailure): string | null {
  switch (reason) {
    case "forbidden":
      return "You do not have permission to view members, so One member cannot be exported.";
    case "signed_out":
      return null;
    default:
      return "Cannot read the member list. Untick One member and tick it again to retry.";
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
  api: Pick<Api, "downloadExport" | "listMembers" | "listStaff">;
  me: User;
  /** users.manage (the Super Admin alone, D-25): read the staff list and offer the staff filter. */
  canFilterStaff: boolean;
  saveFile: (file: ExportFile) => void;
}

/** The member list for the member choice, or the note when it cannot be read. */
type MemberChoice = { ok: true; value: MemberListRow[] } | { ok: false; message: string | null };

/**
 * Nothing but the staff list is read until One member is ticked or Export is pressed. One export
 * runs at a time; Export waits meanwhile, and with nothing ticked. The staff filter starts on the
 * signed-in user and Clear goes back to it (D-110 item 3). The staff list is read once; if it
 * fails, there is no staff filter and the form goes back to everyone (as the Dashboard, A-241
 * item 3, A-276). The member list is read once; a failed read is tried again on the next tick.
 */
export default function Exports({ api, me, canFilterStaff, saveFile }: ExportsProps) {
  const [startStaff, setStartStaff] = useState(() => startStaffId(me, canFilterStaff));
  const [form, setForm] = useState<ExportFilterInput>(() => ({ ...NO_EXPORT_FILTER, staffId: startStaff }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);
  const [members, setMembers] = useState<MemberChoice | null>(null);
  const wantsMember = form.kinds.includes("member");

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
    });
    return () => {
      active = false;
    };
  }, [api, canFilterStaff]);

  useEffect(() => {
    if (!wantsMember || members !== null) return;
    let active = true;
    api.listMembers("all").then((result) => {
      if (!active) return;
      setMembers(result.ok ? result : { ok: false, message: exportMembersMessage(result.reason) });
    });
    return () => {
      active = false;
    };
  }, [api, wantsMember, members]);

  function toggle(kind: ExportKind) {
    const kinds = form.kinds.includes(kind) ? form.kinds.filter((k) => k !== kind) : [...form.kinds, kind];
    setForm({ ...form, kinds });
    if (!kinds.includes("member") && members?.ok === false) setMembers(null);
  }

  async function download() {
    setSaved(null);
    const checked = checkExport(form);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await api.downloadExport(checked.value);
    setBusy(false);
    if (!result.ok) {
      setError(exportMessage(result));
      return;
    }
    saveFile(result.value);
    setSaved(result.value.fileName);
  }

  function clear() {
    setForm({ ...NO_EXPORT_FILTER, staffId: startStaff });
    if (members?.ok === false) setMembers(null);
    setError(null);
    setSaved(null);
  }

  return (
    <>
      <div className="title">
        <div>
          <h1>Export</h1>
          <p>Tick the records to export, then save them as Excel or PDF</p>
        </div>
      </div>
      <div className="export-kinds">
        <b>Export</b>
        {EXPORT_KIND_CHOICES.map((c) => (
          <label key={c.kind}>
            <input
              type="checkbox"
              name="kind"
              value={c.kind}
              checked={form.kinds.includes(c.kind)}
              onChange={() => toggle(c.kind)}
            />
            {c.label}
          </label>
        ))}
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
        {wantsMember && members?.ok !== false && (
          <label className="field">
            <span>Member</span>
            <select
              name="memberId"
              value={form.memberId}
              disabled={members === null}
              onChange={(e) => setForm({ ...form, memberId: e.target.value })}
            >
              <option value="">{members === null ? "Loading members…" : "Choose a member"}</option>
              {members?.value.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.membershipId} {m.fullName}
                  {m.status === "INACTIVE" ? " (Inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
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
        <div className="field export-format">
          <span>Format</span>
          {EXPORT_FORMATS.map((f) => (
            <label key={f.format}>
              <input
                type="radio"
                name="format"
                value={f.format}
                checked={form.format === f.format}
                onChange={() => setForm({ ...form, format: f.format })}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={clear} disabled={busy}>
            Clear
          </button>
          <button type="button" className="primary-btn" onClick={download} disabled={busy || form.kinds.length === 0}>
            Export
          </button>
        </div>
      </form>
      {wantsMember && members?.ok === false && members.message !== null && (
        <p className="panel-note">{members.message}</p>
      )}
      <p className="form-note">
        The members list holds every member, whatever the days. The category is used only by One category. One
        member covers all time.
      </p>
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
