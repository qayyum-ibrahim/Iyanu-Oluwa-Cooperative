import { useState, type FormEvent } from "react";

// The server's limits (server/src/password.ts). The server checks again.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** A message for the new password, or null if it may be sent. */
export function checkNewPassword(current: string, next: string, confirm: string): string | null {
  if (next.length < PASSWORD_MIN_LENGTH || next.length > PASSWORD_MAX_LENGTH) {
    return `The new password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (next === current) return "The new password must differ from the current one.";
  if (next !== confirm) return "The two new passwords do not match.";
  return null;
}

export interface ChangePasswordProps {
  /** Resolves to an error message, or null on success. */
  onSubmit(currentPassword: string, newPassword: string): Promise<string | null>;
  onCancel(): void;
}

export default function ChangePassword({ onSubmit, onCancel }: ChangePasswordProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = checkNewPassword(current, next, confirm);
    if (problem !== null) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const message = await onSubmit(current, next);
    setBusy(false);
    if (message !== null) setError(message);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2 className="form-title">Change your password</h2>
      <label className="field">
        <span>Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="field">
        <span>New password ({PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters)</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <label className="field">
        <span>New password again</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
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
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
