// @vitest-environment jsdom
// Click tests use jsdom (U.2d): https://vitest.dev/guide/environment.html, https://react.dev/reference/react/act
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App, {
  PASSWORD_CHANGED,
  SESSION_ENDED,
  SIGN_IN_FAILED,
  changePasswordMessage,
  loginMessage,
} from "../src/App";
import type { Api, ChangePasswordResult, LoginResult, Me } from "../src/api.ts";
import ChangePassword, { checkNewPassword } from "../src/ChangePassword.tsx";
import SignIn from "../src/SignIn.tsx";

const idleApi: Api = {
  login: async () => ({ ok: false, reason: "server" }),
  restore: async () => null,
  me: async () => null,
  logout: async () => undefined,
  changePassword: async () => ({ ok: false, reason: "server" }),
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
  signOutFromServer(): void;
}

function fakeApi(
  opts: { restore?: Me | null; login?: LoginResult; change?: ChangePasswordResult } = {},
): (onSignedOut: () => void) => FakeApi {
  return (onSignedOut) => {
    const calls: string[] = [];
    return {
      calls,
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
