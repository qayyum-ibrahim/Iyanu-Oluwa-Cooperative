import { useState, type FormEvent } from "react";

export interface SignInProps {
  /** Resolves to an error message, or null when signed in. */
  onSignIn(email: string, password: string): Promise<string | null>;
  notice?: string;
}

export default function SignIn({ onSignIn, notice }: SignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await onSignIn(email.trim(), password);
    setBusy(false);
    if (message !== null) {
      setError(message);
      setPassword("");
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">IO</div>
        <h1>Sign in</h1>
        <p>IYANU-OLUWA Cooperative Management System</p>
        {notice && <p className="notice">{notice}</p>}
        <label>
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <em role="alert" className="error">
            {error}
          </em>
        )}
      </form>
    </div>
  );
}
