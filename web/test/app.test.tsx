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
  CallResult,
  ChangePasswordResult,
  CreatePaymentResult,
  LoginResult,
  Loan,
  Me,
  Member,
  MemberBalances,
  MemberStatusFilter,
  NewPayment,
  Payment,
  SmsOutcome,
} from "../src/api.ts";
import ChangePassword, { checkNewPassword } from "../src/ChangePassword.tsx";
import {
  PAYMENT_CATEGORIES,
  PAYMENT_LINES_MAX,
  breakdownKobo,
  checkNewMember,
  checkPayment,
  formatDate,
  formatDay,
  formatNaira,
  isCalendarDay,
  koboToNaira,
  lagosToday,
  memberMessage,
  nairaToKobo,
  newIdempotencyKey,
  paymentMessage,
  recordButtonLabel,
  savedPaymentMessage,
  searchMembers,
  smsMessage,
  type PaymentFormInput,
} from "../src/Members.tsx";
import SignIn from "../src/SignIn.tsx";

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
  } = {},
): (onSignedOut: () => void) => FakeApi {
  return (onSignedOut) => {
    const calls: string[] = [];
    const paid: NewPayment[] = [];
    return {
      calls,
      paid,
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
    const older: Loan = { ...ACTIVE_LOAN, id: "l0", createdAt: "2026-10-01T09:00:00.000Z", repaid: "20000.00", outstanding: "0.00", status: "FULLY_REPAID" };
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
