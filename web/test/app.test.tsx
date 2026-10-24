// @vitest-environment jsdom
// Click tests use jsdom (U.2d): https://vitest.dev/guide/environment.html, https://react.dev/reference/react/act
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import App, {
  PASSWORD_CHANGED,
  SESSION_ENDED,
  SIGN_IN_FAILED,
  changePasswordMessage,
  loginMessage,
} from "../src/App";
import type {
  Api,
  AuditFilter,
  AuditPage,
  CallResult,
  ChangePasswordResult,
  CreateExpenseResult,
  CreateLoanResult,
  CreatePaymentResult,
  CreatePayOffResult,
  CreateStaffResult,
  Dashboard as DashboardView,
  DashboardQuery,
  DeleteExpenseResult,
  Expense,
  ExpenseEdit,
  ExpenseFilter,
  ExpenseList,
  LoginResult,
  Loan,
  Me,
  Member,
  MemberBalances,
  MemberStatusFilter,
  NewExpense,
  NewLoan,
  NewPayment,
  NewPayOff,
  NewStaff,
  Payment,
  ReactivateMemberResult,
  SmsOutcome,
  StaffAccount,
  UpdateExpenseResult,
} from "../src/api.ts";
import {
  AUDIT_ACTIONS,
  AUDIT_PAGE_SIZE,
  actorLabel,
  actorNames,
  auditListMessage,
  formatTime,
  pageRange,
} from "../src/Audit.tsx";
import ChangePassword, { checkNewPassword } from "../src/ChangePassword.tsx";
import {
  checkDashboardFilter,
  dashboardCards,
  dashboardMessage,
  formatMonth,
  lagosMonth,
} from "../src/Dashboard.tsx";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_TEXT_MAX,
  MANUAL_EXPENSE_CATEGORIES,
  NO_FILTER,
  checkExpense,
  checkExpenseFilter,
  deleteExpenseMessage,
  deletedExpenseMessage,
  editExpenseMessage,
  editedExpenseMessage,
  expenseCount,
  expenseListMessage,
  expenseMessage,
  isChangeable,
  savedExpenseMessage,
  type ExpenseFormInput,
} from "../src/Expenses.tsx";
import {
  LOAN_TEXT_MAX,
  PAYMENT_CATEGORIES,
  PAYMENT_LINES_MAX,
  breakdownKobo,
  checkLoan,
  checkNewMember,
  checkPayment,
  formatDate,
  formatDay,
  formatNaira,
  hasPayout,
  isCalendarDay,
  koboToNaira,
  lagosToday,
  loanMessage,
  memberMessage,
  nairaToKobo,
  newIdempotencyKey,
  payOffLines,
  payOffMessage,
  paymentMessage,
  reactivateMessage,
  recordButtonLabel,
  savedLoanMessage,
  savedPayOffMessage,
  savedPaymentMessage,
  searchMembers,
  smsMessage,
  type LoanFormInput,
  type PaymentFormInput,
} from "../src/Members.tsx";
import SignIn from "../src/SignIn.tsx";
import {
  BLANK_STAFF,
  STAFF_NAME_MAX,
  STAFF_PERMISSIONS,
  UNKNOWN_PERMISSION,
  accountStatusMessage,
  accountStatusNotice,
  checkNewStaff,
  checkResetPassword,
  cleanPermissions,
  createdStaffMessage,
  permissionCount,
  permissionsMessage,
  resetPasswordMessage,
  resetPasswordNotice,
  savedPermissionsMessage,
  staffListMessage,
  staffMessage,
  type StaffFormInput,
} from "../src/Staff.tsx";

const idleApi: Api = {
  login: async () => ({ ok: false, reason: "server" }),
  restore: async () => null,
  me: async () => null,
  logout: async () => undefined,
  changePassword: async () => ({ ok: false, reason: "server" }),
  listMembers: async () => ({ ok: false, reason: "server" }),
  getMember: async () => ({ ok: false, reason: "server" }),
  createMember: async () => ({ ok: false, reason: "server" }),
  memberBalances: async () => ({ ok: false, reason: "server" }),
  listPayments: async () => ({ ok: false, reason: "server" }),
  listLoans: async () => ({ ok: false, reason: "server" }),
  createPayment: async () => ({ ok: false, reason: "server" }),
  createLoan: async () => ({ ok: false, reason: "server" }),
  listExpenses: async () => ({ ok: false, reason: "server" }),
  createExpense: async () => ({ ok: false, reason: "server" }),
  updateExpense: async () => ({ ok: false, reason: "server" }),
  deleteExpense: async () => ({ ok: false, reason: "server" }),
  createPayOff: async () => ({ ok: false, reason: "server" }),
  reactivateMember: async () => ({ ok: false, reason: "server" }),
  listStaff: async () => ({ ok: false, reason: "server" }),
  createStaff: async () => ({ ok: false, reason: "server" }),
  setStaffPermissions: async () => ({ ok: false, reason: "server" }),
  deactivateStaff: async () => ({ ok: false, reason: "server" }),
  reactivateStaff: async () => ({ ok: false, reason: "server" }),
  resetStaffPassword: async () => ({ ok: false, reason: "server" }),
  listAudit: async () => ({ ok: false, reason: "server" }),
  getDashboard: async () => ({ ok: false, reason: "server" }),
};

const noop = async () => null;

describe("App", () => {
  it("renders the system name while it checks for a session", () => {
    const html = renderToString(<App makeApi={() => idleApi} />);
    expect(html).toContain("IYANU-OLUWA Cooperative Management System");
    expect(html).toContain("Loading");
  });
});

describe("SignIn", () => {
  it("has an email field, a password field and a sign-in button", () => {
    const html = renderToString(<SignIn onSignIn={noop} />);
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("Sign in</button>");
  });

  it("shows a notice when given one", () => {
    expect(renderToString(<SignIn onSignIn={noop} notice={SESSION_ENDED} />)).toContain(
      SESSION_ENDED,
    );
    expect(renderToString(<SignIn onSignIn={noop} />)).not.toContain('class="notice"');
  });
});

describe("ChangePassword", () => {
  it("has three password fields", () => {
    const html = renderToString(<ChangePassword onSubmit={noop} onCancel={() => {}} />);
    expect(html.match(/type="password"/g)).toHaveLength(3);
  });

  it("checks the new password before sending it", () => {
    expect(checkNewPassword("current pass", "short", "short")).toMatch(/12 to 128/);
    expect(checkNewPassword("x", "a".repeat(129), "a".repeat(129))).toMatch(/12 to 128/);
    expect(checkNewPassword("same password", "same password", "same password")).toMatch(/differ/);
    expect(checkNewPassword("current pass", "new password 1", "new password 2")).toMatch(
      /do not match/,
    );
    expect(checkNewPassword("current pass", "a".repeat(12), "a".repeat(12))).toBeNull();
    expect(checkNewPassword("current pass", "a".repeat(128), "a".repeat(128))).toBeNull();
  });
});

describe("messages", () => {
  it("gives one message for every sign-in refusal", () => {
    expect(loginMessage({ ok: false, reason: "invalid_credentials" })).toBe(SIGN_IN_FAILED);
    expect(SIGN_IN_FAILED).toBe(
      "Sign-in failed. Check your email and password. After 5 failed tries an account is locked for 15 minutes.",
    );
    expect(loginMessage({ ok: false, reason: "network" })).toMatch(/Cannot reach/);
    expect(loginMessage({ ok: false, reason: "server" })).toMatch(/went wrong/);
    expect(loginMessage({ ok: true, me: { user: { id: "", email: "", displayName: "", role: "" }, permissions: [] } })).toBeNull();
  });

  it("maps each change-password failure", () => {
    expect(changePasswordMessage({ ok: false, reason: "wrong_password" })).toMatch(/current password is wrong/);
    expect(changePasswordMessage({ ok: false, reason: "invalid_input" })).toMatch(/12 to 128/);
    expect(changePasswordMessage({ ok: false, reason: "signed_out" })).toBe(SESSION_ENDED);
    expect(changePasswordMessage({ ok: true })).toBeNull();
    expect(PASSWORD_CHANGED).toMatch(/sign in/);
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME: Me = {
  user: { id: "u1", email: "ada@example.test", displayName: "Ada Test", role: "SUPER_ADMIN" },
  permissions: [],
};

interface FakeApi extends Api {
  calls: string[];
  /** Every payment the screen sent, in order. */
  paid: NewPayment[];
  /** Every loan the screen sent, in order. */
  lent: NewLoan[];
  /** Every expense list query the screen sent, in order. */
  expenseQueries: ExpenseFilter[];
  /** Every expense the screen recorded, in order. */
  spent: NewExpense[];
  /** Every expense edit the screen sent, in order. */
  edited: { id: string; input: ExpenseEdit }[];
  /** Every expense id the screen deleted, in order. */
  deleted: string[];
  /** Every pay-off the screen sent, in order. */
  paidOff: NewPayOff[];
  /** Every member id the screen reactivated, in order. */
  reactivated: string[];
  /** Every staff account the screen sent, in order. */
  hired: NewStaff[];
  /** Every permissions change the screen sent, in order. */
  granted: { id: string; permissions: string[] }[];
  /** Every deactivate or reactivate the screen sent, in order, as "deactivate s1" or "reactivate s1". */
  switched: string[];
  /** Every password reset the screen sent, in order. */
  resets: { id: string; password: string }[];
  /** Every audit query the screen sent, in order. */
  auditQueries: AuditFilter[];
  /** Every dashboard query the screen sent, in order. */
  dashboardQueries: DashboardQuery[];
  signOutFromServer(): void;
}

function member(id: string, membershipId: string, fullName: string, status: Member["status"] = "ACTIVE"): Member {
  return {
    id,
    membershipId,
    fullName,
    phone: "08000000000",
    address: "",
    occupation: "",
    status,
    createdById: "u1",
    createdAt: "2026-10-23T00:00:00.000Z",
  };
}

const ACTIVE_ONE = member("m1", "IO-001", "Test Member One");
const ACTIVE_TWO = member("m2", "IO-002", "Sample Person Two");
const INACTIVE_ONE = member("m3", "IO-003", "Example Inactive", "INACTIVE");

/** Members the fake server holds, answered by status filter as GET /members does. */
function byStatus(members: Member[], status: MemberStatusFilter): Member[] {
  if (status === "all") return members;
  return members.filter((m) => m.status === (status === "active" ? "ACTIVE" : "INACTIVE"));
}

function fakeApi(
  opts: {
    restore?: Me | null;
    login?: LoginResult;
    change?: ChangePasswordResult;
    members?: Member[];
    list?: CallResult<Member[]>;
    create?: CallResult<Member>;
    balances?: CallResult<MemberBalances>;
    payments?: CallResult<Payment[]>;
    loans?: CallResult<Loan[]>;
    /** Answers to createPayment in turn; the last one repeats. */
    pay?: CreatePaymentResult[];
    /** Answers to createLoan in turn; the last one repeats. */
    lend?: CreateLoanResult[];
    expenses?: CallResult<ExpenseList>;
    /** Answers to createExpense in turn; the last one repeats. */
    spend?: CreateExpenseResult[];
    /** Answers to updateExpense in turn; the last one repeats. */
    edit?: UpdateExpenseResult[];
    /** Answers to deleteExpense in turn; the last one repeats. */
    remove?: DeleteExpenseResult[];
    /** Answers to createPayOff in turn; the last one repeats. */
    payOff?: CreatePayOffResult[];
    /** Answers to reactivateMember in turn; the last one repeats. A success is saved as the server would. */
    reactivate?: ReactivateMemberResult[];
    /** The staff the fake server holds; a created account is added as the server would. */
    staff?: StaffAccount[];
    staffList?: CallResult<StaffAccount[]>;
    /** Answers to createStaff in turn; the last one repeats. */
    hire?: CreateStaffResult[];
    /** Answers to setStaffPermissions in turn; the last one repeats. A success is saved as the server would. */
    grant?: CallResult<StaffAccount>[];
    /** Answers to deactivateStaff and reactivateStaff in turn; the last one repeats. A success is saved. */
    switch?: CallResult<StaffAccount>[];
    /** Answers to resetStaffPassword in turn; the last one repeats. */
    reset?: CallResult<StaffAccount>[];
    /** Answers to listAudit in turn; the last one repeats. */
    audit?: CallResult<AuditPage>[];
    /** Answers to getDashboard in turn; the last one repeats. */
    dashboard?: CallResult<DashboardView>[];
  } = {},
): (onSignedOut: () => void) => FakeApi {
  return (onSignedOut) => {
    const calls: string[] = [];
    const paid: NewPayment[] = [];
    const lent: NewLoan[] = [];
    const expenseQueries: ExpenseFilter[] = [];
    const spent: NewExpense[] = [];
    const edited: { id: string; input: ExpenseEdit }[] = [];
    const deleted: string[] = [];
    const paidOff: NewPayOff[] = [];
    const reactivated: string[] = [];
    const hired: NewStaff[] = [];
    const granted: { id: string; permissions: string[] }[] = [];
    const switched: string[] = [];
    const resets: { id: string; password: string }[] = [];
    const auditQueries: AuditFilter[] = [];
    const dashboardQueries: DashboardQuery[] = [];
    const switchTo = (verb: string) => async (id: string) => {
      calls.push(`${verb} ${id}`);
      switched.push(`${verb} ${id}`);
      const answers = opts.switch ?? [];
      const result = answers[Math.min(switched.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      if (result.ok) opts.staff = (opts.staff ?? []).map((s) => (s.id === id ? result.value : s));
      return result;
    };
    return {
      calls,
      paid,
      lent,
      expenseQueries,
      spent,
      edited,
      deleted,
      paidOff,
      reactivated,
      hired,
      granted,
      switched,
      resets,
      auditQueries,
      dashboardQueries,
      signOutFromServer: onSignedOut,
      login: async (email, password) => {
        calls.push(`login ${email} ${password}`);
        return opts.login ?? { ok: false, reason: "invalid_credentials" };
      },
      restore: async () => opts.restore ?? null,
      me: async () => null,
      logout: async () => {
        calls.push("logout");
      },
      changePassword: async (current, next) => {
        calls.push(`change ${current} ${next}`);
        return opts.change ?? { ok: true };
      },
      listMembers: async (status) => {
        calls.push(`list ${status}`);
        return opts.list ?? { ok: true, value: byStatus(opts.members ?? [], status) };
      },
      getMember: async (id) => {
        calls.push(`get ${id}`);
        const found = (opts.members ?? []).find((m) => m.id === id);
        return found ? { ok: true, value: found } : { ok: false, reason: "not_found" };
      },
      createMember: async (input) => {
        calls.push(`create ${JSON.stringify(input)}`);
        const result = opts.create ?? { ok: false, reason: "server" };
        if (result.ok) opts.members = [...(opts.members ?? []), result.value];
        return result;
      },
      memberBalances: async (id) => {
        calls.push(`balances ${id}`);
        return opts.balances ?? { ok: false, reason: "server" };
      },
      listPayments: async (id) => {
        calls.push(`payments ${id}`);
        return opts.payments ?? { ok: true, value: [] };
      },
      listLoans: async (id) => {
        calls.push(`loans ${id}`);
        return opts.loans ?? { ok: true, value: [] };
      },
      createPayment: async (input) => {
        calls.push("pay");
        paid.push(input);
        const answers = opts.pay ?? [];
        return answers[Math.min(paid.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      createLoan: async (input) => {
        calls.push("lend");
        lent.push(input);
        const answers = opts.lend ?? [];
        return answers[Math.min(lent.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      listExpenses: async (filter) => {
        calls.push("expenses");
        expenseQueries.push(filter);
        return opts.expenses ?? { ok: true, value: { expenses: [], total: "0.00" } };
      },
      createExpense: async (input) => {
        calls.push("spend");
        spent.push(input);
        const answers = opts.spend ?? [];
        return answers[Math.min(spent.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      updateExpense: async (id, input) => {
        calls.push(`edit ${id}`);
        edited.push({ id, input });
        const answers = opts.edit ?? [];
        return answers[Math.min(edited.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      deleteExpense: async (id) => {
        calls.push(`delete ${id}`);
        deleted.push(id);
        const answers = opts.remove ?? [];
        return answers[Math.min(deleted.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      createPayOff: async (input) => {
        calls.push("payoff");
        paidOff.push(input);
        const answers = opts.payOff ?? [];
        return answers[Math.min(paidOff.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      reactivateMember: async (id) => {
        calls.push(`reactivate ${id}`);
        reactivated.push(id);
        const answers = opts.reactivate ?? [];
        const result = answers[Math.min(reactivated.length, answers.length) - 1] ?? { ok: false, reason: "server" };
        if (result.ok) opts.members = (opts.members ?? []).map((m) => (m.id === id ? result.member : m));
        return result;
      },
      listStaff: async () => {
        calls.push("staff");
        return opts.staffList ?? { ok: true, value: opts.staff ?? [] };
      },
      createStaff: async (input) => {
        calls.push("hire");
        hired.push(input);
        const answers = opts.hire ?? [];
        const result = answers[Math.min(hired.length, answers.length) - 1] ?? { ok: false, reason: "server" };
        if (result.ok) opts.staff = [...(opts.staff ?? []), result.staff];
        return result;
      },
      setStaffPermissions: async (id, permissions) => {
        calls.push(`grant ${id}`);
        granted.push({ id, permissions });
        const answers = opts.grant ?? [];
        const result = answers[Math.min(granted.length, answers.length) - 1] ?? { ok: false, reason: "server" };
        if (result.ok) opts.staff = (opts.staff ?? []).map((s) => (s.id === id ? result.value : s));
        return result;
      },
      deactivateStaff: switchTo("deactivate"),
      reactivateStaff: switchTo("reactivate"),
      resetStaffPassword: async (id, password) => {
        calls.push(`reset ${id}`);
        resets.push({ id, password });
        const answers = opts.reset ?? [];
        return answers[Math.min(resets.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
      listAudit: async (filter) => {
        calls.push("audit");
        auditQueries.push(filter);
        const answers = opts.audit ?? [];
        return (
          answers[Math.min(auditQueries.length, answers.length) - 1] ?? {
            ok: true,
            value: { entries: [], limit: filter.limit, offset: filter.offset, hasMore: false },
          }
        );
      },
      getDashboard: async (query) => {
        calls.push("dashboard");
        dashboardQueries.push(query);
        const answers = opts.dashboard ?? [];
        return answers[Math.min(dashboardQueries.length, answers.length) - 1] ?? { ok: false, reason: "server" };
      },
    };
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** Mounts the app and returns the fake Api it made. */
async function mount(make: (onSignedOut: () => void) => FakeApi): Promise<FakeApi> {
  let api: FakeApi | null = null;
  container = document.createElement("div");
  document.body.appendChild(container); // events only work inside the document (react.dev act page)
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <App
        makeApi={(onSignedOut) => {
          api = make(onSignedOut);
          return api;
        }}
      />,
    );
  });
  if (api === null) throw new Error("makeApi was not called");
  return api;
}

function el<T extends Element>(selector: string): T {
  const found = container?.querySelector<T>(selector);
  if (!found) throw new Error(`not found: ${selector}`);
  return found;
}

function inputs(type: string): HTMLInputElement[] {
  return Array.from(container?.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`) ?? []);
}

function button(text: string): HTMLButtonElement {
  const found = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === text,
  );
  if (!found) throw new Error(`no button: ${text}`);
  return found;
}

// React tracks an input's value; set it through the native setter so React sees the change.
async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function signInWith(email: string, password: string) {
  await type(el("input[type=email]"), email);
  await type(el("input[type=password]"), password);
  await click(button("Sign in"));
}

// The header and the form both have a "Change password" button; this is the form's.
function submitButton(): HTMLButtonElement {
  return el("form button[type=submit]");
}

async function openChangePassword(): Promise<HTMLInputElement[]> {
  await click(button("Change password"));
  return inputs("password");
}

function text(): string {
  return container?.textContent ?? "";
}

describe("screens (jsdom)", () => {
  it("shows sign-in when there is no session", async () => {
    await mount(fakeApi());
    expect(el("h1").textContent).toBe("Sign in");
    expect(container?.querySelector(".notice")).toBeNull();
  });

  it("shows the signed-in screen when the session is restored", async () => {
    await mount(fakeApi({ restore: ME }));
    expect(text()).toContain("Signed in as Ada Test");
    expect(el(".who").textContent).toContain("Super Admin");
  });

  it("shows the refusal and clears the password when sign-in fails", async () => {
    const api = await mount(fakeApi());
    await signInWith("ada@example.test", "wrong password");
    expect(api.calls).toEqual(["login ada@example.test wrong password"]);
    expect(el("[role=alert]").textContent).toBe(SIGN_IN_FAILED);
    expect(el<HTMLInputElement>("input[type=password]").value).toBe("");
    expect(el<HTMLInputElement>("input[type=email]").value).toBe("ada@example.test");
    expect(button("Sign in").disabled).toBe(false);
  });

  it("shows the signed-in screen after a good sign-in", async () => {
    await mount(fakeApi({ login: { ok: true, me: ME } }));
    await signInWith("ada@example.test", "a good password");
    expect(text()).toContain("Signed in as Ada Test");
    expect(container?.querySelector("[role=alert]")).toBeNull();
  });

  it("signs out and shows sign-in with no notice", async () => {
    const api = await mount(fakeApi({ restore: ME }));
    await click(button("Sign out"));
    expect(api.calls).toEqual(["logout"]);
    expect(el("h1").textContent).toBe("Sign in");
    expect(container?.querySelector(".notice")).toBeNull();
  });

  it("shows the session-ended notice when the api signs the user out", async () => {
    const api = await mount(fakeApi({ restore: ME }));
    await act(async () => api.signOutFromServer());
    expect(el(".notice").textContent).toBe(SESSION_ENDED);
  });

  it("stops two different new passwords in the browser", async () => {
    const api = await mount(fakeApi({ restore: ME }));
    const [current, next, again] = await openChangePassword();
    await type(current!, "old password 1");
    await type(next!, "new password 1");
    await type(again!, "new password 2");
    await click(submitButton());
    expect(el("[role=alert]").textContent).toMatch(/do not match/);
    expect(api.calls).toEqual([]);
  });

  it("changes the password and shows sign-in with the changed notice", async () => {
    const api = await mount(fakeApi({ restore: ME }));
    const [current, next, again] = await openChangePassword();
    await type(current!, "old password 1");
    await type(next!, "new password 1");
    await type(again!, "new password 1");
    await click(submitButton());
    expect(api.calls).toEqual(["change old password 1 new password 1"]);
    expect(el("h1").textContent).toBe("Sign in");
    expect(el(".notice").textContent).toBe(PASSWORD_CHANGED);
  });

  it("stays on the form and shows the message when the current password is wrong", async () => {
    await mount(fakeApi({ restore: ME, change: { ok: false, reason: "wrong_password" } }));
    const [current, next, again] = await openChangePassword();
    await type(current!, "old password 1");
    await type(next!, "new password 1");
    await type(again!, "new password 1");
    await click(submitButton());
    expect(el("[role=alert]").textContent).toBe("The current password is wrong.");
    expect(inputs("password")).toHaveLength(3);
  });

  it("goes back to the signed-in screen on Cancel", async () => {
    const api = await mount(fakeApi({ restore: ME }));
    await openChangePassword();
    await click(button("Cancel"));
    expect(inputs("password")).toHaveLength(0);
    expect(text()).toContain("Signed in as Ada Test");
    expect(api.calls).toEqual([]);
  });
});

describe("members helpers", () => {
  it("searches by name or Membership ID, ignoring case and outer spaces", () => {
    const all = [ACTIVE_ONE, ACTIVE_TWO, INACTIVE_ONE];
    expect(searchMembers(all, "")).toEqual(all);
    expect(searchMembers(all, "   ")).toEqual(all);
    expect(searchMembers(all, "sample")).toEqual([ACTIVE_TWO]);
    expect(searchMembers(all, " MEMBER one ")).toEqual([ACTIVE_ONE]);
    expect(searchMembers(all, "io-003")).toEqual([INACTIVE_ONE]);
    expect(searchMembers(all, "IO-00")).toEqual(all);
    expect(searchMembers(all, "nobody")).toEqual([]);
  });

  it("checks the new member's fields before sending them", () => {
    const ok = { fullName: "A", phone: "", address: "", occupation: "" };
    expect(checkNewMember(ok)).toBeNull();
    expect(checkNewMember({ ...ok, fullName: "   " })).toMatch(/1 to 100/);
    expect(checkNewMember({ ...ok, fullName: "a".repeat(100) })).toBeNull();
    expect(checkNewMember({ ...ok, fullName: "a".repeat(101) })).toMatch(/1 to 100/);
    expect(checkNewMember({ ...ok, phone: "1".repeat(200) })).toBeNull();
    expect(checkNewMember({ ...ok, phone: "1".repeat(201) })).toMatch(/at most 200/);
    expect(checkNewMember({ ...ok, address: "a".repeat(201) })).toMatch(/at most 200/);
    expect(checkNewMember({ ...ok, occupation: "a".repeat(201) })).toMatch(/at most 200/);
  });

  it("maps each member call failure", () => {
    expect(memberMessage("forbidden")).toMatch(/permission/);
    expect(memberMessage("invalid_input")).toMatch(/refused/);
    expect(memberMessage("not_found")).toMatch(/not found/);
    expect(memberMessage("signed_out")).toBeNull();
    expect(memberMessage("network")).toMatch(/Cannot reach/);
    expect(memberMessage("server")).toMatch(/went wrong/);
  });
});

const VIEWER: Me = { ...ME, user: { ...ME.user, role: "STAFF" }, permissions: ["members.view"] };
const ADDER: Me = { ...ME, permissions: ["members.view", "members.create"] };

function rowTexts(): string[] {
  return Array.from(container?.querySelectorAll("tbody tr") ?? []).map((r) => r.textContent ?? "");
}

async function openMembers() {
  await click(button("Members"));
}

describe("members screen (jsdom)", () => {
  it("has no Members button without members.view", async () => {
    await mount(fakeApi({ restore: ME }));
    expect(() => button("Members")).toThrow();
  });

  it("lists Active members first and changes the filter", async () => {
    const api = await mount(
      fakeApi({ restore: VIEWER, members: [ACTIVE_ONE, ACTIVE_TWO, INACTIVE_ONE] }),
    );
    await openMembers();
    expect(api.calls).toEqual(["list active"]);
    expect(el("h1").textContent).toBe("Members");
    expect(rowTexts()).toHaveLength(2);
    expect(rowTexts()[0]).toContain("IO-001");
    expect(rowTexts()[0]).toContain("Test Member One");
    expect(el("section h2").textContent).toBe("2 active members");

    await click(button("Inactive"));
    expect(api.calls).toEqual(["list active", "list inactive"]);
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("Inactive");

    await click(button("All"));
    expect(api.calls.at(-1)).toBe("list all");
    expect(rowTexts()).toHaveLength(3);
    expect(el("section h2").textContent).toBe("3 members");
  });

  it("filters the list in the browser by search text", async () => {
    const api = await mount(fakeApi({ restore: VIEWER, members: [ACTIVE_ONE, ACTIVE_TWO] }));
    await openMembers();
    await type(el("input[type=search]"), "io-002");
    expect(rowTexts()).toHaveLength(1);
    expect(rowTexts()[0]).toContain("Sample Person Two");
    await type(el("input[type=search]"), "nobody");
    expect(rowTexts()).toHaveLength(0);
    expect(text()).toContain("No members found.");
    expect(api.calls).toEqual(["list active"]);
  });

  it("shows the message when the list cannot be read", async () => {
    await mount(fakeApi({ restore: VIEWER, list: { ok: false, reason: "network" } }));
    await openMembers();
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(rowTexts()).toHaveLength(0);
  });

  it("has no add button without members.create", async () => {
    await mount(fakeApi({ restore: VIEWER }));
    await openMembers();
    expect(() => button("+ Add member")).toThrow();
  });

  it("adds a member, shows the new Membership ID and reloads the list", async () => {
    const added = member("m9", "IO-009", "New Test Member");
    const api = await mount(
      fakeApi({ restore: ADDER, members: [ACTIVE_ONE], create: { ok: true, value: added } }),
    );
    await openMembers();
    await click(button("+ Add member"));
    await type(el("input[name=fullName]"), "  New Test Member ");
    await type(el("input[name=phone]"), "08000000009");
    await type(el("input[name=occupation]"), "Trader");
    expect(() => button("Save without payment")).toThrow(); // no payments.create
    expect(text()).not.toContain("payment form opens");
    await click(button("Save member"));
    expect(api.calls).toEqual([
      "list active",
      'create {"fullName":"New Test Member","phone":"08000000009","address":"","occupation":"Trader"}',
      "list active",
    ]);
    expect(el("[role=status]").textContent).toBe("New Test Member was added as IO-009.");
    expect(container?.querySelector("form")).toBeNull();
    expect(rowTexts()).toHaveLength(2);
    expect(rowTexts()[1]).toContain("IO-009");
  });

  it("stops an empty full name in the browser", async () => {
    const api = await mount(fakeApi({ restore: ADDER }));
    await openMembers();
    await click(button("+ Add member"));
    await type(el("input[name=fullName]"), "   ");
    await act(async () => {
      el<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(el("[role=alert]").textContent).toMatch(/1 to 100/);
    expect(api.calls).toEqual(["list active"]);
  });

  it("keeps the form and shows the message when the server refuses", async () => {
    const api = await mount(
      fakeApi({ restore: ADDER, create: { ok: false, reason: "forbidden" } }),
    );
    await openMembers();
    await click(button("+ Add member"));
    await type(el("input[name=fullName]"), "Test Member");
    await click(button("Save member"));
    expect(el("[role=alert]").textContent).toBe("You do not have permission to do this.");
    expect(el<HTMLInputElement>("input[name=fullName]").value).toBe("Test Member");
    expect(button("Save member").disabled).toBe(false);
    expect(api.calls).toHaveLength(2);
  });

  it("closes the form on Cancel without a call", async () => {
    const api = await mount(fakeApi({ restore: ADDER }));
    await openMembers();
    await click(button("+ Add member"));
    await click(button("Cancel"));
    expect(container?.querySelector("form")).toBeNull();
    expect(api.calls).toEqual(["list active"]);
  });
});

describe("member detail helpers", () => {
  it("adds the naira sign and thousands commas to a naira string, nothing else", () => {
    expect(formatNaira("0.00")).toBe("₦0.00");
    expect(formatNaira("999.99")).toBe("₦999.99");
    expect(formatNaira("1000.00")).toBe("₦1,000.00");
    expect(formatNaira("25000.05")).toBe("₦25,000.05");
    expect(formatNaira("1234567890123.40")).toBe("₦1,234,567,890,123.40");
    expect(formatNaira("12.5")).toBe("12.5");
    expect(formatNaira("")).toBe("");
  });

  it("shows the day in Lagos", () => {
    expect(formatDate("2026-10-23T09:00:00.000Z")).toBe("23 Oct 2026");
    // 23:30 UTC on 31 October is 00:30 on 1 November in Lagos (UTC+1).
    expect(formatDate("2026-10-31T23:30:00.000Z")).toBe("1 Nov 2026");
    expect(formatDate("not a date")).toBe("not a date");
  });

  it("shows the day in Lagos when the machine runs in another time zone", async () => {
    // The date format is made when the module loads, so load it again under UTC (A-202, V9).
    const before = process.env["TZ"];
    process.env["TZ"] = "UTC";
    try {
      vi.resetModules();
      const fresh = await import("../src/Members.tsx");
      expect(fresh.formatDate("2026-10-31T23:30:00.000Z")).toBe("1 Nov 2026");
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
      vi.resetModules();
    }
  });
});

const FULL: Me = {
  ...ME,
  permissions: ["members.view", "payments.view", "loans.view"],
};

const DETAIL_BALANCES: MemberBalances = {
  memberId: "m1",
  categories: [
    { category: "Shares", balance: "25000.05", refundable: true },
    { category: "Development Levy", balance: "1500.00", refundable: false },
  ],
  refundableTotal: "25000.05",
  nonRefundableTotal: "1500.00",
};

function payment(id: string, createdAt: string, total: string): Payment {
  return {
    id,
    memberId: "m1",
    membershipId: "IO-001",
    method: "CASH",
    total,
    paidOn: createdAt.slice(0, 10),
    lines: [{ category: "Shares", amount: total }],
    createdById: "u1",
    createdAt,
  };
}

const ACTIVE_LOAN: Loan = {
  id: "l1",
  memberId: "m1",
  membershipId: "IO-001",
  principal: "50000.00",
  interestNote: "",
  notes: "",
  givenOn: "2026-10-20",
  expenseId: "e1",
  createdById: "u1",
  createdAt: "2026-10-20T09:00:00.000Z",
  repaid: "10000.00",
  outstanding: "40000.00",
  status: "ACTIVE",
};

async function openDetail(name: string) {
  await openMembers();
  await click(el(`button[aria-label="View ${name}"]`));
}

function sectionText(title: string): string {
  const section = Array.from(container?.querySelectorAll("section") ?? []).find(
    (s) => s.querySelector("h2")?.textContent === title,
  );
  if (!section) throw new Error(`no section: ${title}`);
  return section.textContent ?? "";
}

describe("member detail (jsdom)", () => {
  it("shows the profile, balances, loans and payments, newest payment first", async () => {
    const api = await mount(
      fakeApi({
        restore: FULL,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: DETAIL_BALANCES },
        loans: { ok: true, value: [ACTIVE_LOAN] },
        payments: {
          ok: true,
          value: [
            payment("p1", "2026-10-21T09:00:00.000Z", "1000.00"),
            payment("p2", "2026-10-22T09:00:00.000Z", "24000.05"),
          ],
        },
      }),
    );
    await openDetail("Test Member One");
    expect(api.calls).toEqual(["list active", "get m1", "balances m1", "payments m1", "loans m1"]);
    expect(el("h1").textContent).toBe("Test Member One");
    expect(text()).toContain("IO-001 · Joined 23 Oct 2026");
    expect(el(".loan").textContent).toBe("On loan");
    expect(sectionText("Profile")).toContain("Phone08000000000");
    expect(sectionText("Profile")).toContain("Address—");

    const balances = sectionText("Balances");
    expect(balances).toContain("Refundable total (paid out at pay-off)₦25,000.05");
    expect(balances).toContain("Retained by cooperative₦1,500.00");
    expect(balances).toContain("Development Levy₦1,500.00No, retained");

    expect(sectionText("Loans")).toContain("20 Oct 2026₦50,000.00₦10,000.00₦40,000.00Active");

    const rows = Array.from(
      container?.querySelectorAll("table.payments tbody tr") ?? [],
    ).map((r) => r.textContent);
    expect(rows).toEqual([
      "22 Oct 2026CashShares ₦24,000.05₦24,000.05",
      "21 Oct 2026CashShares ₦1,000.00₦1,000.00",
    ]);
  });

  it("leaves out payments and loans without payments.view and loans.view", async () => {
    const api = await mount(
      fakeApi({
        restore: VIEWER,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: DETAIL_BALANCES },
      }),
    );
    await openDetail("Test Member One");
    expect(api.calls).toEqual(["list active", "get m1", "balances m1"]);
    expect(() => sectionText("Payments")).toThrow();
    expect(() => sectionText("Loans")).toThrow();
    expect(sectionText("Balances")).toContain("₦25,000.05");
    expect(container?.querySelector(".loan")).toBeNull();
  });

  it("says when there are no loans or payments", async () => {
    await mount(
      fakeApi({ restore: FULL, members: [ACTIVE_ONE], balances: { ok: true, value: DETAIL_BALANCES } }),
    );
    await openDetail("Test Member One");
    expect(sectionText("Loans")).toContain("No loans.");
    expect(sectionText("Payments")).toContain("No payments yet.");
    expect(container?.querySelector(".loan")).toBeNull();
  });

  it("shows loans newest first, and each payment's method, lines and own total", async () => {
    const older: Loan = { ...ACTIVE_LOAN, id: "l0", givenOn: "2026-10-01", createdAt: "2026-10-01T09:00:00.000Z", repaid: "20000.00", outstanding: "0.00", status: "FULLY_REPAID" };
    const transfer: Payment = {
      ...payment("p3", "2026-10-22T09:00:00.000Z", "7000.50"),
      method: "BANK_TRANSFER",
      lines: [
        { category: "Savings", amount: "5000.50" },
        { category: "Shares", amount: "2000.00" },
      ],
    };
    await mount(
      fakeApi({
        restore: FULL,
        members: [ACTIVE_ONE],
        loans: { ok: true, value: [older, ACTIVE_LOAN] },
        payments: { ok: true, value: [transfer] },
      }),
    );
    await openDetail("Test Member One");
    const loanRows = Array.from(container?.querySelectorAll("table.loans tbody tr") ?? []).map(
      (r) => r.textContent,
    );
    expect(loanRows).toEqual([
      "20 Oct 2026₦50,000.00₦10,000.00₦40,000.00Active",
      "1 Oct 2026₦50,000.00₦20,000.00₦0.00Fully repaid",
    ]);
    expect(el("table.payments tbody tr").textContent).toBe(
      "22 Oct 2026Bank transferSavings ₦5,000.50, Shares ₦2,000.00₦7,000.50",
    );
  });

  it("lists each loan by the day it was given, not the time it was recorded", async () => {
    const late: Loan = { ...ACTIVE_LOAN, givenOn: "2026-09-30", createdAt: "2026-10-23T09:00:00.000Z" };
    await mount(fakeApi({ restore: FULL, members: [ACTIVE_ONE], loans: { ok: true, value: [late] } }));
    await openDetail("Test Member One");
    expect(el("table.loans tbody tr").textContent).toBe(
      "30 Sep 2026₦50,000.00₦10,000.00₦40,000.00Active",
    );
  });

  it("shows a fully repaid loan without the On loan badge", async () => {
    const repaid: Loan = { ...ACTIVE_LOAN, repaid: "50000.00", outstanding: "0.00", status: "FULLY_REPAID" };
    await mount(
      fakeApi({ restore: FULL, members: [ACTIVE_ONE], loans: { ok: true, value: [repaid] } }),
    );
    await openDetail("Test Member One");
    expect(sectionText("Loans")).toContain("₦0.00Fully repaid");
    expect(container?.querySelector(".loan")).toBeNull();
  });

  it("shows each section's own message when one read fails", async () => {
    await mount(
      fakeApi({
        restore: FULL,
        members: [ACTIVE_ONE],
        balances: { ok: false, reason: "network" },
        payments: { ok: false, reason: "forbidden" },
      }),
    );
    await openDetail("Test Member One");
    expect(sectionText("Balances")).toContain("Cannot reach the server. Try again.");
    expect(sectionText("Payments")).toContain("You do not have permission to do this.");
    expect(sectionText("Loans")).toContain("No loans.");
    expect(el("h1").textContent).toBe("Test Member One");
  });

  it("shows only the message when the member cannot be read", async () => {
    const api = await mount(fakeApi({ restore: FULL, members: [ACTIVE_ONE] }));
    await openMembers();
    // The member is gone from the fake server after the list was read.
    api.getMember = async () => ({ ok: false, reason: "not_found" });
    await click(el('button[aria-label="View Test Member One"]'));
    expect(el("[role=alert]").textContent).toBe("Member not found.");
    expect(container?.querySelector("section")).toBeNull();
  });

  it("goes back to the list with the filter and search kept, without a new list call", async () => {
    const api = await mount(
      fakeApi({ restore: FULL, members: [ACTIVE_ONE, ACTIVE_TWO, INACTIVE_ONE] }),
    );
    await openMembers();
    await click(button("All"));
    await type(el("input[type=search]"), "example");
    await click(el('button[aria-label="View Example Inactive"]'));
    expect(text()).toContain("Inactive");
    await click(button("← Back to members"));
    expect(el<HTMLInputElement>("input[type=search]").value).toBe("example");
    expect(el("button[aria-pressed=true]").textContent).toBe("All");
    expect(rowTexts()).toHaveLength(1);
    expect(api.calls.filter((c) => c.startsWith("list"))).toEqual(["list active", "list all"]);
  });
});

const FORM: PaymentFormInput = {
  paidOn: "2026-10-20",
  method: "CASH",
  total: "20000",
  lines: [
    { category: "Shares", amount: "5000" },
    { category: "Savings", amount: "10000.5" },
    { category: "Loan Repaid", amount: "4999.50" },
  ],
  sendSms: true,
};

describe("payment form helpers", () => {
  it("offers the DR-04 categories in order, without Membership Withdrawal", () => {
    expect(PAYMENT_CATEGORIES).toEqual([
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
    ]);
    expect(PAYMENT_LINES_MAX).toBe(20);
  });

  it("reads typed naira as whole kobo, as the server does", () => {
    expect(nairaToKobo("20000")).toBe(2000000n);
    expect(nairaToKobo("20000.5")).toBe(2000050n);
    expect(nairaToKobo("20000.05")).toBe(2000005n);
    expect(nairaToKobo(" 0.01 ")).toBe(1n);
    expect(nairaToKobo("0")).toBe(0n);
    expect(nairaToKobo("999999999999.99")).toBe(99999999999999n);
    for (const bad of ["", "1.234", "-5", "1,000", "₦5", "1e3", ".5", "5.", "1000000000000"]) {
      expect(nairaToKobo(bad)).toBeNull();
    }
  });

  it("writes whole kobo as the server's naira string", () => {
    expect(koboToNaira(0n)).toBe("0.00");
    expect(koboToNaira(5n)).toBe("0.05");
    expect(koboToNaira(2000050n)).toBe("20000.50");
    expect(() => koboToNaira(-1n)).toThrow(RangeError);
  });

  it("adds the breakdown exactly, and gives null while a line is not an amount", () => {
    expect(breakdownKobo(FORM.lines)).toBe(2000000n);
    // 0.1 + 0.2 is not 0.3 in floating point; in kobo it is.
    expect(
      breakdownKobo([
        { category: "Shares", amount: "0.1" },
        { category: "Savings", amount: "0.2" },
      ]),
    ).toBe(30n);
    expect(breakdownKobo([])).toBe(0n);
    expect(breakdownKobo([...FORM.lines, { category: "Shares", amount: "" }])).toBeNull();
  });

  it("gives the day in Lagos, also near midnight UTC", () => {
    expect(lagosToday(new Date("2026-10-23T09:00:00.000Z"))).toBe("2026-10-23");
    expect(lagosToday(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11-01");
    expect(lagosToday(new Date("2026-10-31T22:59:59.000Z"))).toBe("2026-10-31");
  });

  it("gives the day in Lagos when the machine runs in another time zone", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "UTC";
    try {
      vi.resetModules();
      const fresh = await import("../src/Members.tsx");
      expect(fresh.lagosToday(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11-01");
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
      vi.resetModules();
    }
  });

  it("knows a real calendar day", () => {
    for (const good of ["2026-10-23", "2028-02-29", "2000-02-29", "2026-12-31", "2026-01-01"]) {
      expect(isCalendarDay(good)).toBe(true);
    }
    for (const bad of [
      "2026-02-29",
      "1900-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-00-10",
      "2026-10-00",
      "26-10-23",
      "12026-10-01",
      "2026-1-5",
      "",
    ]) {
      expect(isCalendarDay(bad)).toBe(false);
    }
  });

  it("checks the form and gives the fields to send, amounts as the server writes them", () => {
    expect(checkPayment(FORM, "2026-10-23")).toEqual({
      ok: true,
      value: {
        paidOn: "2026-10-20",
        method: "CASH",
        total: "20000.00",
        lines: [
          { category: "Shares", amount: "5000.00" },
          { category: "Savings", amount: "10000.50" },
          { category: "Loan Repaid", amount: "4999.50" },
        ],
        sendSms: true,
      },
    });
    const today = checkPayment({ ...FORM, paidOn: "2026-10-23", sendSms: false }, "2026-10-23");
    expect(today.ok && today.value.paidOn).toBe("2026-10-23");
    expect(today.ok && today.value.sendSms).toBe(false);
  });

  it("refuses each bad field with its own message, in the server's order", () => {
    const refused = (input: Partial<PaymentFormInput>) => {
      const result = checkPayment({ ...FORM, ...input }, "2026-10-23");
      return result.ok ? null : result.message;
    };
    expect(refused({ paidOn: "" })).toBe("Enter the payment date.");
    expect(refused({ paidOn: "2026-02-30" })).toBe("Enter the payment date.");
    expect(refused({ paidOn: "2026-10-24" })).toBe("The payment date cannot be after today.");
    expect(refused({ paidOn: "2026-10-24", total: "" })).toBe(
      "The payment date cannot be after today.",
    );
    expect(refused({ lines: [] })).toBe("Add at least one breakdown line.");
    const many = Array.from({ length: 21 }, () => ({ category: "Shares", amount: "1" }));
    expect(refused({ total: "21", lines: many })).toBe(
      "A payment may have at most 20 breakdown lines.",
    );
    expect(refused({ total: "20", lines: many.slice(0, 20) })).toBeNull();
    expect(refused({ total: "" })).toBe("Enter a total above ₦0.00, with at most 2 decimals.");
    expect(refused({ total: "0" })).toBe("Enter a total above ₦0.00, with at most 2 decimals.");
    expect(refused({ total: "20000.001" })).toBe(
      "Enter a total above ₦0.00, with at most 2 decimals.",
    );
    const line = (category: string, amount: string) => [FORM.lines[0]!, { category, amount }];
    expect(refused({ lines: line("Membership Withdrawal", "15000") })).toBe(
      "Choose a category on line 2.",
    );
    expect(refused({ lines: line("", "15000") })).toBe("Choose a category on line 2.");
    expect(refused({ lines: line("Savings", "0") })).toBe(
      "Enter an amount above ₦0.00 on line 2, with at most 2 decimals.",
    );
    expect(refused({ lines: line("Savings", "abc") })).toBe(
      "Enter an amount above ₦0.00 on line 2, with at most 2 decimals.",
    );
    expect(refused({ total: "20000.01" })).toBe("The breakdown must add up to the total exactly.");
    expect(refused({ total: "19999.99" })).toBe("The breakdown must add up to the total exactly.");
  });

  it("maps each refused payment to a message", () => {
    const msg = (reason: Parameters<typeof paymentMessage>[0]["reason"], extra = {}) =>
      paymentMessage({ ok: false, reason, ...extra });
    expect(msg("member_inactive")).toBe(
      "This member is Inactive. Reactivate the member before recording a payment.",
    );
    expect(msg("no_active_loan")).toBe("Loan Repaid needs an active loan, and this member has none.");
    expect(msg("loan_overpayment")).toBe("The Loan Repaid amount is more than the loan outstanding.");
    expect(msg("idempotency_conflict")).toBe(
      "This attempt was already sent with other details. Check the member's payments, then start again.",
    );
    expect(msg("invalid_input", { code: "mismatch" })).toBe(
      "The breakdown must add up to the total exactly.",
    );
    expect(msg("invalid_input", { code: "future_paid_on" })).toBe(
      "The payment date cannot be after today.",
    );
    expect(msg("invalid_input", { code: "invalid_amount", lineIndex: 2 })).toBe(
      "A breakdown amount was refused. Use at most 2 decimals. (line 3)",
    );
    expect(msg("invalid_input", { code: "something_new", lineIndex: 0 })).toBe(
      "The payment was refused. Check the fields and try again. (line 1)",
    );
    expect(msg("invalid_input")).toBe("The payment was refused. Check the fields and try again.");
    expect(msg("invalid_input", { code: "toString" })).toBe(
      "The payment was refused. Check the fields and try again.",
    );
    expect(msg("forbidden")).toBe("You do not have permission to do this.");
    expect(msg("not_found")).toBe("Member not found.");
    expect(msg("signed_out")).toBeNull();
    expect(msg("network")).toBe(
      "Cannot reach the server. Press Record payment again: it will not be saved twice.",
    );
    expect(msg("server")).toBe(
      "Something went wrong. Press Record payment again: it will not be saved twice.",
    );
  });

  it("says what happened to the SMS receipt", () => {
    expect(smsMessage({ status: "sent" })).toBe("SMS receipt sent.");
    expect(smsMessage({ status: "not_requested" })).toBe("No SMS receipt was requested.");
    expect(smsMessage({ status: "skipped_repeat" })).toBe(
      "This payment was already saved, so no new SMS receipt was sent.",
    );
    expect(smsMessage({ status: "failed", reason: "invalid_number" })).toBe(
      "The SMS receipt was not sent: the member's phone number was refused.",
    );
    expect(smsMessage({ status: "failed", reason: "invalid_message" })).toBe(
      "The SMS receipt was not sent: the message was refused.",
    );
    expect(smsMessage({ status: "failed", reason: "provider_error" })).toBe(
      "The SMS receipt was not sent: the SMS provider failed.",
    );
  });

  it("makes a 32-character hex key the server accepts, new each time", () => {
    const fixed = newIdempotencyKey((bytes) => bytes.forEach((_, i) => (bytes[i] = i * 17)));
    expect(fixed).toBe("00112233445566778899aabbccddeeff");
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(a).not.toBe(b);
  });
});

describe("payment form display helpers", () => {
  it("writes a payment day as formatDate writes a day, and other text as it came", () => {
    expect(formatDay("2026-10-05")).toBe("5 Oct 2026");
    expect(formatDay("2026-01-31")).toBe("31 Jan 2026");
    expect(formatDay("2026-12-01")).toBe("1 Dec 2026");
    expect(formatDay("2026-13-01")).toBe("2026-13-01");
    expect(formatDay("")).toBe("");
  });

  it("labels the button by the SMS toggle", () => {
    expect(recordButtonLabel(true)).toBe("Record payment + SMS requested");
    expect(recordButtonLabel(false)).toBe("Record payment without SMS");
  });

  it("says what was saved and what happened to the SMS", () => {
    const saved = {
      ok: true as const,
      payment: { ...payment("p1", "2026-10-23T09:00:00.000Z", "20000.00"), paidOn: "2026-10-20" },
      replayed: true,
      sms: { status: "skipped_repeat" as const },
    };
    expect(savedPaymentMessage(saved)).toBe(
      "Payment of ₦20,000.00 on 20 Oct 2026 recorded. This payment was already saved, so no new SMS receipt was sent.",
    );
  });
});

const PAYER: Me = {
  ...ME,
  user: { ...ME.user, role: "STAFF" },
  permissions: ["members.view", "payments.view", "loans.view", "payments.create"],
};

function savedPayment(total: string, paidOn: string, sms: SmsOutcome): CreatePaymentResult {
  return {
    ok: true,
    payment: { ...payment("p9", "2026-10-23T09:00:00.000Z", total), paidOn },
    replayed: false,
    sms,
  };
}

// React reads a select's value on "change"; set it through the native setter as type() does.
async function choose(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function amountInput(line: number): HTMLInputElement {
  return el(`input[aria-label="Amount, line ${line}"]`);
}

function categorySelect(line: number): HTMLSelectElement {
  return el(`select[aria-label="Category, line ${line}"]`);
}

async function openPaymentForm() {
  await openDetail("Test Member One");
  await click(button("Record payment"));
}

/** Total ₦20,000: Shares ₦5,000 and Savings ₦15,000 (the second line comes as Savings). */
async function fillTwentyThousand() {
  await type(el("input[name=total]"), "20000");
  await type(amountInput(1), "5000");
  await click(button("+ Add category"));
  await type(amountInput(2), "15000");
}

async function submitPayment() {
  await click(el(".payment-form button[type=submit]"));
}

function countCalls(api: FakeApi, call: string): number {
  return api.calls.filter((c) => c === call).length;
}

describe("payment form (jsdom)", () => {
  it("has no Record payment button without payments.create", async () => {
    await mount(fakeApi({ restore: FULL, members: [ACTIVE_ONE] }));
    await openDetail("Test Member One");
    expect(el("h1").textContent).toBe("Test Member One");
    expect(() => button("Record payment")).toThrow();
  });

  it("has no Record payment button for an Inactive member", async () => {
    await mount(fakeApi({ restore: PAYER, members: [INACTIVE_ONE] }));
    await openMembers();
    await click(button("All"));
    await click(el('button[aria-label="View Example Inactive"]'));
    expect(el("h1").textContent).toBe("Example Inactive");
    expect(() => button("Record payment")).toThrow();
  });

  it("opens with today's day in Lagos, Bank transfer, one Shares line and the SMS receipt on", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    expect(() => button("Record payment")).toThrow(); // the open button hides while the form shows
    expect(el<HTMLInputElement>("input[name=paidOn]").value).toBe(lagosToday());
    expect(el<HTMLInputElement>("input[name=paidOn]").max).toBe(lagosToday());
    expect(el<HTMLSelectElement>("select[name=method]").value).toBe("BANK_TRANSFER");
    expect(categorySelect(1).value).toBe("Shares");
    expect(Array.from(categorySelect(1).options, (o) => o.value)).toEqual([...PAYMENT_CATEGORIES]);
    expect(container?.querySelectorAll(".remove-line")).toHaveLength(0);
    const sms = el<HTMLInputElement>("input[name=sendSms]");
    expect(sms.checked).toBe(true);
    expect(el(".payment-form button[type=submit]").textContent).toBe("Record payment + SMS requested");
    await click(sms);
    expect(el(".payment-form button[type=submit]").textContent).toBe("Record payment without SMS");
  });

  it("shows the breakdown sum and whether it matches the total, as typed", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    await type(el("input[name=total]"), "20000");
    await type(amountInput(1), "5000");
    expect(el(".breakdown-head span").textContent).toBe("Breakdown: ₦5,000.00 · must match the total");
    await click(button("+ Add category"));
    expect(categorySelect(2).value).toBe("Savings");
    await type(amountInput(2), "abc");
    expect(el(".breakdown-head span").textContent).toBe("Breakdown: — · must match the total");
    await type(amountInput(2), "15000");
    expect(el(".breakdown-head span").textContent).toBe("Breakdown: ₦20,000.00 ✓ matches the total");
  });

  it("shows no match for a total of ₦0.00", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    await type(el("input[name=total]"), "0");
    await type(amountInput(1), "0");
    expect(el(".breakdown-head span").textContent).toBe("Breakdown: ₦0.00 · must match the total");
  });

  it("stops a payment date after today in Lagos, with no call", async () => {
    const api = await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    const tomorrow = lagosToday(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await type(el("input[name=paidOn]"), tomorrow);
    await fillTwentyThousand();
    // The input's max stops a button press in jsdom; send submit straight to the form so the
    // form's own date check runs, as it must where the browser does not enforce max.
    await act(async () => {
      el<HTMLFormElement>(".payment-form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(el(".payment-form [role=alert]").textContent).toBe(
      "The payment date cannot be after today.",
    );
    expect(api.paid).toEqual([]);
  });

  it("stops a breakdown that does not add up, with no call", async () => {
    const api = await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    await type(el("input[name=total]"), "20000");
    await type(amountInput(1), "19999.99");
    await submitPayment();
    expect(el("[role=alert]").textContent).toBe("The breakdown must add up to the total exactly.");
    expect(api.paid).toEqual([]);
  });

  it("records the payment, shows the notice and reads balances, payments and loans again", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: DETAIL_BALANCES },
        pay: [savedPayment("20000.00", "2026-10-20", { status: "sent" })],
      }),
    );
    await openPaymentForm();
    await type(el("input[name=paidOn]"), "2026-10-20");
    await choose(el("select[name=method]"), "CASH");
    await fillTwentyThousand();
    await submitPayment();

    expect(api.paid).toHaveLength(1);
    const sent = api.paid[0]!;
    expect(sent.idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
    expect({ ...sent, idempotencyKey: "" }).toEqual({
      idempotencyKey: "",
      memberId: "m1",
      method: "CASH",
      paidOn: "2026-10-20",
      total: "20000.00",
      lines: [
        { category: "Shares", amount: "5000.00" },
        { category: "Savings", amount: "15000.00" },
      ],
      sendSms: true,
    });
    expect(el("[role=status]").textContent).toBe(
      "Payment of ₦20,000.00 on 20 Oct 2026 recorded. SMS receipt sent.",
    );
    expect(container?.querySelector(".payment-form")).toBeNull();
    expect(button("Record payment")).toBeTruthy();
    expect(countCalls(api, "get m1")).toBe(1);
    expect(countCalls(api, "balances m1")).toBe(2);
    expect(countCalls(api, "payments m1")).toBe(2);
    expect(countCalls(api, "loans m1")).toBe(2);
  });

  it("sends the same key after a network failure, and a new key after any change", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER,
        members: [ACTIVE_ONE],
        pay: [
          { ok: false, reason: "network" },
          { ok: false, reason: "server" },
          savedPayment("20000.00", lagosToday(), { status: "not_requested" }),
        ],
      }),
    );
    await openPaymentForm();
    await fillTwentyThousand();
    await submitPayment();
    expect(el("[role=alert]").textContent).toBe(
      "Cannot reach the server. Press Record payment again: it will not be saved twice.",
    );
    await submitPayment();
    expect(el("[role=alert]").textContent).toContain("Something went wrong.");
    expect(api.paid[1]!.idempotencyKey).toBe(api.paid[0]!.idempotencyKey);
    expect(api.paid[1]).toEqual(api.paid[0]);

    await click(el<HTMLInputElement>("input[name=sendSms]"));
    await submitPayment();
    expect(api.paid).toHaveLength(3);
    expect(api.paid[2]!.sendSms).toBe(false);
    expect(api.paid[2]!.idempotencyKey).not.toBe(api.paid[0]!.idempotencyKey);
    expect(el("[role=status]").textContent).toContain("No SMS receipt was requested.");
  });

  it("makes a new key after idempotency_conflict", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER,
        members: [ACTIVE_ONE],
        pay: [{ ok: false, reason: "idempotency_conflict" }],
      }),
    );
    await openPaymentForm();
    await fillTwentyThousand();
    await submitPayment();
    await submitPayment();
    expect(api.paid).toHaveLength(2);
    expect(api.paid[1]!.idempotencyKey).not.toBe(api.paid[0]!.idempotencyKey);
  });

  it("keeps the form and shows the server's refusal with its line", async () => {
    await mount(
      fakeApi({
        restore: PAYER,
        members: [ACTIVE_ONE],
        pay: [{ ok: false, reason: "invalid_input", code: "amount_not_positive", lineIndex: 1 }],
      }),
    );
    await openPaymentForm();
    await fillTwentyThousand();
    await submitPayment();
    expect(el("[role=alert]").textContent).toBe(
      "Each breakdown amount must be above ₦0.00. (line 2)",
    );
    expect(el<HTMLInputElement>("input[name=total]").value).toBe("20000");
    expect(container?.querySelector("[role=status]")).toBeNull();
  });

  it("adds lines up to the cap and removes the chosen one", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    for (let i = 1; i < PAYMENT_LINES_MAX; i++) await click(button("+ Add category"));
    expect(container?.querySelectorAll(".breakdown-row")).toHaveLength(PAYMENT_LINES_MAX);
    expect(button("+ Add category").disabled).toBe(true);
    await type(amountInput(2), "7");
    await type(amountInput(3), "8");
    await click(el('button[aria-label="Remove line 2"]'));
    expect(container?.querySelectorAll(".breakdown-row")).toHaveLength(PAYMENT_LINES_MAX - 1);
    expect(amountInput(2).value).toBe("8");
    expect(button("+ Add category").disabled).toBe(false);
  });

  it("closes on Cancel with no call", async () => {
    const api = await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openPaymentForm();
    await click(button("Cancel"));
    expect(container?.querySelector(".payment-form")).toBeNull();
    expect(api.paid).toEqual([]);
  });

  it("lists each payment by the day it was paid, not the time it was recorded", async () => {
    await mount(
      fakeApi({
        restore: FULL,
        members: [ACTIVE_ONE],
        payments: {
          ok: true,
          value: [{ ...payment("p1", "2026-10-23T09:00:00.000Z", "1000.00"), paidOn: "2026-09-30" }],
        },
      }),
    );
    await openDetail("Test Member One");
    expect(el("table.payments tbody tr").textContent).toBe("30 Sep 2026CashShares ₦1,000.00₦1,000.00");
  });
});

const ADD_PAYER: Me = {
  ...PAYER,
  permissions: ["members.view", "members.create", "payments.view", "loans.view", "payments.create"],
};

const NEW_MEMBER = member("m9", "IO-009", "New Test Member");

async function fillNewMember() {
  await openMembers();
  await click(button("+ Add member"));
  await type(el("input[name=fullName]"), "New Test Member");
}

describe("first payment after adding a member (jsdom)", () => {
  it("opens the new member's detail with the payment form, then records the first payment", async () => {
    const api = await mount(
      fakeApi({
        restore: ADD_PAYER,
        members: [ACTIVE_ONE],
        create: { ok: true, value: NEW_MEMBER },
        pay: [savedPayment("20000.00", lagosToday(), { status: "sent" })],
      }),
    );
    await fillNewMember();
    expect(text()).toContain("After saving, the payment form opens for the first payment.");
    await click(button("Add member & record payment"));

    expect(el("h1").textContent).toBe("New Test Member");
    expect(el("[role=status]").textContent).toBe(
      "New Test Member was added as IO-009. Record the first payment now.",
    );
    expect(container?.querySelector(".payment-form")).not.toBeNull();
    expect(() => button("Record payment")).toThrow();
    expect(api.calls).toContain("get m9");
    expect(countCalls(api, "list active")).toBe(2); // the list is read again for the way back

    await fillTwentyThousand();
    await submitPayment();
    expect(api.paid).toHaveLength(1);
    expect(api.paid[0]!.memberId).toBe("m9");
    expect(el("[role=status]").textContent).toBe(
      `Payment of ₦20,000.00 on ${formatDay(lagosToday())} recorded. SMS receipt sent.`,
    );
    expect(container?.querySelector(".payment-form")).toBeNull();

    await click(button("← Back to members"));
    expect(rowTexts()).toHaveLength(2);
    expect(rowTexts()[1]).toContain("IO-009");
    expect(container?.querySelector("[role=status]")).toBeNull();
  });

  it("saves without payment and stays on the list", async () => {
    const api = await mount(
      fakeApi({ restore: ADD_PAYER, members: [ACTIVE_ONE], create: { ok: true, value: NEW_MEMBER } }),
    );
    await fillNewMember();
    await click(button("Save without payment"));
    expect(el("h1").textContent).toBe("Members");
    expect(el("[role=status]").textContent).toBe("New Test Member was added as IO-009.");
    expect(container?.querySelector("form")).toBeNull();
    expect(rowTexts()).toHaveLength(2);
    expect(api.calls).not.toContain("get m9");
  });

  it("stays on the add form when the server refuses, from either button", async () => {
    const api = await mount(
      fakeApi({ restore: ADD_PAYER, create: { ok: false, reason: "network" } }),
    );
    await fillNewMember();
    await click(button("Add member & record payment"));
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    await click(button("Save without payment"));
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(el<HTMLInputElement>("input[name=fullName]").value).toBe("New Test Member");
    expect(container?.querySelector(".payment-form")).toBeNull();
    expect(api.calls.filter((c) => c.startsWith("create "))).toHaveLength(2);
    expect(api.calls.some((c) => c.startsWith("get "))).toBe(false);
  });

  it("opens a member from the list without the first-payment notice or the form", async () => {
    await mount(
      fakeApi({ restore: ADD_PAYER, members: [ACTIVE_ONE], create: { ok: true, value: NEW_MEMBER } }),
    );
    await fillNewMember();
    await click(button("Add member & record payment"));
    await click(button("← Back to members"));
    await click(el('button[aria-label="View New Test Member"]'));
    expect(el("h1").textContent).toBe("New Test Member");
    expect(container?.querySelector(".payment-form")).toBeNull();
    expect(container?.querySelector("[role=status]")).toBeNull();
    expect(button("Record payment")).toBeTruthy();
  });
});

const LOAN_FORM: LoanFormInput = {
  givenOn: "2026-10-20",
  method: "CASH",
  principal: "50000.5",
  interestNote: "  5% flat  ",
  notes: " ",
};

describe("loan form helpers", () => {
  it("checks the form and gives the fields to send, the principal as the server writes it", () => {
    expect(checkLoan(LOAN_FORM, "2026-10-23")).toEqual({
      ok: true,
      value: {
        givenOn: "2026-10-20",
        method: "CASH",
        principal: "50000.50",
        interestNote: "5% flat",
        notes: "",
      },
    });
    expect(checkLoan({ ...LOAN_FORM, givenOn: "2026-10-23" }, "2026-10-23").ok).toBe(true);
    const long = ` ${"a".repeat(LOAN_TEXT_MAX)} `;
    expect(checkLoan({ ...LOAN_FORM, interestNote: long, notes: long }, "2026-10-23").ok).toBe(true);
  });

  it("refuses each bad field with its own message, in the server's order", () => {
    const today = "2026-10-23";
    const tooLong = "a".repeat(LOAN_TEXT_MAX + 1);
    const cases: [Partial<LoanFormInput>, string][] = [
      [{ givenOn: "" }, "Enter the loan date."],
      [{ givenOn: "2026-02-30" }, "Enter the loan date."],
      [{ givenOn: "2026-10-24", principal: "x" }, "The loan date cannot be after today."],
      [{ principal: "" }, "Enter a loan amount above ₦0.00, with at most 2 decimals."],
      [{ principal: "0.00" }, "Enter a loan amount above ₦0.00, with at most 2 decimals."],
      [{ principal: "1.005" }, "Enter a loan amount above ₦0.00, with at most 2 decimals."],
      [{ principal: "-5", interestNote: tooLong }, "Enter a loan amount above ₦0.00, with at most 2 decimals."],
      [{ interestNote: tooLong, notes: tooLong }, `The interest note may have at most ${LOAN_TEXT_MAX} characters.`],
      [{ notes: tooLong }, `The notes may have at most ${LOAN_TEXT_MAX} characters.`],
    ];
    for (const [patch, message] of cases) {
      expect(checkLoan({ ...LOAN_FORM, ...patch }, today)).toEqual({ ok: false, message });
    }
  });

  it("maps each refused loan to a message", () => {
    const cases: [Extract<CreateLoanResult, { ok: false }>, string | null][] = [
      [{ ok: false, reason: "member_inactive" }, "This member is Inactive. Reactivate the member before giving a loan."],
      [{ ok: false, reason: "active_loan" }, "This member already has an active loan."],
      [
        { ok: false, reason: "idempotency_conflict" },
        "This attempt was already sent with other details. Check the member's loans, then start again.",
      ],
      [{ ok: false, reason: "invalid_input", code: "invalid_method" }, "Choose Cash or Bank transfer."],
      [{ ok: false, reason: "invalid_input", code: "invalid_given_on" }, "The loan date was refused. Enter a real date."],
      [{ ok: false, reason: "invalid_input", code: "future_given_on" }, "The loan date cannot be after today."],
      [
        { ok: false, reason: "invalid_input", code: "invalid_principal" },
        "The loan amount was refused. Enter an amount with at most 2 decimals.",
      ],
      [{ ok: false, reason: "invalid_input", code: "principal_not_positive" }, "The loan amount must be above ₦0.00."],
      [
        { ok: false, reason: "invalid_input", code: "invalid_interest_note" },
        `The interest note may have at most ${LOAN_TEXT_MAX} characters.`,
      ],
      [{ ok: false, reason: "invalid_input", code: "invalid_notes" }, `The notes may have at most ${LOAN_TEXT_MAX} characters.`],
      [{ ok: false, reason: "invalid_input", code: "invalid_idempotency_key" }, "The loan was refused. Check the fields and try again."],
      [{ ok: false, reason: "invalid_input" }, "The loan was refused. Check the fields and try again."],
      [{ ok: false, reason: "forbidden" }, "You do not have permission to do this."],
      [{ ok: false, reason: "not_found" }, "Member not found."],
      [{ ok: false, reason: "signed_out" }, null],
      [{ ok: false, reason: "network" }, "Cannot reach the server. Press Give loan again: it will not be saved twice."],
      [{ ok: false, reason: "server" }, "Something went wrong. Press Give loan again: it will not be saved twice."],
    ];
    for (const [result, message] of cases) expect(loanMessage(result)).toBe(message);
  });

  it("says what loan was given and on which day", () => {
    expect(savedLoanMessage(givenLoan("50000.50", "2026-10-20"))).toBe(
      "Loan of ₦50,000.50 on 20 Oct 2026 given.",
    );
  });
});

const LENDER: Me = {
  ...ME,
  user: { ...ME.user, role: "STAFF" },
  permissions: ["members.view", "payments.view", "loans.view", "payments.create", "loans.disburse"],
};

function givenLoan(principal: string, givenOn: string): Extract<CreateLoanResult, { ok: true }> {
  const { id, memberId, membershipId, interestNote, notes, expenseId, createdById, createdAt } =
    ACTIVE_LOAN;
  const loan = { id, memberId, membershipId, principal, interestNote, notes, givenOn, expenseId, createdById, createdAt };
  return { ok: true, loan, replayed: false };
}

async function openLoanForm() {
  await openDetail("Test Member One");
  await click(button("Give loan"));
}

async function submitLoan() {
  await click(el(".loan-form button[type=submit]"));
}

describe("loan form (jsdom)", () => {
  it("has no Give loan button without loans.disburse", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE] }));
    await openDetail("Test Member One");
    expect(button("Record payment")).toBeTruthy();
    expect(() => button("Give loan")).toThrow();
  });

  it("has no Give loan button for an Inactive member", async () => {
    await mount(fakeApi({ restore: LENDER, members: [INACTIVE_ONE] }));
    await openMembers();
    await click(button("All"));
    await click(el('button[aria-label="View Example Inactive"]'));
    expect(el("h1").textContent).toBe("Example Inactive");
    expect(() => button("Give loan")).toThrow();
  });

  it("has no Give loan button while the member has an active loan", async () => {
    await mount(fakeApi({ restore: LENDER, members: [ACTIVE_ONE], loans: { ok: true, value: [ACTIVE_LOAN] } }));
    await openDetail("Test Member One");
    expect(el(".loan").textContent).toBe("On loan");
    expect(() => button("Give loan")).toThrow();
  });

  it("has a Give loan button when the member's loan is fully repaid", async () => {
    const repaid: Loan = { ...ACTIVE_LOAN, repaid: "50000.00", outstanding: "0.00", status: "FULLY_REPAID" };
    await mount(fakeApi({ restore: LENDER, members: [ACTIVE_ONE], loans: { ok: true, value: [repaid] } }));
    await openDetail("Test Member One");
    expect(button("Give loan")).toBeTruthy();
  });

  it("opens with today's day in Lagos, Bank transfer and empty fields; one form at a time", async () => {
    await mount(fakeApi({ restore: LENDER, members: [ACTIVE_ONE] }));
    await openLoanForm();
    expect(el<HTMLInputElement>("input[name=givenOn]").value).toBe(lagosToday());
    expect(el<HTMLInputElement>("input[name=givenOn]").max).toBe(lagosToday());
    expect(el<HTMLSelectElement>(".loan-form select[name=method]").value).toBe("BANK_TRANSFER");
    expect(el<HTMLInputElement>("input[name=principal]").value).toBe("");
    expect(el<HTMLInputElement>("input[name=interestNote]").maxLength).toBe(LOAN_TEXT_MAX);
    expect(el<HTMLInputElement>("input[name=notes]").maxLength).toBe(LOAN_TEXT_MAX);
    expect(el(".loan-form button[type=submit]").textContent).toBe("Give loan");
    expect(() => button("Record payment")).toThrow();
    await click(button("Cancel"));
    await click(button("Record payment"));
    expect(container?.querySelector(".payment-form")).not.toBeNull();
    expect(() => button("Give loan")).toThrow();
  });

  it("stops a loan date after today in Lagos, with no call", async () => {
    const api = await mount(fakeApi({ restore: LENDER, members: [ACTIVE_ONE] }));
    await openLoanForm();
    const tomorrow = lagosToday(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await type(el("input[name=givenOn]"), tomorrow);
    await type(el("input[name=principal]"), "50000");
    // As the payment form test: the input's max stops a button press in jsdom (A-213).
    await act(async () => {
      el<HTMLFormElement>(".loan-form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(el(".loan-form [role=alert]").textContent).toBe("The loan date cannot be after today.");
    expect(api.lent).toEqual([]);
  });

  it("stops a loan amount of ₦0.00, with no call", async () => {
    const api = await mount(fakeApi({ restore: LENDER, members: [ACTIVE_ONE] }));
    await openLoanForm();
    await type(el("input[name=principal]"), "0");
    await submitLoan();
    expect(el("[role=alert]").textContent).toBe(
      "Enter a loan amount above ₦0.00, with at most 2 decimals.",
    );
    expect(api.lent).toEqual([]);
  });

  it("gives the loan, shows the notice and reads balances, payments and loans again", async () => {
    const api = await mount(
      fakeApi({
        restore: LENDER,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: DETAIL_BALANCES },
        lend: [givenLoan("50000.00", "2026-10-20")],
      }),
    );
    await openLoanForm();
    await type(el("input[name=givenOn]"), "2026-10-20");
    await type(el("input[name=principal]"), "50000");
    await choose(el(".loan-form select[name=method]"), "CASH");
    await type(el("input[name=interestNote]"), " 5% flat ");
    await type(el("input[name=notes]"), "School fees");
    // The reload after the save finds the new loan.
    api.listLoans = async (id) => {
      api.calls.push(`loans ${id}`);
      return { ok: true, value: [{ ...ACTIVE_LOAN, repaid: "0.00", outstanding: "50000.00" }] };
    };
    await submitLoan();

    expect(api.lent).toHaveLength(1);
    const sent = api.lent[0]!;
    expect(sent.idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
    expect({ ...sent, idempotencyKey: "" }).toEqual({
      idempotencyKey: "",
      memberId: "m1",
      method: "CASH",
      givenOn: "2026-10-20",
      principal: "50000.00",
      interestNote: "5% flat",
      notes: "School fees",
    });
    expect(el("[role=status]").textContent).toBe("Loan of ₦50,000.00 on 20 Oct 2026 given.");
    expect(container?.querySelector(".loan-form")).toBeNull();
    expect(countCalls(api, "get m1")).toBe(1);
    expect(countCalls(api, "balances m1")).toBe(2);
    expect(countCalls(api, "payments m1")).toBe(2);
    expect(countCalls(api, "loans m1")).toBe(2);
    expect(el(".loan").textContent).toBe("On loan");
    expect(() => button("Give loan")).toThrow();
    expect(button("Record payment")).toBeTruthy();
  });

  it("sends the same key after a network failure, and a new key after any change", async () => {
    const api = await mount(
      fakeApi({
        restore: LENDER,
        members: [ACTIVE_ONE],
        lend: [
          { ok: false, reason: "network" },
          { ok: false, reason: "server" },
          givenLoan("60000.00", lagosToday()),
        ],
      }),
    );
    await openLoanForm();
    await type(el("input[name=principal]"), "50000");
    await submitLoan();
    expect(el("[role=alert]").textContent).toBe(
      "Cannot reach the server. Press Give loan again: it will not be saved twice.",
    );
    await submitLoan();
    expect(el("[role=alert]").textContent).toContain("Something went wrong.");
    expect(api.lent[1]).toEqual(api.lent[0]);

    await type(el("input[name=principal]"), "60000");
    await submitLoan();
    expect(api.lent).toHaveLength(3);
    expect(api.lent[2]!.principal).toBe("60000.00");
    expect(api.lent[2]!.idempotencyKey).not.toBe(api.lent[0]!.idempotencyKey);
    expect(el("[role=status]").textContent).toContain("Loan of ₦60,000.00");
  });

  it("makes a new key after idempotency_conflict", async () => {
    const api = await mount(
      fakeApi({
        restore: LENDER,
        members: [ACTIVE_ONE],
        lend: [{ ok: false, reason: "idempotency_conflict" }],
      }),
    );
    await openLoanForm();
    await type(el("input[name=principal]"), "50000");
    await submitLoan();
    await submitLoan();
    expect(api.lent).toHaveLength(2);
    expect(api.lent[1]!.idempotencyKey).not.toBe(api.lent[0]!.idempotencyKey);
  });

  it("keeps the form and shows the server's refusal", async () => {
    await mount(
      fakeApi({ restore: LENDER, members: [ACTIVE_ONE], lend: [{ ok: false, reason: "active_loan" }] }),
    );
    await openLoanForm();
    await type(el("input[name=principal]"), "50000");
    await submitLoan();
    expect(el("[role=alert]").textContent).toBe("This member already has an active loan.");
    expect(el<HTMLInputElement>("input[name=principal]").value).toBe("50000");
    expect(container?.querySelector("[role=status]")).toBeNull();
  });

  it("closes on Cancel with no call", async () => {
    const api = await mount(fakeApi({ restore: LENDER, members: [ACTIVE_ONE] }));
    await openLoanForm();
    await click(button("Cancel"));
    expect(container?.querySelector(".loan-form")).toBeNull();
    expect(button("Give loan")).toBeTruthy();
    expect(api.lent).toEqual([]);
  });
});

describe("expense list helpers", () => {
  it("offers the DR-11 categories in order, Loan and Membership Withdrawal too", () => {
    expect(EXPENSE_CATEGORIES).toEqual([
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
    ]);
  });

  it("sends only the filters that are set", () => {
    expect(checkExpenseFilter(NO_FILTER)).toEqual({ ok: true, value: {} });
    expect(
      checkExpenseFilter({ category: "Others", method: "CASH", fromDay: "2026-10-01", toDay: "2026-10-31" }),
    ).toEqual({
      ok: true,
      value: { category: "Others", method: "CASH", fromDay: "2026-10-01", toDay: "2026-10-31" },
    });
    expect(checkExpenseFilter({ ...NO_FILTER, toDay: "2026-10-31" })).toEqual({
      ok: true,
      value: { toDay: "2026-10-31" },
    });
  });

  it("allows the same day for both, and refuses each bad filter in the server's order", () => {
    expect(checkExpenseFilter({ ...NO_FILTER, fromDay: "2026-10-05", toDay: "2026-10-05" })).toEqual({
      ok: true,
      value: { fromDay: "2026-10-05", toDay: "2026-10-05" },
    });
    const refused = (input: typeof NO_FILTER) => {
      const result = checkExpenseFilter(input);
      return result.ok ? null : result.message;
    };
    expect(refused({ ...NO_FILTER, category: "Food", fromDay: "x" })).toBe("Choose a category from the list.");
    expect(refused({ ...NO_FILTER, fromDay: "2026-02-30", toDay: "x" })).toBe("Enter a real From day.");
    expect(refused({ ...NO_FILTER, toDay: "2026-13-01" })).toBe("Enter a real To day.");
    expect(refused({ ...NO_FILTER, fromDay: "2026-10-06", toDay: "2026-10-05" })).toBe(
      "The From day cannot be after the To day.",
    );
  });

  it("maps each list failure, and counts expenses", () => {
    expect(expenseListMessage("forbidden")).toMatch(/permission/);
    expect(expenseListMessage("invalid_input")).toMatch(/filters were refused/);
    expect(expenseListMessage("signed_out")).toBeNull();
    expect(expenseListMessage("network")).toMatch(/Cannot reach/);
    expect(expenseListMessage("server")).toMatch(/went wrong/);
    expect(expenseCount(0)).toBe("0 expenses");
    expect(expenseCount(1)).toBe("1 expense");
    expect(expenseCount(2)).toBe("2 expenses");
  });
});

const EXPENSE_VIEWER: Me = { ...ME, user: { ...ME.user, role: "STAFF" }, permissions: ["expenses.view"] };

function expense(id: string, spentOn: string, amount: string, extra: Partial<Expense> = {}): Expense {
  return {
    id,
    category: "Expenses",
    amount,
    method: "CASH",
    spentOn,
    description: "",
    narration: "",
    createdById: "u1",
    createdAt: `${spentOn}T09:00:00.000Z`,
    ...extra,
  };
}

async function openExpenses() {
  await click(button("Expenses"));
}

function select(name: string): HTMLSelectElement {
  return el(`select[name=${name}]`);
}

describe("expenses page (jsdom)", () => {
  it("has no Expenses button without expenses.view", async () => {
    await mount(fakeApi({ restore: VIEWER }));
    expect(() => button("Expenses")).toThrow();
  });

  it("lists with no filters, newest first, with the count and the server's total", async () => {
    const api = await mount(
      fakeApi({
        restore: EXPENSE_VIEWER,
        expenses: {
          ok: true,
          value: {
            expenses: [
              expense("e1", "2026-10-01", "1000.00", { description: "Stationery" }),
              expense("e2", "2026-10-20", "250000.50", {
                category: "Others",
                method: "BANK_TRANSFER",
                description: "Generator",
                narration: "Repair",
              }),
            ],
            total: "251000.50",
          },
        },
      }),
    );
    await openExpenses();
    expect(api.calls).toEqual(["expenses"]);
    expect(api.expenseQueries).toEqual([{}]);
    expect(el("h1").textContent).toBe("Expenses");
    expect(rowTexts()).toHaveLength(2);
    expect(rowTexts()[0]).toBe("20 Oct 2026OthersGenerator · Repair₦250,000.50Bank transfer");
    expect(rowTexts()[1]).toBe("1 Oct 2026ExpensesStationery₦1,000.00Cash");
    expect(el(".expense-total").textContent).toBe("2 expensesTotal ₦251,000.50");
  });

  it("shows a dash for an expense with no description or narration", async () => {
    await mount(
      fakeApi({
        restore: EXPENSE_VIEWER,
        expenses: { ok: true, value: { expenses: [expense("e1", "2026-10-01", "5.00")], total: "5.00" } },
      }),
    );
    await openExpenses();
    expect(rowTexts()[0]).toBe("1 Oct 2026Expenses—₦5.00Cash");
  });

  it("sends the filters on Apply, and Clear loads the full list again", async () => {
    const api = await mount(fakeApi({ restore: EXPENSE_VIEWER }));
    await openExpenses();
    await choose(select("category"), "Payment to Union");
    await choose(select("method"), "BANK_TRANSFER");
    await type(el("input[name=fromDay]"), "2026-10-01");
    await type(el("input[name=toDay]"), "2026-10-31");
    expect(api.expenseQueries).toHaveLength(1);
    await click(button("Apply"));
    expect(api.expenseQueries).toEqual([
      {},
      { category: "Payment to Union", method: "BANK_TRANSFER", fromDay: "2026-10-01", toDay: "2026-10-31" },
    ]);
    await click(button("Clear"));
    expect(api.expenseQueries.at(-1)).toEqual({});
    expect(select("category").value).toBe("");
    expect(select("method").value).toBe("");
    expect(el<HTMLInputElement>("input[name=fromDay]").value).toBe("");
    expect(text()).toContain("No expenses found.");
    expect(el(".expense-total").textContent).toBe("0 expensesTotal ₦0.00");
  });

  it("stops a From day after the To day, with no call", async () => {
    const api = await mount(fakeApi({ restore: EXPENSE_VIEWER }));
    await openExpenses();
    await type(el("input[name=fromDay]"), "2026-10-06");
    await type(el("input[name=toDay]"), "2026-10-05");
    await click(button("Apply"));
    expect(el("[role=alert]").textContent).toBe("The From day cannot be after the To day.");
    expect(api.expenseQueries).toEqual([{}]);
  });

  it("shows the message when the list cannot be read", async () => {
    await mount(fakeApi({ restore: EXPENSE_VIEWER, expenses: { ok: false, reason: "network" } }));
    await openExpenses();
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(rowTexts()).toHaveLength(0);
    expect(container?.querySelector(".expense-total")).toBeNull();
  });
});

const EXPENSE_FORM: ExpenseFormInput = {
  spentOn: "2026-10-20",
  category: "Office Maintenance",
  method: "CASH",
  amount: "15000",
  description: " Plumber ",
  narration: "",
};

describe("expense form helpers", () => {
  it("offers only the categories a person may pick, in DR-11 order", () => {
    expect(MANUAL_EXPENSE_CATEGORIES).toEqual([
      "Expenses",
      "Allowances",
      "Members Credit",
      "Asset Purchase",
      "Office Maintenance",
      "Payment to Union",
      "Payment to Apexes",
      "Others",
    ]);
  });

  it("gives the fields to send, the amount as a naira string and the texts trimmed", () => {
    expect(checkExpense(EXPENSE_FORM, "2026-10-23")).toEqual({
      ok: true,
      value: {
        category: "Office Maintenance",
        method: "CASH",
        spentOn: "2026-10-20",
        amount: "15000.00",
        description: "Plumber",
        narration: "",
      },
    });
    expect(
      checkExpense({ ...EXPENSE_FORM, category: "Others", narration: " Fuel ", spentOn: "2026-10-23" }, "2026-10-23"),
    ).toMatchObject({ ok: true, value: { category: "Others", narration: "Fuel", spentOn: "2026-10-23" } });
  });

  it("refuses each bad field in the server's order", () => {
    const refused = (input: ExpenseFormInput) => {
      const result = checkExpense(input, "2026-10-23");
      return result.ok ? null : result.message;
    };
    expect(refused({ ...EXPENSE_FORM, category: "", spentOn: "x" })).toBe("Choose a category.");
    expect(refused({ ...EXPENSE_FORM, category: "Loan" })).toBe("Choose a category.");
    expect(refused({ ...EXPENSE_FORM, category: "Membership Withdrawal" })).toBe("Choose a category.");
    expect(refused({ ...EXPENSE_FORM, spentOn: "2026-02-30", amount: "x" })).toBe("Enter the expense date.");
    expect(refused({ ...EXPENSE_FORM, spentOn: "2026-10-24" })).toBe("The expense date cannot be after today.");
    expect(refused({ ...EXPENSE_FORM, amount: "0", description: "x".repeat(201) })).toBe(
      "Enter an amount above ₦0.00, with at most 2 decimals.",
    );
    expect(refused({ ...EXPENSE_FORM, amount: "1.005" })).toBe("Enter an amount above ₦0.00, with at most 2 decimals.");
    expect(refused({ ...EXPENSE_FORM, description: "x".repeat(EXPENSE_TEXT_MAX + 1) })).toBe(
      "The description may have at most 200 characters.",
    );
    expect(refused({ ...EXPENSE_FORM, description: ` ${"x".repeat(EXPENSE_TEXT_MAX)} ` })).toBeNull();
    expect(refused({ ...EXPENSE_FORM, category: "Others", narration: "x".repeat(EXPENSE_TEXT_MAX + 1) })).toBe(
      "The narration may have at most 200 characters.",
    );
    expect(refused({ ...EXPENSE_FORM, category: "Others", narration: "  " })).toBe(
      "Others needs a narration: say what the money was for.",
    );
    expect(refused({ ...EXPENSE_FORM, narration: "Fuel" })).toBe("Only Others takes a narration.");
  });

  it("maps each refusal to a message, and names the saved expense", () => {
    expect(expenseMessage({ ok: false, reason: "idempotency_conflict" })).toMatch(/already sent/);
    expect(expenseMessage({ ok: false, reason: "invalid_input", code: "system_only" })).toBe(
      "Loan and Membership Withdrawal are recorded by the system.",
    );
    expect(expenseMessage({ ok: false, reason: "invalid_input", code: "future_spent_on" })).toBe(
      "The expense date cannot be after today.",
    );
    expect(expenseMessage({ ok: false, reason: "invalid_input", code: "toString" })).toMatch(/was refused/);
    expect(expenseMessage({ ok: false, reason: "invalid_input" })).toMatch(/was refused/);
    expect(expenseMessage({ ok: false, reason: "forbidden" })).toMatch(/permission/);
    expect(expenseMessage({ ok: false, reason: "signed_out" })).toBeNull();
    expect(expenseMessage({ ok: false, reason: "network" })).toMatch(/not be saved twice/);
    expect(expenseMessage({ ok: false, reason: "server" })).toMatch(/not be saved twice/);
    expect(
      savedExpenseMessage({
        ok: true,
        replayed: false,
        expense: expense("e9", "2026-10-20", "15000.00", { category: "Office Maintenance" }),
      }),
    ).toBe("Office Maintenance expense of ₦15,000.00 on 20 Oct 2026 recorded.");
  });
});

const EXPENSE_CREATOR: Me = {
  ...ME,
  user: { ...ME.user, role: "STAFF" },
  permissions: ["expenses.view", "expenses.create"],
};

function recorded(e: Expense): CreateExpenseResult {
  return { ok: true, expense: e, replayed: false };
}

function formSelect(name: string): HTMLSelectElement {
  return el(`.expense-form select[name=${name}]`);
}

async function openExpenseForm() {
  await openExpenses();
  await click(button("+ Record expense"));
}

async function submitExpense() {
  await click(el(".expense-form button[type=submit]"));
}

describe("expense form (jsdom)", () => {
  it("has no Record expense button without expenses.create", async () => {
    await mount(fakeApi({ restore: EXPENSE_VIEWER }));
    await openExpenses();
    expect(() => button("+ Record expense")).toThrow();
  });

  it("opens with today's day in Lagos, no category, Bank transfer; only the hand-picked categories", async () => {
    await mount(fakeApi({ restore: EXPENSE_CREATOR }));
    await openExpenseForm();
    expect(el<HTMLInputElement>("input[name=spentOn]").value).toBe(lagosToday());
    expect(el<HTMLInputElement>("input[name=spentOn]").max).toBe(lagosToday());
    expect(formSelect("category").value).toBe("");
    expect(formSelect("method").value).toBe("BANK_TRANSFER");
    expect(el<HTMLInputElement>("input[name=amount]").value).toBe("");
    expect(el<HTMLInputElement>("input[name=description]").maxLength).toBe(EXPENSE_TEXT_MAX);
    expect(Array.from(formSelect("category").options, (o) => o.value)).toEqual([
      "",
      ...MANUAL_EXPENSE_CATEGORIES,
    ]);
    expect(() => button("+ Record expense")).toThrow();
  });

  it("shows the narration only for Others, and empties it when Others is left", async () => {
    await mount(fakeApi({ restore: EXPENSE_CREATOR }));
    await openExpenseForm();
    expect(container?.querySelector("input[name=narration]")).toBeNull();
    await choose(formSelect("category"), "Others");
    expect(el<HTMLInputElement>("input[name=narration]").maxLength).toBe(EXPENSE_TEXT_MAX);
    await type(el("input[name=narration]"), "Fuel");
    await choose(formSelect("category"), "Expenses");
    expect(container?.querySelector("input[name=narration]")).toBeNull();
    await choose(formSelect("category"), "Others");
    expect(el<HTMLInputElement>("input[name=narration]").value).toBe("");
  });

  it("records the expense, shows the notice and reads the list again with the filters in use", async () => {
    const api = await mount(
      fakeApi({
        restore: EXPENSE_CREATOR,
        spend: [recorded(expense("e9", "2026-10-20", "15000.00", { category: "Others", method: "CASH" }))],
      }),
    );
    await openExpenses();
    await choose(select("method"), "CASH");
    await click(button("Apply"));
    await click(button("+ Record expense"));
    await type(el("input[name=spentOn]"), "2026-10-20");
    await choose(formSelect("category"), "Others");
    await type(el("input[name=amount]"), "15000");
    await choose(formSelect("method"), "CASH");
    await type(el("input[name=description]"), " Generator ");
    await type(el("input[name=narration]"), " Fuel ");
    await submitExpense();

    expect(api.spent).toHaveLength(1);
    const sent = api.spent[0]!;
    expect(sent.idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
    expect({ ...sent, idempotencyKey: "" }).toEqual({
      idempotencyKey: "",
      category: "Others",
      method: "CASH",
      spentOn: "2026-10-20",
      amount: "15000.00",
      description: "Generator",
      narration: "Fuel",
    });
    expect(el("[role=status]").textContent).toBe("Others expense of ₦15,000.00 on 20 Oct 2026 recorded.");
    expect(container?.querySelector(".expense-form")).toBeNull();
    expect(api.expenseQueries).toEqual([{}, { method: "CASH" }, { method: "CASH" }]);
    expect(button("+ Record expense")).toBeTruthy();
  });

  it("sends the same key after a network failure, and a new key after any change", async () => {
    const api = await mount(
      fakeApi({
        restore: EXPENSE_CREATOR,
        spend: [
          { ok: false, reason: "network" },
          { ok: false, reason: "server" },
          recorded(expense("e9", lagosToday(), "16000.00")),
        ],
      }),
    );
    await openExpenseForm();
    await choose(formSelect("category"), "Expenses");
    await type(el("input[name=amount]"), "15000");
    await submitExpense();
    expect(el(".expense-form [role=alert]").textContent).toBe(
      "Cannot reach the server. Press Record expense again: it will not be saved twice.",
    );
    await submitExpense();
    expect(el(".expense-form [role=alert]").textContent).toContain("Something went wrong.");
    expect(api.spent[1]).toEqual(api.spent[0]);

    await type(el("input[name=amount]"), "16000");
    await submitExpense();
    expect(api.spent).toHaveLength(3);
    expect(api.spent[2]!.amount).toBe("16000.00");
    expect(api.spent[2]!.idempotencyKey).not.toBe(api.spent[0]!.idempotencyKey);
    expect(el("[role=status]").textContent).toContain("of ₦16,000.00");
  });

  it("makes a new key after idempotency_conflict", async () => {
    const api = await mount(
      fakeApi({ restore: EXPENSE_CREATOR, spend: [{ ok: false, reason: "idempotency_conflict" }] }),
    );
    await openExpenseForm();
    await choose(formSelect("category"), "Expenses");
    await type(el("input[name=amount]"), "15000");
    await submitExpense();
    await submitExpense();
    expect(api.spent).toHaveLength(2);
    expect(api.spent[1]!.idempotencyKey).not.toBe(api.spent[0]!.idempotencyKey);
  });

  it("stops a missing category and a date after today, with no call", async () => {
    const api = await mount(fakeApi({ restore: EXPENSE_CREATOR }));
    await openExpenseForm();
    await type(el("input[name=amount]"), "15000");
    await submitExpense();
    expect(el(".expense-form [role=alert]").textContent).toBe("Choose a category.");
    await choose(formSelect("category"), "Expenses");
    await type(el("input[name=spentOn]"), lagosToday(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    // As the loan form test: the input's max stops a button press in jsdom (A-213).
    await act(async () => {
      el<HTMLFormElement>(".expense-form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(el(".expense-form [role=alert]").textContent).toBe("The expense date cannot be after today.");
    expect(api.spent).toEqual([]);
  });

  it("keeps the form and shows the server's refusal", async () => {
    await mount(
      fakeApi({
        restore: EXPENSE_CREATOR,
        spend: [{ ok: false, reason: "invalid_input", code: "amount_not_positive" }],
      }),
    );
    await openExpenseForm();
    await choose(formSelect("category"), "Expenses");
    await type(el("input[name=amount]"), "15000");
    await submitExpense();
    expect(el(".expense-form [role=alert]").textContent).toBe("The amount must be above ₦0.00.");
    expect(el<HTMLInputElement>("input[name=amount]").value).toBe("15000");
    expect(container?.querySelector("[role=status]")).toBeNull();
  });

  it("closes on Cancel with no call", async () => {
    const api = await mount(fakeApi({ restore: EXPENSE_CREATOR }));
    await openExpenseForm();
    await click(button("Cancel"));
    expect(container?.querySelector(".expense-form")).toBeNull();
    expect(button("+ Record expense")).toBeTruthy();
    expect(api.spent).toEqual([]);
  });
});

describe("expense edit and delete helpers", () => {
  it("lets only the hand-picked categories be changed on screen", () => {
    for (const category of MANUAL_EXPENSE_CATEGORIES) {
      expect(isChangeable(expense("e1", "2026-10-01", "5.00", { category }))).toBe(true);
    }
    for (const category of ["Loan", "Membership Withdrawal", "Food"]) {
      expect(isChangeable(expense("e1", "2026-10-01", "5.00", { category }))).toBe(false);
    }
  });

  it("maps each edit and delete refusal to a message, and names the changed expense", () => {
    expect(editExpenseMessage({ ok: false, reason: "not_editable", code: "loan_linked" })).toBe(
      "This expense is linked to a loan and cannot be edited.",
    );
    expect(editExpenseMessage({ ok: false, reason: "not_editable", code: "pay_off" })).toBe(
      "This expense is part of a pay-off and cannot be edited.",
    );
    expect(editExpenseMessage({ ok: false, reason: "not_editable" })).toBe("This expense cannot be edited.");
    expect(editExpenseMessage({ ok: false, reason: "not_found" })).toBe(
      "This expense was not found. It may have been deleted.",
    );
    expect(editExpenseMessage({ ok: false, reason: "invalid_input", code: "missing_narration" })).toBe(
      "Others needs a narration: say what the money was for.",
    );
    expect(editExpenseMessage({ ok: false, reason: "invalid_input", code: "toString" })).toMatch(/changes were refused/);
    expect(editExpenseMessage({ ok: false, reason: "forbidden" })).toMatch(/permission/);
    expect(editExpenseMessage({ ok: false, reason: "signed_out" })).toBeNull();
    expect(editExpenseMessage({ ok: false, reason: "network" })).toMatch(/Cannot reach/);
    expect(editExpenseMessage({ ok: false, reason: "server" })).toMatch(/went wrong/);

    expect(deleteExpenseMessage({ ok: false, reason: "not_deletable", code: "loan_linked" })).toBe(
      "This expense is linked to a loan and cannot be deleted.",
    );
    expect(deleteExpenseMessage({ ok: false, reason: "not_deletable", code: "pay_off" })).toBe(
      "This expense is part of a pay-off and cannot be deleted.",
    );
    expect(deleteExpenseMessage({ ok: false, reason: "not_found" })).toMatch(/may have been deleted/);
    expect(deleteExpenseMessage({ ok: false, reason: "forbidden" })).toMatch(/permission/);
    expect(deleteExpenseMessage({ ok: false, reason: "signed_out" })).toBeNull();
    expect(deleteExpenseMessage({ ok: false, reason: "network" })).toMatch(/Cannot reach/);
    expect(deleteExpenseMessage({ ok: false, reason: "server" })).toMatch(/went wrong/);

    const e = expense("e3", "2026-10-03", "16000.00", { category: "Office Maintenance" });
    expect(editedExpenseMessage(e)).toBe("Office Maintenance expense of ₦16,000.00 on 3 Oct 2026 saved.");
    expect(deletedExpenseMessage(e)).toBe("Office Maintenance expense of ₦16,000.00 on 3 Oct 2026 deleted.");
  });
});

const EXPENSE_EDITOR: Me = {
  ...ME,
  user: { ...ME.user, role: "STAFF" },
  permissions: ["expenses.view", "expenses.create", "expenses.edit", "expenses.delete"],
};

const PLUMBER = expense("e3", "2026-10-03", "15000.00", { category: "Office Maintenance", description: "Plumber" });

/** Oldest first, as the server sends them: a Loan, a pay-off, then two a person picked. */
const MIXED_EXPENSES: CallResult<ExpenseList> = {
  ok: true,
  value: {
    expenses: [
      expense("e1", "2026-10-01", "50000.00", { category: "Loan" }),
      expense("e2", "2026-10-02", "20000.00", { category: "Membership Withdrawal" }),
      PLUMBER,
      expense("e4", "2026-10-04", "700.00", { category: "Others", method: "BANK_TRANSFER", narration: "Fuel" }),
    ],
    total: "85700.00",
  },
};

/** The buttons of the row at `index` (newest first), by their text. */
function rowButtons(index: number): string[] {
  const row = container?.querySelectorAll("tbody tr")[index];
  return Array.from(row?.querySelectorAll("button") ?? [], (b) => b.textContent ?? "");
}

async function clickRow(index: number, text: string) {
  const row = container?.querySelectorAll("tbody tr")[index];
  const found = Array.from(row?.querySelectorAll("button") ?? []).find((b) => b.textContent === text);
  if (!found) throw new Error(`no ${text} on row ${index}`);
  await click(found);
}

describe("expense edit and delete (jsdom)", () => {
  it("has no Action column without expenses.edit and expenses.delete", async () => {
    await mount(fakeApi({ restore: EXPENSE_CREATOR, expenses: MIXED_EXPENSES }));
    await openExpenses();
    expect(el("thead").textContent).not.toContain("Action");
    expect(rowButtons(0)).toEqual([]);
  });

  it("shows Edit and Delete only on the rows a person may change", async () => {
    await mount(fakeApi({ restore: EXPENSE_EDITOR, expenses: MIXED_EXPENSES }));
    await openExpenses();
    expect(el("thead").textContent).toContain("Action");
    expect([0, 1, 2, 3].map(rowButtons)).toEqual([["Edit", "Delete"], ["Edit", "Delete"], [], []]);
    expect(rowTexts()[2]).toContain("Membership Withdrawal");
    expect(rowTexts()[3]).toContain("Loan");
  });

  it("shows only the button the user has the permission for", async () => {
    const editOnly: Me = { ...EXPENSE_EDITOR, permissions: ["expenses.view", "expenses.edit"] };
    await mount(fakeApi({ restore: editOnly, expenses: MIXED_EXPENSES }));
    await openExpenses();
    expect(rowButtons(0)).toEqual(["Edit"]);
    await act(async () => root?.unmount());
    container?.remove();
    const deleteOnly: Me = { ...EXPENSE_EDITOR, permissions: ["expenses.view", "expenses.delete"] };
    await mount(fakeApi({ restore: deleteOnly, expenses: MIXED_EXPENSES }));
    await openExpenses();
    expect(rowButtons(0)).toEqual(["Delete"]);
  });

  it("opens the edit form with the saved fields, sends every field, then reads the list again", async () => {
    const api = await mount(
      fakeApi({
        restore: EXPENSE_EDITOR,
        expenses: MIXED_EXPENSES,
        edit: [{ ok: true, expense: { ...PLUMBER, amount: "16000.00" } }],
      }),
    );
    await openExpenses();
    await choose(select("method"), "CASH");
    await click(button("Apply"));
    await clickRow(1, "Edit");
    expect(el(".expense-form h2").textContent).toBe("Edit expense");
    expect(el<HTMLInputElement>("input[name=spentOn]").value).toBe("2026-10-03");
    expect(formSelect("category").value).toBe("Office Maintenance");
    expect(formSelect("method").value).toBe("CASH");
    expect(el<HTMLInputElement>("input[name=amount]").value).toBe("15000.00");
    expect(el<HTMLInputElement>("input[name=description]").value).toBe("Plumber");
    expect(() => button("+ Record expense")).toThrow();
    expect(rowButtons(0)).toEqual([]);

    await type(el("input[name=amount]"), "16000");
    expect(el(".expense-form button[type=submit]").textContent).toBe("Save changes");
    await submitExpense();
    expect(api.edited).toEqual([
      {
        id: "e3",
        input: {
          category: "Office Maintenance",
          method: "CASH",
          spentOn: "2026-10-03",
          amount: "16000.00",
          description: "Plumber",
          narration: "",
        },
      },
    ]);
    expect(api.spent).toEqual([]);
    expect(el("[role=status]").textContent).toBe("Office Maintenance expense of ₦16,000.00 on 3 Oct 2026 saved.");
    expect(container?.querySelector(".expense-form")).toBeNull();
    expect(api.expenseQueries).toEqual([{}, { method: "CASH" }, { method: "CASH" }]);
  });

  it("opens an Others expense with its narration", async () => {
    await mount(fakeApi({ restore: EXPENSE_EDITOR, expenses: MIXED_EXPENSES }));
    await openExpenses();
    await clickRow(0, "Edit");
    expect(formSelect("category").value).toBe("Others");
    expect(el<HTMLInputElement>("input[name=narration]").value).toBe("Fuel");
    expect(formSelect("method").value).toBe("BANK_TRANSFER");
  });

  it("keeps the edit form and shows a 409 from the server", async () => {
    const api = await mount(
      fakeApi({
        restore: EXPENSE_EDITOR,
        expenses: MIXED_EXPENSES,
        edit: [{ ok: false, reason: "not_editable", code: "pay_off" }],
      }),
    );
    await openExpenses();
    await clickRow(1, "Edit");
    await submitExpense();
    expect(el(".expense-form [role=alert]").textContent).toBe(
      "This expense is part of a pay-off and cannot be edited.",
    );
    expect(api.edited).toHaveLength(1);
    expect(api.expenseQueries).toHaveLength(1);
  });

  it("stops a bad edit before sending it", async () => {
    const api = await mount(fakeApi({ restore: EXPENSE_EDITOR, expenses: MIXED_EXPENSES }));
    await openExpenses();
    await clickRow(1, "Edit");
    await type(el("input[name=amount]"), "0");
    await submitExpense();
    expect(el(".expense-form [role=alert]").textContent).toBe("Enter an amount above ₦0.00, with at most 2 decimals.");
    expect(api.edited).toEqual([]);
  });

  it("asks before a delete, deletes, then reads the list again", async () => {
    const api = await mount(fakeApi({ restore: EXPENSE_EDITOR, expenses: MIXED_EXPENSES, remove: [{ ok: true }] }));
    await openExpenses();
    await clickRow(1, "Delete");
    expect(api.deleted).toEqual([]);
    expect(el(".expense-delete").textContent).toContain(
      "Delete the Office Maintenance expense of ₦15,000.00 on 3 Oct 2026? It leaves the list and the total.",
    );
    expect(() => button("+ Record expense")).toThrow();
    await click(button("Delete expense"));
    expect(api.deleted).toEqual(["e3"]);
    expect(el("[role=status]").textContent).toBe("Office Maintenance expense of ₦15,000.00 on 3 Oct 2026 deleted.");
    expect(container?.querySelector(".expense-delete")).toBeNull();
    expect(api.expenseQueries).toEqual([{}, {}]);
  });

  it("keeps the confirm and shows a refused delete; Cancel closes it with no call", async () => {
    const api = await mount(
      fakeApi({
        restore: EXPENSE_EDITOR,
        expenses: MIXED_EXPENSES,
        remove: [{ ok: false, reason: "not_deletable", code: "loan_linked" }],
      }),
    );
    await openExpenses();
    await clickRow(0, "Delete");
    await click(button("Delete expense"));
    expect(el(".expense-delete [role=alert]").textContent).toBe(
      "This expense is linked to a loan and cannot be deleted.",
    );
    expect(api.deleted).toEqual(["e4"]);
    await click(button("Cancel"));
    expect(container?.querySelector(".expense-delete")).toBeNull();
    expect(rowButtons(0)).toEqual(["Edit", "Delete"]);
    expect(api.deleted).toEqual(["e4"]);
    expect(api.expenseQueries).toHaveLength(1);
  });
});

const PAY_OFF_BALANCES: MemberBalances = {
  memberId: "m1",
  categories: [
    { category: "Shares", balance: "20000.05", refundable: true },
    { category: "Savings", balance: "5000.00", refundable: true },
    { category: "Special Savings", balance: "0.00", refundable: true },
    { category: "Development Levy", balance: "1500.00", refundable: false },
  ],
  refundableTotal: "25000.05",
  nonRefundableTotal: "1500.00",
};

const ZERO_BALANCES: MemberBalances = {
  memberId: "m1",
  categories: [
    { category: "Shares", balance: "0.00", refundable: true },
    { category: "Development Levy", balance: "1500.00", refundable: false },
  ],
  refundableTotal: "0.00",
  nonRefundableTotal: "1500.00",
};

function paidOff(total: string): Extract<CreatePayOffResult, { ok: true }> {
  return {
    ok: true,
    payOff: {
      id: "po1",
      memberId: "m1",
      membershipId: "IO-001",
      method: "BANK_TRANSFER",
      total,
      lines: [{ category: "Shares", amount: total }],
      expenseId: "e9",
      createdById: "u1",
      createdAt: "2026-10-23T09:00:00.000Z",
    },
    replayed: false,
  };
}

describe("pay-off helpers", () => {
  it("lists only the refundable categories above ₦0.00, in the server's order", () => {
    expect(payOffLines(PAY_OFF_BALANCES)).toEqual([
      { category: "Shares", balance: "20000.05" },
      { category: "Savings", balance: "5000.00" },
    ]);
    expect(payOffLines(ZERO_BALANCES)).toEqual([]);
  });

  it("offers a pay-off only for a payout above ₦0.00", () => {
    expect(hasPayout(PAY_OFF_BALANCES)).toBe(true);
    expect(hasPayout({ ...PAY_OFF_BALANCES, refundableTotal: "0.01" })).toBe(true);
    expect(hasPayout(ZERO_BALANCES)).toBe(false);
    expect(hasPayout({ ...PAY_OFF_BALANCES, refundableTotal: "odd" })).toBe(false);
  });

  it("maps each refused pay-off to a message", () => {
    const cases: [Extract<CreatePayOffResult, { ok: false }>, string | null][] = [
      [{ ok: false, reason: "member_inactive" }, "This member is already Inactive."],
      [
        { ok: false, reason: "active_loan" },
        "This member has an active loan. The loan must be fully repaid before a pay-off.",
      ],
      [{ ok: false, reason: "nothing_to_pay_off" }, "This member has no refundable balance to pay out."],
      [
        { ok: false, reason: "payout_changed" },
        "The balances changed after they were shown. Check the new payout and confirm again.",
      ],
      [
        { ok: false, reason: "idempotency_conflict" },
        "This attempt was already sent with other details. Check the member's balances, then start again.",
      ],
      [{ ok: false, reason: "invalid_input", code: "invalid_method" }, "Choose Cash or Bank transfer."],
      [{ ok: false, reason: "invalid_input", code: "invalid_total" }, "The pay-off was refused. Try again."],
      [{ ok: false, reason: "invalid_input" }, "The pay-off was refused. Try again."],
      [{ ok: false, reason: "forbidden" }, "You do not have permission to do this."],
      [{ ok: false, reason: "not_found" }, "Member not found."],
      [{ ok: false, reason: "signed_out" }, null],
      [
        { ok: false, reason: "network" },
        "Cannot reach the server. Press Confirm pay-off again: it will not be paid twice.",
      ],
      [
        { ok: false, reason: "server" },
        "Something went wrong. Press Confirm pay-off again: it will not be paid twice.",
      ],
    ];
    for (const [result, message] of cases) expect(payOffMessage(result)).toBe(message);
  });

  it("says what was paid out and that the member is now Inactive", () => {
    expect(savedPayOffMessage(paidOff("25000.05"))).toBe(
      "Pay-off of ₦25,000.05 recorded. The member is now Inactive.",
    );
  });
});

const PAYER_OFF: Me = {
  ...ME,
  permissions: ["members.view", "payments.view", "loans.view", "payments.create", "payoff.process"],
};

const PAY_OFF_BUTTON = "Process pay-off / exit member";
const CONFIRM_BUTTON = "Confirm pay-off & inactivate";

async function openPayOff() {
  await openDetail("Test Member One");
  await click(button(PAY_OFF_BUTTON));
}

describe("pay-off (jsdom)", () => {
  it("has no pay-off button without payoff.process", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE], balances: { ok: true, value: PAY_OFF_BALANCES } }));
    await openDetail("Test Member One");
    expect(button("Record payment")).toBeTruthy();
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
  });

  it("has no pay-off button for an Inactive member, with an active loan, or with nothing to pay out", async () => {
    await mount(fakeApi({ restore: PAYER_OFF, members: [INACTIVE_ONE], balances: { ok: true, value: PAY_OFF_BALANCES } }));
    await openMembers();
    await click(button("All"));
    await click(el('button[aria-label="View Example Inactive"]'));
    expect(el("h1").textContent).toBe("Example Inactive");
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
    await act(async () => root?.unmount());

    await mount(
      fakeApi({
        restore: PAYER_OFF,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        loans: { ok: true, value: [ACTIVE_LOAN] },
      }),
    );
    await openDetail("Test Member One");
    expect(el(".loan").textContent).toBe("On loan");
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
    await act(async () => root?.unmount());

    await mount(fakeApi({ restore: PAYER_OFF, members: [ACTIVE_ONE], balances: { ok: true, value: ZERO_BALANCES } }));
    await openDetail("Test Member One");
    expect(sectionText("Balances")).toContain("₦0.00");
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
    await act(async () => root?.unmount());

    await mount(fakeApi({ restore: PAYER_OFF, members: [ACTIVE_ONE], balances: { ok: false, reason: "network" } }));
    await openDetail("Test Member One");
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
  });

  it("shows the button at the bottom, after the payments, and opens the confirmation there", async () => {
    await mount(fakeApi({ restore: PAYER_OFF, members: [ACTIVE_ONE], balances: { ok: true, value: PAY_OFF_BALANCES } }));
    await openDetail("Test Member One");
    const bar = el(".payoff-bar");
    expect(bar.previousElementSibling?.querySelector("h2")?.textContent).toBe("Payments");
    expect(bar.nextElementSibling).toBeNull();
    await click(button(PAY_OFF_BUTTON));
    const confirm = el("section.payoff-confirm");
    expect(confirm.previousElementSibling?.querySelector("h2")?.textContent).toBe("Payments");
    expect(confirm.nextElementSibling).toBeNull();
  });

  it("lists the refundable balances paid out, the total and what is retained; one form at a time", async () => {
    const api = await mount(
      fakeApi({ restore: PAYER_OFF, members: [ACTIVE_ONE], balances: { ok: true, value: PAY_OFF_BALANCES } }),
    );
    await openPayOff();
    const confirm = el("section.payoff-confirm");
    expect(confirm.querySelector("h2")?.textContent).toBe("Confirm member pay-off / exit");
    expect(confirm.textContent).toContain("You are about to close Test Member One's cooperative account.");
    const rows = Array.from(confirm.querySelectorAll("table.payoff-lines tr")).map((r) => r.textContent);
    expect(rows).toEqual(["Shares₦20,000.05", "Savings₦5,000.00"]);
    expect(el(".payoff-total").textContent).toBe("Total pay-off₦25,000.05");
    expect(confirm.textContent).toContain("Retained by cooperative, not paid out: ₦1,500.00.");
    expect(el<HTMLSelectElement>("select[name=payOffMethod]").value).toBe("BANK_TRANSFER");
    expect(() => button("Record payment")).toThrow();
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
    expect(api.paidOff).toEqual([]);
  });

  it("pays out the total shown, then shows the notice and reads the member and balances again", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER_OFF,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        payOff: [paidOff("25000.05")],
      }),
    );
    await openPayOff();
    await choose(el("select[name=payOffMethod]"), "CASH");
    // The reads after the pay-off find the member Inactive with ₦0.00 to pay out (DR-07).
    api.getMember = async (id) => {
      api.calls.push(`get ${id}`);
      return { ok: true, value: { ...ACTIVE_ONE, status: "INACTIVE" } };
    };
    api.memberBalances = async (id) => {
      api.calls.push(`balances ${id}`);
      return { ok: true, value: ZERO_BALANCES };
    };
    await click(button(CONFIRM_BUTTON));

    expect(api.paidOff).toHaveLength(1);
    const sent = api.paidOff[0]!;
    expect(sent.idempotencyKey).toMatch(/^[0-9a-f]{32}$/);
    expect({ ...sent, idempotencyKey: "" }).toEqual({
      idempotencyKey: "",
      memberId: "m1",
      method: "CASH",
      total: "25000.05",
    });
    expect(el("[role=status]").textContent).toBe("Pay-off of ₦25,000.05 recorded. The member is now Inactive.");
    expect(container?.querySelector(".payoff-confirm")).toBeNull();
    expect(countCalls(api, "get m1")).toBe(2);
    expect(countCalls(api, "balances m1")).toBe(2);
    expect(countCalls(api, "payments m1")).toBe(2);
    expect(countCalls(api, "loans m1")).toBe(2);
    expect(el(".status-inactive").textContent).toBe("Inactive");
    expect(() => button(PAY_OFF_BUTTON)).toThrow();
    expect(() => button("Record payment")).toThrow();
  });

  it("sends the same key after a network failure, and a new key after a method change", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER_OFF,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        payOff: [{ ok: false, reason: "network" }, { ok: false, reason: "server" }, paidOff("25000.05")],
      }),
    );
    await openPayOff();
    await click(button(CONFIRM_BUTTON));
    expect(el("[role=alert]").textContent).toBe(
      "Cannot reach the server. Press Confirm pay-off again: it will not be paid twice.",
    );
    await click(button(CONFIRM_BUTTON));
    expect(el("[role=alert]").textContent).toContain("Something went wrong.");
    expect(api.paidOff[1]).toEqual(api.paidOff[0]);

    await choose(el("select[name=payOffMethod]"), "CASH");
    await click(button(CONFIRM_BUTTON));
    expect(api.paidOff).toHaveLength(3);
    expect(api.paidOff[2]!.method).toBe("CASH");
    expect(api.paidOff[2]!.idempotencyKey).not.toBe(api.paidOff[0]!.idempotencyKey);
    expect(el("[role=status]").textContent).toContain("Pay-off of ₦25,000.05");
  });

  it("makes a new key after idempotency_conflict", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER_OFF,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        payOff: [{ ok: false, reason: "idempotency_conflict" }],
      }),
    );
    await openPayOff();
    await click(button(CONFIRM_BUTTON));
    await click(button(CONFIRM_BUTTON));
    expect(api.paidOff).toHaveLength(2);
    expect(api.paidOff[1]!.idempotencyKey).not.toBe(api.paidOff[0]!.idempotencyKey);
  });

  it("on payout_changed reads the balances again and sends the new payout with a new key", async () => {
    const api = await mount(
      fakeApi({
        restore: PAYER_OFF,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        payOff: [{ ok: false, reason: "payout_changed" }, paidOff("30000.05")],
      }),
    );
    await openPayOff();
    // A payment saved elsewhere raised Savings after the balances were shown.
    const raised: MemberBalances = {
      ...PAY_OFF_BALANCES,
      categories: PAY_OFF_BALANCES.categories.map((c) =>
        c.category === "Savings" ? { ...c, balance: "10000.00" } : c,
      ),
      refundableTotal: "30000.05",
    };
    api.memberBalances = async (id) => {
      api.calls.push(`balances ${id}`);
      return { ok: true, value: raised };
    };
    await click(button(CONFIRM_BUTTON));
    expect(el("[role=alert]").textContent).toBe(
      "The balances changed after they were shown. Check the new payout and confirm again.",
    );
    expect(countCalls(api, "balances m1")).toBe(2);
    expect(el(".payoff-total").textContent).toBe("Total pay-off₦30,000.05");
    expect(el(".payoff-confirm").textContent).toContain("Savings₦10,000.00");

    await click(button(CONFIRM_BUTTON));
    expect(api.paidOff).toHaveLength(2);
    expect(api.paidOff[0]!.total).toBe("25000.05");
    expect(api.paidOff[1]!.total).toBe("30000.05");
    expect(api.paidOff[1]!.idempotencyKey).not.toBe(api.paidOff[0]!.idempotencyKey);
    expect(el("[role=status]").textContent).toBe("Pay-off of ₦30,000.05 recorded. The member is now Inactive.");
  });

  it("keeps the confirmation and shows the server's refusal", async () => {
    await mount(
      fakeApi({
        restore: PAYER_OFF,
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        payOff: [{ ok: false, reason: "active_loan" }],
      }),
    );
    await openPayOff();
    await click(button(CONFIRM_BUTTON));
    expect(el("[role=alert]").textContent).toBe(
      "This member has an active loan. The loan must be fully repaid before a pay-off.",
    );
    expect(el(".payoff-confirm")).toBeTruthy();
    expect(container?.querySelector("[role=status]")).toBeNull();
  });

  it("closes on Cancel with no call", async () => {
    const api = await mount(
      fakeApi({ restore: PAYER_OFF, members: [ACTIVE_ONE], balances: { ok: true, value: PAY_OFF_BALANCES } }),
    );
    await openPayOff();
    await click(button("Cancel"));
    expect(container?.querySelector(".payoff-confirm")).toBeNull();
    expect(button(PAY_OFF_BUTTON)).toBeTruthy();
    expect(button("Record payment")).toBeTruthy();
    expect(api.paidOff).toEqual([]);
  });
});

describe("reactivate helpers", () => {
  it("maps each refused reactivation to a message", () => {
    const cases: [Extract<ReactivateMemberResult, { ok: false }>, string | null][] = [
      [{ ok: false, reason: "already_active" }, "This member is already Active."],
      [{ ok: false, reason: "forbidden" }, "You do not have permission to do this."],
      [{ ok: false, reason: "not_found" }, "Member not found."],
      [{ ok: false, reason: "signed_out" }, null],
      [{ ok: false, reason: "network" }, "Cannot reach the server. Try again."],
      [{ ok: false, reason: "invalid_input" }, "Something went wrong. Try again."],
      [{ ok: false, reason: "server" }, "Something went wrong. Try again."],
    ];
    for (const [result, message] of cases) expect(reactivateMessage(result)).toBe(message);
  });
});

const REACTIVATOR: Me = { ...ME, permissions: ["members.view", "members.edit", "payments.create"] };

const REACTIVATE_BUTTON = "Reactivate member";

async function openInactive() {
  await openMembers();
  await click(button("All"));
  await click(el('button[aria-label="View Example Inactive"]'));
}

describe("reactivate (jsdom)", () => {
  it("has no Reactivate button without members.edit, or for an Active member", async () => {
    await mount(fakeApi({ restore: PAYER, members: [ACTIVE_ONE, INACTIVE_ONE] }));
    await openInactive();
    expect(el("h1").textContent).toBe("Example Inactive");
    expect(() => button(REACTIVATE_BUTTON)).toThrow();
    await act(async () => root?.unmount());

    await mount(fakeApi({ restore: REACTIVATOR, members: [ACTIVE_ONE, INACTIVE_ONE] }));
    await openDetail("Test Member One");
    expect(() => button(REACTIVATE_BUTTON)).toThrow();
  });

  it("reactivates with one call and shows the member Active from the reply, with no read again", async () => {
    const api = await mount(
      fakeApi({
        restore: REACTIVATOR,
        members: [INACTIVE_ONE],
        balances: { ok: true, value: DETAIL_BALANCES },
        reactivate: [{ ok: true, member: { ...INACTIVE_ONE, status: "ACTIVE" } }],
      }),
    );
    await openInactive();
    expect(el(".status-inactive").textContent).toBe("Inactive");
    expect(() => button("Record payment")).toThrow();
    await click(button(REACTIVATE_BUTTON));
    expect(api.reactivated).toEqual(["m3"]);
    expect(el("[role=status]").textContent).toBe("Example Inactive is Active again.");
    expect(container?.querySelector("[role=alert]")).toBeNull();
    expect(el(".badges .pill").textContent).toBe("Active");
    expect(() => button(REACTIVATE_BUTTON)).toThrow();
    expect(button("Record payment")).toBeTruthy();
    expect(countCalls(api, "get m3")).toBe(1);
  });

  it("on already_active shows the message and reads the member again", async () => {
    const api = await mount(
      fakeApi({ restore: REACTIVATOR, members: [INACTIVE_ONE], reactivate: [{ ok: false, reason: "already_active" }] }),
    );
    await openInactive();
    // Someone else reactivated the member after it was shown.
    api.getMember = async (id) => {
      api.calls.push(`get ${id}`);
      return { ok: true, value: { ...INACTIVE_ONE, status: "ACTIVE" } };
    };
    await click(button(REACTIVATE_BUTTON));
    expect(el("[role=alert]").textContent).toBe("This member is already Active.");
    expect(countCalls(api, "get m3")).toBe(2);
    expect(el(".badges .pill").textContent).toBe("Active");
    expect(() => button(REACTIVATE_BUTTON)).toThrow();
  });

  it("keeps the member Inactive and the button on other refusals; a second press calls again", async () => {
    const api = await mount(
      fakeApi({
        restore: REACTIVATOR,
        members: [INACTIVE_ONE],
        reactivate: [{ ok: false, reason: "network" }, { ok: false, reason: "forbidden" }],
      }),
    );
    await openInactive();
    await click(button(REACTIVATE_BUTTON));
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(el(".status-inactive").textContent).toBe("Inactive");
    await click(button(REACTIVATE_BUTTON));
    expect(el("[role=alert]").textContent).toBe("You do not have permission to do this.");
    expect(api.reactivated).toEqual(["m3", "m3"]);
    expect(countCalls(api, "get m3")).toBe(1);
    expect(container?.querySelector("[role=status]")).toBeNull();
  });

  it("disables the button while the call runs, so a double click sends one call", async () => {
    let finish: (result: ReactivateMemberResult) => void = () => undefined;
    const api = await mount(fakeApi({ restore: REACTIVATOR, members: [INACTIVE_ONE] }));
    api.reactivateMember = (id) => {
      api.reactivated.push(id);
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    await openInactive();
    const reactivateButton = button(REACTIVATE_BUTTON);
    await click(reactivateButton);
    expect(button("Reactivating…").disabled).toBe(true);
    await click(button("Reactivating…"));
    expect(api.reactivated).toEqual(["m3"]);
    await act(async () => finish({ ok: true, member: { ...INACTIVE_ONE, status: "ACTIVE" } }));
    expect(el("[role=status]").textContent).toBe("Example Inactive is Active again.");
  });

  it("shows the Reactivate button after a pay-off makes the member Inactive", async () => {
    const api = await mount(
      fakeApi({
        restore: { ...PAYER_OFF, permissions: [...PAYER_OFF.permissions, "members.edit"] },
        members: [ACTIVE_ONE],
        balances: { ok: true, value: PAY_OFF_BALANCES },
        payOff: [paidOff("25000.05")],
      }),
    );
    await openDetail("Test Member One");
    expect(() => button(REACTIVATE_BUTTON)).toThrow();
    await click(button(PAY_OFF_BUTTON));
    api.getMember = async (id) => {
      api.calls.push(`get ${id}`);
      return { ok: true, value: { ...ACTIVE_ONE, status: "INACTIVE" } };
    };
    await click(button(CONFIRM_BUTTON));
    expect(el(".status-inactive").textContent).toBe("Inactive");
    expect(button(REACTIVATE_BUTTON)).toBeTruthy();
  });
});

const STAFF_FORM: StaffFormInput = {
  displayName: "  Staff One ",
  email: " Staff.One@Example.test ",
  password: " a long password ",
  confirm: " a long password ",
  permissions: ["payments.view", "members.view"],
};

function staffAccount(id: string, displayName: string, extra: Partial<StaffAccount> = {}): StaffAccount {
  return {
    id,
    email: `${id}@example.test`,
    displayName,
    role: "STAFF",
    isActive: true,
    permissions: [],
    createdAt: "2026-10-23T09:00:00.000Z",
    ...extra,
  };
}

describe("staff helpers", () => {
  it("lists every permission of the server table but users.manage, in its order", () => {
    expect(STAFF_PERMISSIONS.map((p) => p.key)).toEqual([
      "dashboard",
      "members.view",
      "members.create",
      "members.edit",
      "members.delete",
      "payments.view",
      "payments.create",
      "payments.edit",
      "payments.delete",
      "expenses.view",
      "expenses.create",
      "expenses.edit",
      "expenses.delete",
      "loans.view",
      "loans.create",
      "loans.edit",
      "loans.delete",
      "reports.view",
      "reports.export",
      "loans.disburse",
      "payoff.process",
    ]);
    expect(STAFF_PERMISSIONS.find((p) => p.key === "payoff.process")?.label).toBe("Process member pay-off");
    expect(BLANK_STAFF.permissions).toEqual([]);
  });

  it("trims the name and email, keeps the password as typed, and puts permissions in table order", () => {
    expect(checkNewStaff(STAFF_FORM)).toEqual({
      ok: true,
      value: {
        displayName: "Staff One",
        email: "Staff.One@Example.test",
        password: " a long password ",
        permissions: ["members.view", "payments.view"],
      },
    });
    const twice = checkNewStaff({ ...STAFF_FORM, permissions: ["members.view", "members.view"] });
    expect(twice.ok && twice.value.permissions).toEqual(["members.view"]);
  });

  it("checks in the server's order: email, password, name, permissions", () => {
    const refused = (input: Partial<StaffFormInput>) => {
      const result = checkNewStaff({ ...STAFF_FORM, ...input });
      return result.ok ? null : result.message;
    };
    for (const email of ["", "staff", "a@b", "a b@c.test", "a@@c.test", `${"a".repeat(245)}@example.test`]) {
      expect(refused({ email, password: "" })).toBe("Enter a valid email address.");
    }
    expect(refused({ email: `${"a".repeat(241)}@example.test` })).toBeNull();
    expect(refused({ password: "a".repeat(11), confirm: "a".repeat(11), displayName: "" })).toBe(
      "The password must be 12 to 128 characters.",
    );
    expect(refused({ password: "a".repeat(129), confirm: "a".repeat(129) })).toMatch(/12 to 128/);
    expect(refused({ password: "a".repeat(12), confirm: "a".repeat(12) })).toBeNull();
    expect(refused({ password: "a".repeat(128), confirm: "a".repeat(128) })).toBeNull();
    expect(refused({ confirm: "a long password", displayName: "" })).toBe("The two passwords do not match.");
    expect(refused({ displayName: "   ", permissions: ["users.manage"] })).toBe("Enter the full name.");
    expect(refused({ displayName: "a".repeat(STAFF_NAME_MAX + 1) })).toBe("The full name may have at most 100 characters.");
    expect(refused({ displayName: ` ${"a".repeat(STAFF_NAME_MAX)} ` })).toBeNull();
    expect(refused({ permissions: ["users.manage"] })).toMatch(/unknown entry/);
    expect(refused({ permissions: ["toString"] })).toMatch(/unknown entry/);
    expect(refused({ permissions: [] })).toBeNull();
  });

  it("gives a message for each refusal", () => {
    expect(staffMessage({ ok: false, reason: "email_taken" })).toBe("Another account already uses this email.");
    expect(staffMessage({ ok: false, reason: "invalid_input" })).toMatch(/was refused/);
    expect(staffMessage({ ok: false, reason: "forbidden" })).toMatch(/permission/);
    expect(staffMessage({ ok: false, reason: "signed_out" })).toBeNull();
    expect(staffMessage({ ok: false, reason: "network" })).toMatch(/Cannot reach.*may have been created/);
    expect(staffMessage({ ok: false, reason: "server" })).toMatch(/went wrong.*may have been created/);
    expect(staffListMessage("forbidden")).toMatch(/permission/);
    expect(staffListMessage("signed_out")).toBeNull();
    expect(staffListMessage("network")).toMatch(/Cannot reach/);
    expect(staffListMessage("server")).toMatch(/went wrong/);
    expect(createdStaffMessage(staffAccount("s1", "Staff One"))).toBe(
      "Staff account created for Staff One (s1@example.test).",
    );
    expect(permissionCount(0)).toBe("None");
    expect(permissionCount(1)).toBe("1 permission");
    expect(permissionCount(5)).toBe("5 permissions");
  });

  it("cleans a permission list to table order, or refuses an unknown entry", () => {
    expect(cleanPermissions(["payoff.process", "dashboard", "dashboard"])).toEqual(["dashboard", "payoff.process"]);
    expect(cleanPermissions([])).toEqual([]);
    expect(cleanPermissions(["dashboard", "users.manage"])).toBeNull();
    expect(cleanPermissions(["toString"])).toBeNull();
    expect(UNKNOWN_PERMISSION).toMatch(/unknown entry/);
  });

  it("gives a message for each refused permissions change", () => {
    expect(permissionsMessage("not_found")).toMatch(/not found/);
    expect(permissionsMessage("invalid_input")).toMatch(/were refused/);
    expect(permissionsMessage("forbidden")).toMatch(/permission/);
    expect(permissionsMessage("signed_out")).toBeNull();
    expect(permissionsMessage("network")).toBe("Cannot reach the server. Try again.");
    expect(permissionsMessage("server")).toBe("Something went wrong. Try again.");
    expect(savedPermissionsMessage(staffAccount("s1", "Staff One"))).toBe("Permissions saved for Staff One: none.");
    expect(savedPermissionsMessage(staffAccount("s1", "Staff One", { permissions: ["dashboard"] }))).toBe(
      "Permissions saved for Staff One: 1 permission.",
    );
  });
});

const STAFF_MANAGER: Me = { ...ME, permissions: ["users.manage"] };

async function openStaff() {
  await click(button("Staff & access"));
}

function checkbox(key: string): HTMLInputElement {
  return el(`input[type=checkbox][value="${key}"]`);
}

async function fillStaffForm() {
  await type(el("input[name=displayName]"), " Staff Two ");
  await type(el("input[name=email]"), "staff.two@example.test");
  await type(el("input[name=password]"), "a long password 2");
  await type(el("input[name=confirm]"), "a long password 2");
}

describe("staff & access (jsdom)", () => {
  it("has no Staff & access button without users.manage", async () => {
    await mount(fakeApi({ restore: { ...ME, permissions: ["members.view", "payments.view"] } }));
    expect(() => button("Staff & access")).toThrow();
  });

  it("lists the staff as the server sends them", async () => {
    const api = await mount(
      fakeApi({
        restore: STAFF_MANAGER,
        staff: [
          staffAccount("s1", "Staff One", { permissions: ["members.view", "payments.view"] }),
          staffAccount("s2", "Staff Two", { isActive: false }),
        ],
      }),
    );
    await openStaff();
    expect(api.calls).toEqual(["staff"]);
    expect(el("h1").textContent).toBe("Staff & access");
    expect(rowTexts()).toEqual([
      "Staff Ones1@example.testActive2 permissions23 Oct 2026PermissionsDeactivateReset password",
      "Staff Twos2@example.testInactiveNone23 Oct 2026PermissionsReactivateReset password",
    ]);
  });

  it("says so when there are no staff", async () => {
    await mount(fakeApi({ restore: STAFF_MANAGER }));
    await openStaff();
    expect(text()).toContain("No staff accounts yet.");
  });

  it("shows the message when the list cannot be read", async () => {
    await mount(fakeApi({ restore: STAFF_MANAGER, staffList: { ok: false, reason: "network" } }));
    await openStaff();
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(rowTexts()).toHaveLength(0);
  });

  it("opens the form with no permission ticked and stops a bad form with no call", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER }));
    await openStaff();
    await click(button("+ Add staff"));
    expect(() => button("+ Add staff")).toThrow();
    const boxes = inputs("checkbox");
    expect(boxes).toHaveLength(21);
    expect(boxes.every((b) => !b.checked)).toBe(true);
    expect(text()).not.toContain("Manage staff");
    await fillStaffForm();
    await type(el("input[name=confirm]"), "a long password 3");
    await click(button("Create staff account"));
    expect(el("[role=alert]").textContent).toBe("The two passwords do not match.");
    expect(api.hired).toEqual([]);
  });

  it("creates the account with the ticked permissions, then reads the list again", async () => {
    const created = staffAccount("s2", "Staff Two", {
      email: "staff.two@example.test",
      permissions: ["members.view", "loans.disburse"],
    });
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, hire: [{ ok: true, staff: created }] }));
    await openStaff();
    await click(button("+ Add staff"));
    await fillStaffForm();
    await click(checkbox("loans.disburse"));
    await click(checkbox("members.view"));
    await click(checkbox("dashboard"));
    await click(checkbox("dashboard"));
    expect(checkbox("dashboard").checked).toBe(false);
    await click(button("Create staff account"));
    expect(api.hired).toEqual([
      {
        displayName: "Staff Two",
        email: "staff.two@example.test",
        password: "a long password 2",
        permissions: ["members.view", "loans.disburse"],
      },
    ]);
    expect(api.calls).toEqual(["staff", "hire", "staff"]);
    expect(el("[role=status]").textContent).toBe("Staff account created for Staff Two (staff.two@example.test).");
    expect(container?.querySelector("form.staff-form")).toBeNull();
    expect(rowTexts()).toEqual(["Staff Twostaff.two@example.testActive2 permissions23 Oct 2026PermissionsDeactivateReset password"]);
  });

  it("keeps the form open with the message when the email is taken, and Cancel closes it", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, hire: [{ ok: false, reason: "email_taken" }] }));
    await openStaff();
    await click(button("+ Add staff"));
    await fillStaffForm();
    await click(button("Create staff account"));
    expect(el("[role=alert]").textContent).toBe("Another account already uses this email.");
    expect(el<HTMLInputElement>("input[name=email]").value).toBe("staff.two@example.test");
    expect(button("Create staff account").disabled).toBe(false);
    expect(api.calls).toEqual(["staff", "hire"]);
    await click(button("Cancel"));
    expect(container?.querySelector("form.staff-form")).toBeNull();
    expect(button("+ Add staff")).toBeTruthy();
  });
});

async function openPermissions(name: string) {
  await click(el(`button[aria-label="Change permissions for ${name}"]`));
}

function ticked(): string[] {
  return inputs("checkbox")
    .filter((b) => b.checked)
    .map((b) => b.value);
}

describe("staff permissions (jsdom)", () => {
  const ONE = staffAccount("s1", "Staff One", { permissions: ["members.view", "payments.view"] });
  const TWO = staffAccount("s2", "Staff Two", { isActive: false });

  it("opens the grid with the account's permissions, one form at a time", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO] }));
    await openStaff();
    await openPermissions("Staff One");
    expect(el(".form-title").textContent).toBe("Permissions for Staff One");
    expect(ticked()).toEqual(["members.view", "payments.view"]);
    expect(inputs("checkbox")).toHaveLength(21);
    expect(() => button("+ Add staff")).toThrow();
    expect(() => button("Permissions")).toThrow();
    await click(button("Cancel"));
    expect(container?.querySelector("form.staff-form")).toBeNull();
    await openPermissions("Staff Two");
    expect(el(".form-title").textContent).toBe("Permissions for Staff Two");
    expect(ticked()).toEqual([]);
    expect(api.calls).toEqual(["staff"]);
  });

  it("sends the ticked list in table order, then reads the list again", async () => {
    const saved = { ...ONE, permissions: ["dashboard", "members.view", "loans.disburse"] };
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO], grant: [{ ok: true, value: saved }] }));
    await openStaff();
    await openPermissions("Staff One");
    await click(checkbox("payments.view"));
    await click(checkbox("loans.disburse"));
    await click(checkbox("dashboard"));
    await click(button("Save permissions"));
    expect(api.granted).toEqual([{ id: "s1", permissions: ["dashboard", "members.view", "loans.disburse"] }]);
    expect(api.calls).toEqual(["staff", "grant s1", "staff"]);
    expect(el("[role=status]").textContent).toBe("Permissions saved for Staff One: 3 permissions.");
    expect(container?.querySelector("form.staff-form")).toBeNull();
    expect(rowTexts()[0]).toBe("Staff Ones1@example.testActive3 permissions23 Oct 2026PermissionsDeactivateReset password");
  });

  it("can take every permission away", async () => {
    const api = await mount(
      fakeApi({ restore: STAFF_MANAGER, staff: [ONE], grant: [{ ok: true, value: { ...ONE, permissions: [] } }] }),
    );
    await openStaff();
    await openPermissions("Staff One");
    await click(checkbox("members.view"));
    await click(checkbox("payments.view"));
    await click(button("Save permissions"));
    expect(api.granted).toEqual([{ id: "s1", permissions: [] }]);
    expect(el("[role=status]").textContent).toBe("Permissions saved for Staff One: none.");
  });

  it("keeps the form and the ticks with the message on a refusal, and a retry sends again", async () => {
    const api = await mount(
      fakeApi({
        restore: STAFF_MANAGER,
        staff: [ONE],
        grant: [{ ok: false, reason: "network" }, { ok: false, reason: "not_found" }],
      }),
    );
    await openStaff();
    await openPermissions("Staff One");
    await click(checkbox("dashboard"));
    await click(button("Save permissions"));
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(ticked()).toEqual(["dashboard", "members.view", "payments.view"]);
    expect(button("Save permissions").disabled).toBe(false);
    await click(button("Save permissions"));
    expect(el("[role=alert]").textContent).toBe("This staff account was not found. Reload the page.");
    expect(api.calls).toEqual(["staff", "grant s1", "grant s1"]);
    expect(api.granted[1]).toEqual(api.granted[0]);
  });

  it("refuses an account holding a permission the grid does not list, with no call", async () => {
    const odd = { ...ONE, permissions: ["members.view", "reports.print"] };
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [odd] }));
    await openStaff();
    await openPermissions("Staff One");
    await click(button("Save permissions"));
    expect(el("[role=alert]").textContent).toBe(UNKNOWN_PERMISSION);
    expect(api.granted).toEqual([]);
  });
});

describe("staff status and password helpers", () => {
  it("gives a message for each refused deactivate or reactivate, and the notice from the reply", () => {
    expect(accountStatusMessage("not_found")).toBe("This staff account was not found. Reload the page.");
    expect(accountStatusMessage("forbidden")).toMatch(/permission/);
    expect(accountStatusMessage("signed_out")).toBeNull();
    expect(accountStatusMessage("network")).toBe("Cannot reach the server. Try again.");
    expect(accountStatusMessage("invalid_input")).toBe("Something went wrong. Try again.");
    expect(accountStatusMessage("server")).toBe("Something went wrong. Try again.");
    expect(accountStatusNotice(staffAccount("s1", "Staff One", { isActive: false }))).toBe("Staff One is deactivated.");
    expect(accountStatusNotice(staffAccount("s1", "Staff One"))).toBe("Staff One is active again.");
  });

  it("checks the new password's length, then that both match", () => {
    expect(checkResetPassword("a".repeat(11), "a".repeat(11))).toBe("The password must be 12 to 128 characters.");
    expect(checkResetPassword("a".repeat(129), "a".repeat(129))).toBe("The password must be 12 to 128 characters.");
    expect(checkResetPassword("a".repeat(12), "a".repeat(13))).toBe("The two passwords do not match.");
    expect(checkResetPassword("a".repeat(12), "a".repeat(12))).toBeNull();
    expect(checkResetPassword("a".repeat(128), "a".repeat(128))).toBeNull();
  });

  it("gives a message for each refused password reset, and a notice without the password", () => {
    expect(resetPasswordMessage("not_found")).toBe("This staff account was not found. Reload the page.");
    expect(resetPasswordMessage("invalid_input")).toBe("The password was refused. It must be 12 to 128 characters.");
    expect(resetPasswordMessage("forbidden")).toMatch(/permission/);
    expect(resetPasswordMessage("signed_out")).toBeNull();
    expect(resetPasswordMessage("network")).toBe("Cannot reach the server. Try again.");
    expect(resetPasswordMessage("server")).toBe("Something went wrong. Try again.");
    expect(resetPasswordNotice(staffAccount("s1", "Staff One"))).toBe("Password reset for Staff One.");
  });
});

describe("staff deactivate, reactivate and reset password (jsdom)", () => {
  const ONE = staffAccount("s1", "Staff One", { permissions: ["members.view"] });
  const TWO = staffAccount("s2", "Staff Two", { isActive: false });

  async function rowButton(label: string) {
    await click(el(`button[aria-label="${label}"]`));
  }

  it("asks before a deactivate, sends nothing on Cancel, and one form is open at a time", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO] }));
    await openStaff();
    await rowButton("Deactivate Staff One");
    expect(el(".form-title").textContent).toBe("Deactivate staff account");
    expect(text()).toContain("Deactivate Staff One (s1@example.test)?");
    expect(() => button("+ Add staff")).toThrow();
    expect(() => button("Reset password")).toThrow();
    await click(button("Cancel"));
    expect(container?.querySelector(".staff-form")).toBeNull();
    expect(api.calls).toEqual(["staff"]);
  });

  it("deactivates, shows the notice and reads the list again", async () => {
    const api = await mount(
      fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO], switch: [{ ok: true, value: { ...ONE, isActive: false } }] }),
    );
    await openStaff();
    await rowButton("Deactivate Staff One");
    await click(button("Deactivate account"));
    expect(api.switched).toEqual(["deactivate s1"]);
    expect(api.calls).toEqual(["staff", "deactivate s1", "staff"]);
    expect(el("[role=status]").textContent).toBe("Staff One is deactivated.");
    expect(container?.querySelector(".staff-form")).toBeNull();
    expect(rowTexts()[0]).toBe("Staff Ones1@example.testInactive1 permission23 Oct 2026PermissionsReactivateReset password");
  });

  it("reactivates an inactive account after asking", async () => {
    const api = await mount(
      fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO], switch: [{ ok: true, value: { ...TWO, isActive: true } }] }),
    );
    await openStaff();
    await rowButton("Reactivate Staff Two");
    expect(el(".form-title").textContent).toBe("Reactivate staff account");
    await click(button("Reactivate account"));
    expect(api.calls).toEqual(["staff", "reactivate s2", "staff"]);
    expect(el("[role=status]").textContent).toBe("Staff Two is active again.");
    expect(rowTexts()[1]).toBe("Staff Twos2@example.testActiveNone23 Oct 2026PermissionsDeactivateReset password");
  });

  it("keeps the confirm open with the message on a refusal, and a retry sends again", async () => {
    const api = await mount(
      fakeApi({
        restore: STAFF_MANAGER,
        staff: [ONE],
        switch: [{ ok: false, reason: "network" }, { ok: false, reason: "not_found" }],
      }),
    );
    await openStaff();
    await rowButton("Deactivate Staff One");
    await click(button("Deactivate account"));
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(button("Deactivate account").disabled).toBe(false);
    await click(button("Deactivate account"));
    expect(el("[role=alert]").textContent).toBe("This staff account was not found. Reload the page.");
    expect(api.calls).toEqual(["staff", "deactivate s1", "deactivate s1"]);
  });

  it("stops a short or mismatched password with no call, and Cancel closes the form", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO] }));
    await openStaff();
    await rowButton("Reset password for Staff Two");
    expect(el(".form-title").textContent).toBe("Reset password for Staff Two");
    await type(el("input[name=password]"), "too short");
    await type(el("input[name=confirm]"), "too short");
    await click(button("Reset password"));
    expect(el("[role=alert]").textContent).toBe("The password must be 12 to 128 characters.");
    await type(el("input[name=password]"), "a new long password");
    await click(button("Reset password"));
    expect(el("[role=alert]").textContent).toBe("The two passwords do not match.");
    expect(api.resets).toEqual([]);
    await click(button("Cancel"));
    expect(container?.querySelector(".staff-form")).toBeNull();
  });

  it("sends the password as typed, then closes the form, shows the notice and reads the list again", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [ONE, TWO], reset: [{ ok: true, value: TWO }] }));
    await openStaff();
    await rowButton("Reset password for Staff Two");
    await type(el("input[name=password]"), " a new long password ");
    await type(el("input[name=confirm]"), " a new long password ");
    await click(button("Reset password"));
    expect(api.resets).toEqual([{ id: "s2", password: " a new long password " }]);
    expect(api.calls).toEqual(["staff", "reset s2", "staff"]);
    expect(el("[role=status]").textContent).toBe("Password reset for Staff Two.");
    expect(container?.querySelector("input[type=password]")).toBeNull();
    expect(text()).not.toContain("a new long password");
  });

  it("keeps the form with the message on a refused reset", async () => {
    const api = await mount(
      fakeApi({ restore: STAFF_MANAGER, staff: [ONE], reset: [{ ok: false, reason: "invalid_input" }] }),
    );
    await openStaff();
    await rowButton("Reset password for Staff One");
    await type(el("input[name=password]"), "a new long password");
    await type(el("input[name=confirm]"), "a new long password");
    await click(button("Reset password"));
    expect(el("[role=alert]").textContent).toBe("The password was refused. It must be 12 to 128 characters.");
    expect(el<HTMLInputElement>("input[name=password]").value).toBe("a new long password");
    expect(api.calls).toEqual(["staff", "reset s1"]);
  });
});

function auditEntry(id: string, extra: Partial<AuditPage["entries"][number]> = {}): AuditPage["entries"][number] {
  return {
    id,
    createdAt: "2026-10-23T09:05:00.000Z",
    actorId: "u1",
    action: "staff.created",
    entityType: "User",
    entityId: "s1",
    detail: "permissions=2",
    ...extra,
  };
}

function auditPage(entries: AuditPage["entries"], extra: Partial<AuditPage> = {}): CallResult<AuditPage> {
  return { ok: true, value: { entries, limit: AUDIT_PAGE_SIZE, offset: 0, hasMore: false, ...extra } };
}

describe("audit helpers", () => {
  it("lists every action the server writes, once each", () => {
    expect(AUDIT_ACTIONS).toHaveLength(22);
    expect(new Set(AUDIT_ACTIONS).size).toBe(22);
    expect(AUDIT_ACTIONS).toContain("payoff.processed");
    expect(AUDIT_ACTIONS).toContain("staff.deactivated");
    expect(AUDIT_PAGE_SIZE).toBe(50);
  });

  it("shows the time in Lagos, and odd text as it came", () => {
    expect(formatTime("2026-10-31T23:30:00.000Z")).toBe("1 Nov 2026, 00:30");
    expect(formatTime("not a time")).toBe("not a time");
  });

  it("names the signed-in user first, then staff; no actor is a dash, an unknown id shows as sent", () => {
    const names = actorNames(ME.user, [staffAccount("s1", "Staff One"), staffAccount("u1", "Not Me")]);
    expect([...names]).toEqual([
      ["u1", "You (Ada Test)"],
      ["s1", "Staff One"],
    ]);
    expect(actorLabel(null, names)).toBe("—");
    expect(actorLabel("s1", names)).toBe("Staff One");
    expect(actorLabel("zz9", names)).toBe("zz9");
  });

  it("gives the page range and the messages", () => {
    expect(pageRange(0, 0)).toBe("No entries");
    expect(pageRange(50, 50)).toBe("Entries 51–100");
    expect(auditListMessage("invalid_input")).toMatch(/Press Clear/);
    expect(auditListMessage("network")).toBe("Cannot reach the server. Try again.");
    expect(auditListMessage("signed_out")).toBeNull();
    expect(auditListMessage("server")).toMatch(/went wrong/);
  });
});

async function openAudit() {
  await click(button("Audit log"));
}

describe("audit log (jsdom)", () => {
  it("has no Audit log button without users.manage", async () => {
    await mount(fakeApi({ restore: { ...ME, permissions: ["members.view", "expenses.view"] } }));
    expect(() => button("Audit log")).toThrow();
  });

  it("reads the staff and the first page, and shows each entry with its user", async () => {
    const api = await mount(
      fakeApi({
        restore: STAFF_MANAGER,
        staff: [staffAccount("s1", "Staff One")],
        audit: [
          auditPage([
            auditEntry("a3", { actorId: "s1", action: "payment.created", entityType: "Payment", detail: null }),
            auditEntry("a2", { actorId: null, action: "login.failure", entityType: "User", detail: "reason=x" }),
            auditEntry("a1", { actorId: "gone", createdAt: "2026-10-31T23:30:00.000Z" }),
          ]),
        ],
      }),
    );
    await openAudit();
    expect(el("h1").textContent).toBe("Audit log");
    expect(api.calls).toEqual(["staff", "audit"]);
    expect(api.auditQueries).toEqual([{ limit: 50, offset: 0 }]);
    expect(rowTexts()).toEqual([
      "23 Oct 2026, 10:05Staff Onepayment.createdPayment—",
      "23 Oct 2026, 10:05—login.failureUserreason=x",
      "1 Nov 2026, 00:30gonestaff.createdUserpermissions=2",
    ]);
    expect(text()).toContain("Entries 1–3");
    expect(button("Newer").disabled).toBe(true);
    expect(button("Older").disabled).toBe(true);
  });

  it("offers the signed-in user and the staff in the user filter, and every action", async () => {
    await mount(fakeApi({ restore: STAFF_MANAGER, staff: [staffAccount("s1", "Staff One")] }));
    await openAudit();
    const users = Array.from(select("actorId").options).map((o) => [o.value, o.textContent]);
    expect(users).toEqual([
      ["", "All users"],
      ["u1", "You (Ada Test)"],
      ["s1", "Staff One"],
    ]);
    expect(select("action").options).toHaveLength(23);
    expect(text()).toContain("No entries found.");
  });

  it("still shows the log with ids when the staff list cannot be read", async () => {
    await mount(
      fakeApi({
        restore: STAFF_MANAGER,
        staffList: { ok: false, reason: "network" },
        audit: [auditPage([auditEntry("a1", { actorId: "s1" })])],
      }),
    );
    await openAudit();
    expect(rowTexts()).toEqual(["23 Oct 2026, 10:05s1staff.createdUserpermissions=2"]);
    expect(container?.querySelector("[role=alert]")).toBeNull();
  });

  it("sends the filters on Apply from the first page, and Clear empties them", async () => {
    const api = await mount(fakeApi({ restore: STAFF_MANAGER, staff: [staffAccount("s1", "Staff One")] }));
    await openAudit();
    await choose(select("actorId"), "s1");
    await choose(select("action"), "staff.deactivated");
    expect(api.auditQueries).toHaveLength(1);
    await click(button("Apply"));
    await click(button("Clear"));
    expect(api.auditQueries).toEqual([
      { limit: 50, offset: 0 },
      { actorId: "s1", action: "staff.deactivated", limit: 50, offset: 0 },
      { limit: 50, offset: 0 },
    ]);
    expect(select("actorId").value).toBe("");
    expect(select("action").value).toBe("");
  });

  it("moves to older and newer pages and keeps the filters", async () => {
    const full = Array.from({ length: 50 }, (_, i) => auditEntry(`a${i}`));
    const api = await mount(
      fakeApi({
        restore: STAFF_MANAGER,
        audit: [
          auditPage(full, { hasMore: true }),
          auditPage(full, { hasMore: true }),
          auditPage([auditEntry("b1")], { offset: 50 }),
          auditPage(full, { hasMore: true }),
        ],
      }),
    );
    await openAudit();
    await choose(select("action"), "staff.created");
    await click(button("Apply"));
    expect(text()).toContain("Entries 1–50");
    await click(button("Older"));
    expect(text()).toContain("Entries 51–51");
    expect(button("Older").disabled).toBe(true);
    await click(button("Newer"));
    expect(api.auditQueries).toEqual([
      { limit: 50, offset: 0 },
      { action: "staff.created", limit: 50, offset: 0 },
      { action: "staff.created", limit: 50, offset: 50 },
      { action: "staff.created", limit: 50, offset: 0 },
    ]);
    expect(text()).toContain("Entries 1–50");
  });

  it("shows the message when the log cannot be read", async () => {
    await mount(fakeApi({ restore: STAFF_MANAGER, audit: [{ ok: false, reason: "invalid_input" }] }));
    await openAudit();
    expect(el("[role=alert]").textContent).toBe("The filters were refused. Press Clear and try again.");
    expect(rowTexts()).toHaveLength(0);
  });
});

const DASHBOARD: DashboardView = {
  month: "2026-10",
  fromDay: "2026-10-01",
  toDay: "2026-10-31",
  income: { month: "125000.00", allTime: "3400000.50" },
  expenditure: { month: "15000.00", allTime: "220000.00" },
  membershipWithdrawal: { month: "0.00", allTime: "48000.00" },
  outstandingLoans: "90000.00",
  activeMembers: 12,
  recentExpenses: [
    expense("e2", "2026-10-03", "15000.00", { category: "Office Maintenance", description: "Plumber" }),
    expense("e1", "2026-10-01", "5000.00", { category: "Others", narration: "Fuel", method: "BANK_TRANSFER" }),
  ],
};

const DASHBOARD_VIEWER: Me = { ...ME, user: { ...ME.user, role: "STAFF" }, permissions: ["dashboard"] };
const DASHBOARD_OWNER: Me = { ...ME, permissions: ["dashboard", "users.manage"] };

function cardTexts(): string[] {
  return Array.from(container?.querySelectorAll(".card") ?? []).map((c) => c.textContent ?? "");
}

describe("dashboard helpers", () => {
  it("gives this month in Lagos, an hour ahead of UTC", () => {
    expect(lagosMonth(new Date("2026-10-31T22:59:00.000Z"))).toBe("2026-10");
    expect(lagosMonth(new Date("2026-10-31T23:30:00.000Z"))).toBe("2026-11");
  });

  it("writes a month as Oct 2026, and other text as it came", () => {
    expect(formatMonth("2026-10")).toBe("Oct 2026");
    expect(formatMonth("2026-01")).toBe("Jan 2026");
    expect(formatMonth("2026-12")).toBe("Dec 2026");
    expect(formatMonth("2026-13")).toBe("2026-13");
    expect(formatMonth("")).toBe("");
  });

  it("checks the month and adds the staff filter only when chosen", () => {
    expect(checkDashboardFilter({ month: "", staffId: "" })).toEqual({ ok: false, message: "Choose a month." });
    expect(checkDashboardFilter({ month: "2026-13", staffId: "" })).toEqual({ ok: false, message: "Enter a real month." });
    expect(checkDashboardFilter({ month: "2026-00", staffId: "" })).toEqual({ ok: false, message: "Enter a real month." });
    expect(checkDashboardFilter({ month: "2026-1", staffId: "" })).toEqual({ ok: false, message: "Enter a real month." });
    expect(checkDashboardFilter({ month: "2026-09", staffId: "" })).toEqual({ ok: true, value: { month: "2026-09" } });
    expect(checkDashboardFilter({ month: "2026-09", staffId: "s1" })).toEqual({
      ok: true,
      value: { month: "2026-09", createdById: "s1" },
    });
  });

  it("has a message for every failure, none for signed_out", () => {
    expect(dashboardMessage("invalid_input")).toBe("The month or staff filter was refused. Press Clear and try again.");
    expect(dashboardMessage("forbidden")).toBe("You do not have permission to do this.");
    expect(dashboardMessage("signed_out")).toBeNull();
    expect(dashboardMessage("network")).toBe("Cannot reach the server. Try again.");
    expect(dashboardMessage("server")).toBe("Something went wrong. Try again.");
    expect(dashboardMessage("not_found")).toBe("Something went wrong. Try again.");
  });

  it("lists the cards in order with the amounts as sent", () => {
    expect(dashboardCards(DASHBOARD)).toEqual([
      { label: "Active Members", value: "12" },
      { label: "Income · Oct 2026", value: "₦125,000.00" },
      { label: "Income · All Time", value: "₦3,400,000.50" },
      { label: "Total Expenditures · Oct 2026", value: "₦15,000.00" },
      { label: "Total Expenditures · All Time", value: "₦220,000.00" },
      { label: "Outstanding Loans", value: "₦90,000.00" },
      { label: "Withdrawals · Oct 2026", value: "₦0.00" },
      { label: "Withdrawals · All Time", value: "₦48,000.00" },
    ]);
  });
});

describe("dashboard (jsdom)", () => {
  it("keeps the plain Home page without dashboard and never reads it", async () => {
    const api = await mount(fakeApi({ restore: { ...ME, permissions: ["members.view"] } }));
    expect(button("Home")).toBeDefined();
    expect(() => button("Dashboard")).toThrow();
    expect(text()).toContain("Signed in as Ada Test");
    expect(api.calls).toEqual([]);
  });

  it("shows the dashboard on Home for a Staff holder, with no staff filter", async () => {
    const api = await mount(fakeApi({ restore: DASHBOARD_VIEWER, dashboard: [{ ok: true, value: DASHBOARD }] }));
    expect(() => button("Home")).toThrow();
    expect(button("Dashboard").className).toBe("active");
    expect(el("h1").textContent).toBe("Dashboard");
    expect(api.calls).toEqual(["dashboard"]);
    expect(api.dashboardQueries).toEqual([{}]);
    expect(cardTexts()).toEqual([
      "Active Members12",
      "Income · Oct 2026₦125,000.00",
      "Income · All Time₦3,400,000.50",
      "Total Expenditures · Oct 2026₦15,000.00",
      "Total Expenditures · All Time₦220,000.00",
      "Outstanding Loans₦90,000.00",
      "Withdrawals · Oct 2026₦0.00",
      "Withdrawals · All Time₦48,000.00",
    ]);
    expect(text()).toContain("1 Oct 2026 to 31 Oct 2026");
    expect(rowTexts()).toEqual([
      "3 Oct 2026Office MaintenancePlumber₦15,000.00Cash",
      "1 Oct 2026OthersFuel₦5,000.00Bank transfer",
    ]);
    expect(container?.querySelector("select[name=staffId]")).toBeNull();
    expect(text()).not.toContain("Signed in as");
  });

  it("goes back to the dashboard from another page", async () => {
    const api = await mount(
      fakeApi({ restore: { ...DASHBOARD_VIEWER, permissions: ["dashboard", "expenses.view"] }, dashboard: [{ ok: true, value: DASHBOARD }] }),
    );
    await click(button("Expenses"));
    expect(el("h1").textContent).toBe("Expenses");
    await click(button("Dashboard"));
    expect(el("h1").textContent).toBe("Dashboard");
    expect(api.dashboardQueries).toEqual([{}, {}]);
  });

  it("sends the month on Apply and shows the reply", async () => {
    const september = { ...DASHBOARD, month: "2026-09", fromDay: "2026-09-01", toDay: "2026-09-30", recentExpenses: [] };
    const api = await mount(
      fakeApi({ restore: DASHBOARD_VIEWER, dashboard: [{ ok: true, value: DASHBOARD }, { ok: true, value: september }] }),
    );
    await type(el("input[name=month]"), "2026-09");
    await click(button("Apply"));
    expect(api.dashboardQueries).toEqual([{}, { month: "2026-09" }]);
    expect(cardTexts()[1]).toBe("Income · Sep 2026₦125,000.00");
    expect(text()).toContain("No expenses this month.");
    expect(rowTexts()).toHaveLength(0);
  });

  it("stops an empty month in the browser", async () => {
    const api = await mount(fakeApi({ restore: DASHBOARD_VIEWER, dashboard: [{ ok: true, value: DASHBOARD }] }));
    await type(el("input[name=month]"), "");
    await click(button("Apply"));
    expect(el("[role=alert]").textContent).toBe("Choose a month.");
    expect(api.dashboardQueries).toEqual([{}]);
    expect(cardTexts()).toHaveLength(8);
  });

  it("offers the staff filter to the Super Admin and sends createdById; Clear goes back", async () => {
    const api = await mount(
      fakeApi({
        restore: DASHBOARD_OWNER,
        staff: [staffAccount("s1", "Staff One")],
        dashboard: [{ ok: true, value: DASHBOARD }],
      }),
    );
    expect(api.calls).toContain("staff");
    const options = Array.from(select("staffId").options).map((o) => `${o.value}:${o.textContent}`);
    expect(options).toEqual([":All staff", "u1:You (Ada Test)", "s1:Staff One"]);
    await type(el("input[name=month]"), "2026-09");
    await choose(select("staffId"), "s1");
    await click(button("Apply"));
    await click(button("Clear"));
    expect(api.dashboardQueries).toEqual([{}, { month: "2026-09", createdById: "s1" }, {}]);
    expect(select("staffId").value).toBe("");
    expect(el<HTMLInputElement>("input[name=month]").value).toBe(lagosMonth());
  });

  it("shows no staff filter when the staff list cannot be read", async () => {
    await mount(
      fakeApi({
        restore: DASHBOARD_OWNER,
        staffList: { ok: false, reason: "server" },
        dashboard: [{ ok: true, value: DASHBOARD }],
      }),
    );
    expect(container?.querySelector("select[name=staffId]")).toBeNull();
    expect(cardTexts()).toHaveLength(8);
  });

  it("shows the message and no cards when the dashboard cannot be read", async () => {
    await mount(fakeApi({ restore: DASHBOARD_VIEWER, dashboard: [{ ok: false, reason: "network" }] }));
    expect(el("[role=alert]").textContent).toBe("Cannot reach the server. Try again.");
    expect(cardTexts()).toHaveLength(0);
    expect(rowTexts()).toHaveLength(0);
  });
});
