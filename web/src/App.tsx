// Sign-in, sign-out and change own password (U.2, D-81), members list and add member (U.3e),
// member detail (U.3f), record a payment from member detail (U.4e2), the first payment after
// adding a member (U.4f), give a loan from member detail (U.5b), the expense list (U.6c), record
// an expense (U.6d). Other screens come in U.6e to U.8.
import { useEffect, useState } from "react";
import { browserRefreshLock, createApi, type Api, type ChangePasswordResult, type LoginResult, type Me } from "./api.ts";
import ChangePassword from "./ChangePassword.tsx";
import Expenses from "./Expenses.tsx";
import Members from "./Members.tsx";
import { browserLocalStorage, createSessionKeeper } from "./session.ts";
import SignIn from "./SignIn.tsx";

export const SYSTEM_NAME = "IYANU-OLUWA Cooperative Management System";
export const SESSION_ENDED = "Your session has ended. Please sign in again.";
export const PASSWORD_CHANGED = "Password changed. Please sign in with the new password.";

type Page = "home" | "password" | "members" | "expenses";

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
  if (result.reason === "network") return "Cannot reach the server. Try again.";
  return "Something went wrong. Try again.";
}

export function changePasswordMessage(result: ChangePasswordResult): string | null {
  if (result.ok) return null;
  switch (result.reason) {
    case "wrong_password":
      return "The current password is wrong.";
    case "invalid_input":
      return "The new password was refused. Use 12 to 128 characters, different from the current one.";
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
}

export default function App({ makeApi = browserApi }: AppProps) {
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
      <main>
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
  return (
    <div className="app">
      <header>
        <div className="brand">
          <b>IO</b>
          <div>
            IYANU-OLUWA
            <small>Cooperative Management</small>
          </div>
        </div>
        <span className="who">
          {me.user.displayName}
          <small>{me.user.role === "SUPER_ADMIN" ? "Super Admin" : "Staff"}</small>
        </span>
        <nav>
          <button
            type="button"
            className={view.page === "home" ? "active" : ""}
            onClick={() => go("home")}
          >
            Home
          </button>
          {can("members.view") && (
            <button
              type="button"
              className={view.page === "members" ? "active" : ""}
              onClick={() => go("members")}
            >
              Members
            </button>
          )}
          {can("expenses.view") && (
            <button
              type="button"
              className={view.page === "expenses" ? "active" : ""}
              onClick={() => go("expenses")}
            >
              Expenses
            </button>
          )}
        </nav>
        <button type="button" className="secondary" onClick={() => go("password")}>
          Change password
        </button>
        <button type="button" className="logout" onClick={signOut}>
          Sign out
        </button>
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
          />
        ) : view.page === "expenses" && can("expenses.view") ? (
          <Expenses api={api} canCreate={can("expenses.create")} />
        ) : (
          <>
            <h1>{SYSTEM_NAME}</h1>
            <p>Signed in as {me.user.displayName}. The screens come in the next steps.</p>
          </>
        )}
      </main>
    </div>
  );
}
