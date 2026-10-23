// Members list and add member (U.3e, R-01, R-02), member detail (U.3f, R-36), record a payment
// from member detail (U.4e2, R-04, R-06, D-89), the first payment after adding a member (U.4f,
// R-03). Search by name or
// Membership ID runs in the browser over the list the server sent (A-191 item 2). The server
// checks every field again. Amounts stay the naira strings the server sent (A-18); the browser
// only adds the naira sign and thousands commas. The one sum is the payment form's breakdown
// check, in whole kobo as BigInt (U.4e, A-209); the server checks again.
import { useEffect, useState, type FormEvent } from "react";
import type {
  Api,
  CallFailure,
  CallResult,
  CreatePaymentResult,
  Loan,
  Member,
  MemberBalances,
  MemberStatusFilter,
  NewMember,
  NewPayment,
  Payment,
  PaymentMethod,
  SmsOutcome,
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

// Payment form helpers (U.4e, R-04, A-209). The form is PaymentForm below (U.4e2).

/**
 * The payment categories in the order of DR-04, copied from server/src/categories.ts (D-81).
 * "Membership Withdrawal" is set by the system and is never offered. The server checks again.
 */
export const PAYMENT_CATEGORIES = [
  "Shares",
  "Savings",
  "Special Savings",
  "Development Levy",
  "Loan Repaid",
  "Loan Interest",
  "Entrance Fee",
  "Stationeries",
  "Empowerment Repaid",
  "Committee Gift",
  "Special Deposit",
  "Investment Repaid",
  "Investment Income",
  "Building Funds",
] as const;

/** MAX_PAYMENT_LINES in server/src/payments.ts. */
export const PAYMENT_LINES_MAX = 20;

/** A naira amount as parseNaira (server/src/money.ts) accepts it: 1 to 12 digits, 0 to 2 decimals. */
const NAIRA_INPUT = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/** Whole kobo (D-15) for a typed amount such as "20000.5", or null if it is not an amount. */
export function nairaToKobo(text: string): bigint | null {
  const match = NAIRA_INPUT.exec(text.trim());
  if (match === null) return null;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** 2000050n gives "20000.50", the form the server writes (koboToNairaString). Not for negatives. */
export function koboToNaira(kobo: bigint): string {
  if (kobo < 0n) throw new RangeError("Amount must not be negative.");
  return `${(kobo / 100n).toString()}.${(kobo % 100n).toString().padStart(2, "0")}`;
}

export interface PaymentLineInput {
  category: string;
  amount: string;
}

/** The breakdown in whole kobo, or null while any line amount is not an amount. Exact (BigInt). */
export function breakdownKobo(lines: readonly PaymentLineInput[]): bigint | null {
  let sum = 0n;
  for (const line of lines) {
    const kobo = nairaToKobo(line.amount);
    if (kobo === null) return null;
    sum += kobo;
  }
  return sum;
}

const LAGOS_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The day in Lagos at `now`, as "YYYY-MM-DD" (lagosDay in server/src/payments.ts). */
export function lagosToday(now: Date = new Date()): string {
  const part = (type: string) => LAGOS_DAY.formatToParts(now).find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const DAY_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written "YYYY-MM-DD" (isCalendarDay in server/src/payments.ts). */
export function isCalendarDay(value: string): boolean {
  const match = DAY_INPUT.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-22" gives "22 Oct 2026", as formatDate writes a day. Other text is shown as it came. */
export function formatDay(day: string): string {
  if (!isCalendarDay(day)) return day;
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** What the payment form holds, as typed. */
export interface PaymentFormInput {
  paidOn: string;
  method: PaymentMethod;
  total: string;
  lines: PaymentLineInput[];
  sendSms: boolean;
}

/** The body fields ready to send, amounts as "20000.50" (A-18). */
export type CheckedPayment = Omit<NewPayment, "idempotencyKey" | "memberId">;

/**
 * Checks the form in the server's order (date, line count, total, each line, then the sum) and
 * gives the fields to send, or a message. `today` is the day in Lagos. The server checks again.
 */
export function checkPayment(
  input: PaymentFormInput,
  today: string,
): { ok: true; value: CheckedPayment } | { ok: false; message: string } {
  const refuse = (message: string) => ({ ok: false as const, message });
  if (!isCalendarDay(input.paidOn)) return refuse("Enter the payment date.");
  if (input.paidOn > today) return refuse("The payment date cannot be after today.");
  if (input.lines.length === 0) return refuse("Add at least one breakdown line.");
  if (input.lines.length > PAYMENT_LINES_MAX) {
    return refuse(`A payment may have at most ${PAYMENT_LINES_MAX} breakdown lines.`);
  }
  const total = nairaToKobo(input.total);
  if (total === null || total <= 0n) {
    return refuse("Enter a total above ₦0.00, with at most 2 decimals.");
  }
  const lines: CheckedPayment["lines"] = [];
  for (const [index, line] of input.lines.entries()) {
    if (!(PAYMENT_CATEGORIES as readonly string[]).includes(line.category)) {
      return refuse(`Choose a category on line ${index + 1}.`);
    }
    const amount = nairaToKobo(line.amount);
    if (amount === null || amount <= 0n) {
      return refuse(`Enter an amount above ₦0.00 on line ${index + 1}, with at most 2 decimals.`);
    }
    lines.push({ category: line.category, amount: koboToNaira(amount) });
  }
  if (breakdownKobo(input.lines) !== total) {
    return refuse("The breakdown must add up to the total exactly.");
  }
  return {
    ok: true,
    value: {
      paidOn: input.paidOn,
      method: input.method,
      total: koboToNaira(total),
      lines,
      sendSms: input.sendSms,
    },
  };
}

/** Messages for the 400 codes of POST /payments (server/src/payments.ts, breakdown.ts). */
const PAYMENT_CODE_MESSAGES: ReadonlyMap<string, string> = new Map([
  ["invalid_paid_on", "The payment date was refused. Enter a real date."],
  ["future_paid_on", "The payment date cannot be after today."],
  ["invalid_method", "Choose Cash or Bank transfer."],
  ["too_many_lines", `A payment may have at most ${PAYMENT_LINES_MAX} breakdown lines.`],
  ["invalid_total", "The total was refused. Enter an amount with at most 2 decimals."],
  ["total_not_positive", "The total must be above ₦0.00."],
  ["no_lines", "Add at least one breakdown line."],
  ["unknown_category", "A breakdown category was refused."],
  ["system_only", "Membership Withdrawal is set by the system and cannot be chosen."],
  ["invalid_amount", "A breakdown amount was refused. Use at most 2 decimals."],
  ["amount_not_positive", "Each breakdown amount must be above ₦0.00."],
  ["mismatch", "The breakdown must add up to the total exactly."],
]);

/**
 * The message for a refused payment. Null for signed_out: the sign-in screen already shows.
 * After network and server the payment may be saved; the form keeps the key, so pressing again
 * sends the same attempt and the server never saves it twice (D-48).
 */
export function paymentMessage(
  result: Extract<CreatePaymentResult, { ok: false }>,
): string | null {
  switch (result.reason) {
    case "member_inactive":
      return "This member is Inactive. Reactivate the member before recording a payment.";
    case "no_active_loan":
      return "Loan Repaid needs an active loan, and this member has none.";
    case "loan_overpayment":
      return "The Loan Repaid amount is more than the loan outstanding.";
    case "idempotency_conflict":
      return "This attempt was already sent with other details. Check the member's payments, then start again.";
    case "invalid_input": {
      const known = result.code === undefined ? undefined : PAYMENT_CODE_MESSAGES.get(result.code);
      const message = known ?? "The payment was refused. Check the fields and try again.";
      return result.lineIndex === undefined ? message : `${message} (line ${result.lineIndex + 1})`;
    }
    case "forbidden":
      return "You do not have permission to do this.";
    case "not_found":
      return "Member not found.";
    case "signed_out":
      return null;
    case "network":
      return "Cannot reach the server. Press Record payment again: it will not be saved twice.";
    default:
      return "Something went wrong. Press Record payment again: it will not be saved twice.";
  }
}

/** What happened to the SMS receipt of a saved payment (D-50). The payment is saved in every case. */
export function smsMessage(sms: SmsOutcome): string {
  switch (sms.status) {
    case "sent":
      return "SMS receipt sent.";
    case "not_requested":
      return "No SMS receipt was requested.";
    case "skipped_repeat":
      return "This payment was already saved, so no new SMS receipt was sent.";
    case "failed":
      if (sms.reason === "invalid_number") {
        return "The SMS receipt was not sent: the member's phone number was refused.";
      }
      if (sms.reason === "invalid_message") {
        return "The SMS receipt was not sent: the message was refused.";
      }
      return "The SMS receipt was not sent: the SMS provider failed.";
  }
}

/**
 * A new Idempotency-Key: 32 hex characters from 16 random bytes, inside the server's 16 to 64
 * characters of A-Z a-z 0-9 _ -. getRandomValues works without a secure context, randomUUID
 * does not (MDN, A-209).
 */
export function newIdempotencyKey(
  fill: (bytes: Uint8Array<ArrayBuffer>) => void = (bytes) => {
    globalThis.crypto.getRandomValues(bytes);
  },
): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY: NewMember = { fullName: "", phone: "", address: "", occupation: "" };

type ListState =
  | { kind: "loading" }
  | { kind: "loaded"; members: Member[] }
  | { kind: "failed"; message: string | null };

type DetailApi = Pick<
  Api,
  "getMember" | "memberBalances" | "listPayments" | "listLoans" | "createPayment"
>;

export interface MembersProps {
  api: Pick<Api, "listMembers" | "createMember"> & DetailApi;
  canCreate: boolean;
  canViewPayments: boolean;
  canViewLoans: boolean;
  canRecordPayment: boolean;
}

export default function Members({
  api,
  canCreate,
  canViewPayments,
  canViewLoans,
  canRecordPayment,
}: MembersProps) {
  const [filter, setFilter] = useState<MemberStatusFilter>("active");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The member just added, opened with the payment form for the first payment (U.4f, R-03).
  const [firstPayment, setFirstPayment] = useState<Member | null>(null);

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

  function added(member: Member, recordPayment: boolean) {
    setShowForm(false);
    setList({ kind: "loading" });
    setReload((n) => n + 1);
    if (recordPayment) {
      setNotice(null);
      setFirstPayment(member);
      setOpenId(member.id);
      return;
    }
    setNotice(`${member.fullName} was added as ${member.membershipId}.`);
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
        canRecordPayment={canRecordPayment}
        firstPayment={firstPayment !== null && firstPayment.id === openId ? firstPayment : null}
        onBack={() => {
          setFirstPayment(null);
          setOpenId(null);
        }}
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
        <AddMemberForm
          api={api}
          canRecordPayment={canRecordPayment}
          onAdded={added}
          onCancel={() => setShowForm(false)}
        />
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
                          setFirstPayment(null);
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
  canRecordPayment: boolean;
  onAdded(member: Member, recordPayment: boolean): void;
  onCancel(): void;
}

/**
 * With payments.create the main button saves the member and opens the first payment, and "Save
 * without payment" saves only (R-03, as legacy-prototype/src/App.jsx). Without it there is one
 * button that saves only.
 */
function AddMemberForm({ api, canRecordPayment, onAdded, onCancel }: AddMemberFormProps) {
  const [form, setForm] = useState<NewMember>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  // Which button is saving: "pay" for the main button with payments.create, else "plain".
  const [saving, setSaving] = useState<"pay" | "plain" | null>(null);
  const busy = saving !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await save(canRecordPayment);
  }

  async function save(recordPayment: boolean) {
    if (busy) return;
    const problem = checkNewMember(form);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setSaving(recordPayment ? "pay" : "plain");
    setError(null);
    const result = await api.createMember({
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      occupation: form.occupation.trim(),
    });
    if (result.ok) {
      onAdded(result.value, recordPayment);
      return;
    }
    setSaving(null);
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
      <p className="form-note">
        New members are Active. The Membership ID is given by the system.
        {canRecordPayment && " After saving, the payment form opens for the first payment."}
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
        {canRecordPayment && (
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void save(false)}
            disabled={busy}
          >
            {saving === "plain" ? "Saving…" : "Save without payment"}
          </button>
        )}
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy && saving === (canRecordPayment ? "pay" : "plain")
            ? "Saving…"
            : canRecordPayment
              ? "Add member & record payment"
              : "Save member"}
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

type SavedPayment = Extract<CreatePaymentResult, { ok: true }>;

/** The notice after a save: the amount, the day and what happened to the SMS (D-50). */
export function savedPaymentMessage(saved: SavedPayment): string {
  const { payment, sms } = saved;
  return `Payment of ${formatNaira(payment.total)} on ${formatDay(payment.paidOn)} recorded. ${smsMessage(sms)}`;
}

/** The button text for the SMS toggle (R-06, labels from legacy-prototype/src/App.jsx). */
export function recordButtonLabel(sendSms: boolean): string {
  return sendSms ? "Record payment + SMS requested" : "Record payment without SMS";
}

interface PaymentFormProps {
  api: Pick<Api, "createPayment">;
  memberId: string;
  onSaved(saved: SavedPayment): void;
  onCancel(): void;
}

/**
 * Record a payment for the member on screen (R-04 order: date, method, total, breakdown).
 * One Idempotency-Key per attempt: pressing again after a failure sends the same key, and any
 * change to a field starts a new attempt with a new key (D-46, D-48, A-209 item 6).
 */
function PaymentForm({ api, memberId, onSaved, onCancel }: PaymentFormProps) {
  const [form, setForm] = useState<PaymentFormInput>(() => ({
    paidOn: lagosToday(),
    method: "BANK_TRANSFER",
    total: "",
    lines: [{ category: PAYMENT_CATEGORIES[0], amount: "" }],
    sendSms: true,
  }));
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function change(next: PaymentFormInput) {
    setForm(next);
    setKey(null);
  }

  function changeLine(index: number, patch: Partial<PaymentLineInput>) {
    change({ ...form, lines: form.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  }

  function addLine() {
    const used = new Set(form.lines.map((l) => l.category));
    const category = PAYMENT_CATEGORIES.find((c) => !used.has(c)) ?? PAYMENT_CATEGORIES[0];
    change({ ...form, lines: [...form.lines, { category, amount: "" }] });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const checked = checkPayment(form, lagosToday());
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    const attemptKey = key ?? newIdempotencyKey();
    setKey(attemptKey);
    setBusy(true);
    setError(null);
    const result = await api.createPayment({ ...checked.value, idempotencyKey: attemptKey, memberId });
    if (result.ok) {
      onSaved(result);
      return;
    }
    setBusy(false);
    // The key was used with other details: the next press is a new attempt.
    if (result.reason === "idempotency_conflict") setKey(null);
    const message = paymentMessage(result);
    if (message !== null) setError(message);
  }

  const total = nairaToKobo(form.total);
  const sum = breakdownKobo(form.lines);
  const matches = total !== null && total > 0n && sum === total;

  return (
    <form className="form payment-form" onSubmit={submit}>
      <h2 className="form-title">Record payment</h2>
      <fieldset disabled={busy}>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            name="paidOn"
            required
            max={lagosToday()}
            value={form.paidOn}
            onChange={(e) => change({ ...form, paidOn: e.target.value })}
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
          <span>Total amount (₦)</span>
          <input
            type="text"
            name="total"
            inputMode="decimal"
            placeholder="0.00"
            value={form.total}
            onChange={(e) => change({ ...form, total: e.target.value })}
          />
        </label>
        <div className="breakdown-box">
          <div className="breakdown-head">
            <b>Payment breakdown</b>
            <span className={matches ? "breakdown-match" : "breakdown-off"}>
              Breakdown: {sum === null ? "—" : formatNaira(koboToNaira(sum))}{" "}
              {matches ? "✓ matches the total" : "· must match the total"}
            </span>
          </div>
          {form.lines.map((line, i) => (
            <div className="breakdown-row" key={i}>
              <select
                aria-label={`Category, line ${i + 1}`}
                value={line.category}
                onChange={(e) => changeLine(i, { category: e.target.value })}
              >
                {PAYMENT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Amount, line ${i + 1}`}
                placeholder="0.00"
                value={line.amount}
                onChange={(e) => changeLine(i, { amount: e.target.value })}
              />
              {form.lines.length > 1 && (
                <button
                  type="button"
                  className="remove-line"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => change({ ...form, lines: form.lines.filter((_, n) => n !== i) })}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add-line"
            disabled={form.lines.length >= PAYMENT_LINES_MAX}
            onClick={addLine}
          >
            + Add category
          </button>
        </div>
        <label className="sms-toggle">
          <input
            type="checkbox"
            name="sendSms"
            checked={form.sendSms}
            onChange={(e) => change({ ...form, sendSms: e.target.checked })}
          />
          Send an SMS receipt to the member
        </label>
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
          {busy ? "Saving…" : recordButtonLabel(form.sendSms)}
        </button>
      </div>
    </form>
  );
}

interface MemberDetailProps {
  api: DetailApi;
  id: string;
  canViewPayments: boolean;
  canViewLoans: boolean;
  canRecordPayment: boolean;
  /** The member just added: open with the payment form and a first-payment notice (U.4f, R-03). */
  firstPayment: Member | null;
  onBack(): void;
}

/**
 * One member: profile, balances (D-86), loans and payments (U.3f), and the payment form for an
 * Active member with payments.create (U.4e2, D-89). The payments and loans sections show only
 * with payments.view and loans.view (A-201). Pay-offs are not listed: there is no pay-off read
 * (A-186); the balances already take them off.
 */
function MemberDetail({
  api,
  id,
  canViewPayments,
  canViewLoans,
  canRecordPayment,
  firstPayment,
  onBack,
}: MemberDetailProps) {
  const [member, setMember] = useState<Section<Member>>({ kind: "loading" });
  const [balances, setBalances] = useState<Section<MemberBalances>>({ kind: "loading" });
  const [payments, setPayments] = useState<Section<Payment[]>>(
    canViewPayments ? { kind: "loading" } : { kind: "hidden" },
  );
  const [loans, setLoans] = useState<Section<Loan[]>>(
    canViewLoans ? { kind: "loading" } : { kind: "hidden" },
  );
  const [paying, setPaying] = useState(firstPayment !== null && canRecordPayment);
  const [notice, setNotice] = useState<string | null>(
    firstPayment === null
      ? null
      : `${firstPayment.fullName} was added as ${firstPayment.membershipId}. Record the first payment now.`,
  );
  // Bumped after a saved payment, so balances, payments and loans are read again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    api.getMember(id).then((result) => {
      if (active) setMember(sectionOf(result));
    });
    return () => {
      active = false;
    };
  }, [api, id]);

  useEffect(() => {
    let active = true;
    const show =
      <T,>(set: (section: Section<T>) => void) =>
      (result: CallResult<T>) => {
        if (active) set(sectionOf(result));
      };
    api.memberBalances(id).then(show(setBalances));
    if (canViewPayments) api.listPayments(id).then(show(setPayments));
    if (canViewLoans) api.listLoans(id).then(show(setLoans));
    return () => {
      active = false;
    };
  }, [api, id, canViewPayments, canViewLoans, reload]);

  function saved(result: SavedPayment) {
    setPaying(false);
    setNotice(savedPaymentMessage(result));
    setReload((n) => n + 1);
  }

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
          {canRecordPayment && m.status === "ACTIVE" && !paying && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setNotice(null);
                setPaying(true);
              }}
            >
              Record payment
            </button>
          )}
        </div>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {paying && canRecordPayment && m.status === "ACTIVE" && (
        <PaymentForm
          api={api}
          memberId={m.id}
          onSaved={saved}
          onCancel={() => setPaying(false)}
        />
      )}

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
                        <td>{formatDay(p.paidOn)}</td>
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
