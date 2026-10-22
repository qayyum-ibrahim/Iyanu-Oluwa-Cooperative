import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import App, { PASSWORD_CHANGED, SESSION_ENDED, changePasswordMessage, loginMessage } from "../src/App";
import type { Api } from "../src/api.ts";
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
    expect(loginMessage({ ok: false, reason: "invalid_credentials" })).toBe(
      "Sign-in failed. Check your email and password.",
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
