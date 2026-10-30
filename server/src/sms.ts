// SMS provider interface, a fake provider (step 4.6, D-07) and the Twilio adapter (step E.6, D-121).
// No store. The Twilio adapter is the only network code: one HTTPS POST through the fetch it is
// given. Secrets come from the settings and are never logged or put in an error message.
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

/**
 * Turns a phone number as typed (A-82) into E.164, or gives null. Spaces, hyphens, dots and
 * brackets are dropped. A number starting with "+" is kept as given; Twilio judges it (21211).
 * A Nigerian number "0" plus 10 digits or "234" plus 10 digits becomes "+234" plus the 10 digits
 * (NCC: country code 234, trunk prefix 0, 10-digit mobile numbers; A-296).
 */
export function toE164(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-.()]/g, "");
  if (/^\+[1-9]\d+$/.test(cleaned)) return cleaned;
  if (/^0\d{10}$/.test(cleaned)) return `+234${cleaned.slice(1)}`;
  if (/^234\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}

export interface TwilioConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  /** A Twilio number in E.164 or an alphanumeric sender ID (D-121). */
  from: string;
}

export type FetchFn = typeof fetch;

const TWILIO_API = "https://api.twilio.com/2010-04-01";
/** Twilio: "Body" "Can be up to 1,600 characters in length" (A-295 item 1). */
export const TWILIO_MAX_BODY = 1600;
/** Claude's choice (A-296): a payment request waits at most this long for Twilio. */
export const TWILIO_TIMEOUT_MS = 10_000;
/** 21211 invalid 'To' number, 21614 not a mobile number (A-295 item 4). */
const BAD_NUMBER_CODES = new Set([21211, 21614]);

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function field(data: unknown, name: string): unknown {
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>)[name] : undefined;
}

/**
 * Sends one SMS per call: a form-encoded POST to the Messages resource with Basic auth by API key
 * (D-121). 201 with a "sid" is a success. Error codes 21211 and 21614 are a bad number; every
 * other answer, a network error or the timeout is a provider error. It does not retry.
 */
export class TwilioSmsProvider implements SmsProvider {
  readonly #config: TwilioConfig;
  readonly #fetch: FetchFn;

  constructor(config: TwilioConfig, fetchFn: FetchFn = fetch) {
    this.#config = { ...config };
    this.#fetch = fetchFn;
  }

  async send(message: SmsMessage): Promise<SmsResult> {
    const to = typeof message.to === "string" ? toE164(message.to) : null;
    if (to === null) return { ok: false, reason: "invalid_number" };
    if (isBlank(message.body) || message.body.length > TWILIO_MAX_BODY) {
      return { ok: false, reason: "invalid_message" };
    }

    const { accountSid, apiKeySid, apiKeySecret, from } = this.#config;
    const url = `${TWILIO_API}/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const login = Buffer.from(`${apiKeySid}:${apiKeySecret}`, "utf8").toString("base64");
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${login}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: message.body }).toString(),
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: "provider_error" };
    }

    const data = await readJson(response);
    const sid = field(data, "sid");
    if (response.status === 201 && typeof sid === "string" && sid.length > 0) {
      return { ok: true, providerMessageId: sid };
    }
    const code = field(data, "code");
    if (typeof code === "number" && BAD_NUMBER_CODES.has(code)) {
      return { ok: false, reason: "invalid_number" };
    }
    return { ok: false, reason: "provider_error" };
  }
}

export class SmsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsConfigError";
  }
}

const TWILIO_SETTINGS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_FROM",
] as const;

/**
 * Chooses the provider from SMS_PROVIDER (D-121): missing, empty or "fake" gives the fake;
 * "twilio" needs all four Twilio settings. Throws SmsConfigError otherwise. The message names
 * settings only, never a value.
 */
export function readSmsProvider(
  env: Readonly<Record<string, string | undefined>>,
  fetchFn: FetchFn = fetch,
): SmsProvider {
  const name = (env["SMS_PROVIDER"] ?? "").trim();
  if (name === "" || name === "fake") return new FakeSmsProvider();
  if (name !== "twilio") throw new SmsConfigError("SMS_PROVIDER must be fake or twilio.");

  const missing = TWILIO_SETTINGS.filter((key) => isBlank(env[key]));
  if (missing.length > 0) {
    const verb = missing.length === 1 ? "is" : "are";
    throw new SmsConfigError(`SMS_PROVIDER is twilio but ${missing.join(", ")} ${verb} not set.`);
  }
  const value = (key: (typeof TWILIO_SETTINGS)[number]): string => (env[key] ?? "").trim();
  return new TwilioSmsProvider(
    {
      accountSid: value("TWILIO_ACCOUNT_SID"),
      apiKeySid: value("TWILIO_API_KEY_SID"),
      apiKeySecret: value("TWILIO_API_KEY_SECRET"),
      from: value("TWILIO_FROM"),
    },
    fetchFn,
  );
}
