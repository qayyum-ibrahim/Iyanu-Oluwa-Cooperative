// Sign-in, sign-out and change own password (U.2, D-81), members list and add member (U.3e),
// member detail (U.3f), record a payment from member detail (U.4e2), the first payment after
// adding a member (U.4f), give a loan from member detail (U.5b), the expense list (U.6c), record
// an expense (U.6d), edit and delete an expense (U.6e), the pay-off on member detail (U.7a),
// reactivate a member on member detail (U.7b), the staff list and add staff (U.8a), staff
// permissions (U.8b), deactivate, reactivate and reset a staff password (U.8c), the audit log (U.8d),
// the dashboard on Home for the holder of `dashboard` (7.5b, A-242), the categories report for the
// holder of `reports.view` (7.6b, A-244), the exports page for the holder of `reports.export` (8.6, A-255),
// the side menu in groups (D.1, D-125).
import { useEffect, useState } from "react";
import {
  browserRefreshLock,
  createApi,
  type Api,
  type ChangePasswordResult,
  type ExportFile,
  type LoginResult,
  type Me,
} from "./api.ts";
import Audit from "./Audit.tsx";
import ChangePassword from "./ChangePassword.tsx";
import Dashboard from "./Dashboard.tsx";
import Expenses from "./Expenses.tsx";
import Exports, { browserSaveFile } from "./Exports.tsx";
import Members from "./Members.tsx";
import Reports from "./Reports.tsx";
import { browserLocalStorage, createSessionKeeper } from "./session.ts";
import SignIn from "./SignIn.tsx";
import Staff from "./Staff.tsx";

export const SYSTEM_NAME = "IYANU-OLUWA Cooperative Management System";
export const SESSION_ENDED = "Your session has ended. Please sign in again.";
export const PASSWORD_CHANGED = "Password changed. Please sign in with the new password.";

type Page = "home" | "password" | "members" | "expenses" | "reports" | "exports" | "staff" | "audit";

type View =
  | { kind: "loading" }
  | { kind: "signed-out"; notice?: string }
  | { kind: "signed-in"; me: Me; page: Page };

/** Every sign-in refusal reads the same (D-26), with the lockout rule (D-30) for everyone. */
export const SIGN_IN_FAILED =
  "Sign-in failed. Check your email and password. After 5 failed tries an account is locked for 15 minutes.";

export function loginMessage(result: LoginResult): string | null {
  if (result.ok) return null;
  if (result.reason === "invalid_credentials") return SIGN_IN_FAILED;
  if (result.reason === "too_many_requests") return tooManyMessage(result.retryAfterSeconds);
  if (result.reason === "network") return "Cannot reach the server. Try again.";
  return "Something went wrong. Try again.";
}

/** The per-address limit (A-284). Says nothing about the account, so D-26 is kept. */
export function tooManyMessage(retryAfterSeconds: number | null): string {
  const lead = "Too many sign-in attempts from this connection.";
  if (retryAfterSeconds === null) return `${lead} Wait 15 minutes, then try again.`;
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `${lead} Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"}, then try again.`;
}

export function changePasswordMessage(result: ChangePasswordResult): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case "wrong_password":
      return "The current password is wrong.";
    case "invalid_input":
      return "The new password was refused. Use 6 to 128 characters, different from the current one.";
    case "signed_out":
      return SESSION_ENDED;
    case "network":
      return "Cannot reach the server. Try again.";
    default:
      return "Something went wrong. Try again.";
  }
}

function browserApi(onSignedOut: () => void): Api {
  return createApi({
    fetch: (input, init) => fetch(input, init),
    keeper: createSessionKeeper(browserLocalStorage()),
    lock: browserRefreshLock(),
    onSignedOut,
  });
}

export interface AppProps {
  makeApi?: (onSignedOut: () => void) => Api;
  /** Saves an export file; the tests pass their own, because jsdom cannot save one (A-255). */
  saveFile?: (file: ExportFile) => void;
}

export default function App({ makeApi = browserApi, saveFile = browserSaveFile }: AppProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [api] = useState(() =>
    makeApi(() => setView({ kind: "signed-out", notice: SESSION_ENDED })),
  );

  useEffect(() => {
    let active = true;
    api.restore().then((me) => {
      if (!active) return;
      setView(me === null ? { kind: "signed-out" } : { kind: "signed-in", me, page: "home" });
    });
    return () => {
      active = false;
    };
  }, [api]);

  async function signIn(email: string, password: string): Promise<string | null> {
    const result = await api.login(email, password);
    if (result.ok) setView({ kind: "signed-in", me: result.me, page: "home" });
    return loginMessage(result);
  }

  async function signOut() {
    await api.logout();
    setView({ kind: "signed-out" });
  }

  async function changePassword(current: string, next: string): Promise<string | null> {
    const result = await api.changePassword(current, next);
    if (result.ok) {
      setView({ kind: "signed-out", notice: PASSWORD_CHANGED });
      return null;
    }
    if (result.reason === "signed_out") return null; // onSignedOut already showed sign-in.
    return changePasswordMessage(result);
  }

  if (view.kind === "loading") {
    return (
      <main className="loading">
        <h1>{SYSTEM_NAME}</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (view.kind === "signed-out") {
    return <SignIn onSignIn={signIn} notice={view.notice} />;
  }

  const { me } = view;
  const can = (permission: string) => me.permissions.includes(permission);
  const go = (page: Page) => setView({ ...view, page });
  // One menu button; aria-current marks the open page (D-125, docs/DESIGN.md section 5).
  const item = (page: Page, label: string) => (
    <button
      type="button"
      aria-current={view.page === page ? "page" : undefined}
      onClick={() => go(page)}
    >
      {label}
    </button>
  );
  const showRecords = can("members.view") || can("expenses.view");
  const showReports = can("reports.view") || can("reports.export");
  return (
    <div className="app">
      <header className="sidebar">
        <div className="brand">
          <b>IO</b>
          <div>
            IYANU-OLUWA
            <small>Cooperative Management</small>
          </div>
        </div>
        <nav aria-label="Main menu">
          <div className="nav-group" role="group" aria-labelledby="nav-overview">
            <p id="nav-overview">Overview</p>
            {item("home", can("dashboard") ? "Dashboard" : "Home")}
          </div>
          {showRecords && (
            <div className="nav-group" role="group" aria-labelledby="nav-records">
              <p id="nav-records">Records</p>
              {can("members.view") && item("members", "Members")}
              {can("expenses.view") && item("expenses", "Expenses")}
            </div>
          )}
          {showReports && (
            <div className="nav-group" role="group" aria-labelledby="nav-reports">
              <p id="nav-reports">Reports</p>
              {can("reports.view") && item("reports", "Categories")}
              {can("reports.export") && item("exports", "Exports")}
            </div>
          )}
          {can("users.manage") && (
            <div className="nav-group" role="group" aria-labelledby="nav-admin">
              <p id="nav-admin">Administration</p>
              {item("staff", "Staff & access")}
              {item("audit", "Audit log")}
            </div>
          )}
        </nav>
        <div className="sidebar-foot">
          <span className="who">
            {me.user.displayName}
            <small>{me.user.role === "SUPER_ADMIN" ? "Super Admin" : "Staff"}</small>
          </span>
          {item("password", "Change password")}
          <button type="button" className="logout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        {view.page === "password" ? (
          <ChangePassword onSubmit={changePassword} onCancel={() => go("home")} />
        ) : view.page === "members" && can("members.view") ? (
          <Members
            api={api}
            canCreate={can("members.create")}
            canViewPayments={can("payments.view")}
            canViewLoans={can("loans.view")}
            canRecordPayment={can("payments.create")}
            canGiveLoan={can("loans.disburse")}
            canPayOff={can("payoff.process")}
            canReactivate={can("members.edit")}
          />
        ) : view.page === "expenses" && can("expenses.view") ? (
          <Expenses
            api={api}
            canCreate={can("expenses.create")}
            canEdit={can("expenses.edit")}
            canDelete={can("expenses.delete")}
          />
        ) : view.page === "reports" && can("reports.view") ? (
          <Reports api={api} me={me.user} canFilterStaff={can("users.manage")} />
        ) : view.page === "exports" && can("reports.export") ? (
          <Exports api={api} me={me.user} canFilterStaff={can("users.manage")} saveFile={saveFile} />
        ) : view.page === "staff" && can("users.manage") ? (
          <Staff api={api} />
        ) : view.page === "audit" && can("users.manage") ? (
          <Audit api={api} me={me.user} />
        ) : can("dashboard") ? (
          <Dashboard api={api} me={me.user} canFilterStaff={can("users.manage")} />
        ) : (
          <div className="title">
            <div>
              <h1>{SYSTEM_NAME}</h1>
              <p>Signed in as {me.user.displayName}. Choose a page from the menu.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
