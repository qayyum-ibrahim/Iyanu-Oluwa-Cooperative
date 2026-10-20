// SMS provider interface and a fake provider (step 4.6, D-07).
// Pure module: no network, no store, no secrets. A real provider (Twilio, OQ-05) is a later
// adapter that implements the same interface.
// Logic code must treat send() as "may fail" and save the payment first (D-07). A real adapter
// may also throw, so callers catch.

export interface SmsMessage {
  /** The phone number as given. No format check yet (A-82). */
  to: string;
  body: string;
}

export type SmsFailure = "invalid_number" | "invalid_message" | "provider_error";

export type SmsResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; reason: SmsFailure };

export interface SmsProvider {
  /** Expected failures come back as { ok: false }. */
  send(message: SmsMessage): Promise<SmsResult>;
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/**
 * Test and development provider. It sends nothing: it keeps each accepted message in memory.
 * Checks, in order: number, then body, then a failure set by failNext().
 */
export class FakeSmsProvider implements SmsProvider {
  #sent: SmsMessage[] = [];
  #pendingFailure: SmsFailure | null = null;
  #counter = 0;

  /** Makes the next valid send fail with this reason. It affects one send only. */
  failNext(reason: SmsFailure = "provider_error"): void {
    this.#pendingFailure = reason;
  }

  /** Accepted messages, oldest first. Returns copies. */
  get sent(): SmsMessage[] {
    return this.#sent.map((m) => ({ to: m.to, body: m.body }));
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    if (isBlank(message.to)) return { ok: false, reason: "invalid_number" };
    if (isBlank(message.body)) return { ok: false, reason: "invalid_message" };
    if (this.#pendingFailure !== null) {
      const reason = this.#pendingFailure;
      this.#pendingFailure = null;
      return { ok: false, reason };
    }
    this.#sent.push({ to: message.to, body: message.body });
    this.#counter += 1;
    return { ok: true, providerMessageId: `fake-${this.#counter}` };
  }
}