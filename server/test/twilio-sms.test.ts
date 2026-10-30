import { describe, expect, it } from "vitest";
import {
  FakeSmsProvider,
  SmsConfigError,
  TWILIO_MAX_BODY,
  TwilioSmsProvider,
  readSmsProvider,
  toE164,
  type FetchFn,
  type TwilioConfig,
} from "../src/sms.js";

// The Twilio adapter (step E.6, D-121). Every test uses a stand-in fetch: no network.
// Fake settings and numbers only (D-08). +15005550006 is Twilio's magic test sender (A-295 item 5).

const CONFIG: TwilioConfig = {
  accountSid: "ACtest0000",
  apiKeySid: "SKtest0000",
  apiKeySecret: "fake-secret-for-tests",
  from: "+15005550006",
};

interface Call {
  url: string;
  init: RequestInit;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A stand-in fetch that records each call and answers with the given reply. */
function standIn(reply: () => Response | Promise<Response>): { fetchFn: FetchFn; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return reply();
  }) as FetchFn;
  return { fetchFn, calls };
}

const created = (): Response => json(201, { sid: "SMtest0001", status: "queued" });
const msg = { to: "08000000001", body: "Test message" };

describe("toE164", () => {
  it("turns a local Nigerian number into +234", () => {
    expect(toE164("08000000001")).toBe("+2348000000001");
  });

  it("turns 234 plus 10 digits into +234", () => {
    expect(toE164("2348000000001")).toBe("+2348000000001");
  });

  it("keeps a number that starts with +", () => {
    expect(toE164("+2348000000001")).toBe("+2348000000001");
    expect(toE164("+15005550001")).toBe("+15005550001");
  });

  it("drops spaces, hyphens, dots and brackets", () => {
    expect(toE164(" 0800 000-0001 ")).toBe("+2348000000001");
    expect(toE164("(0800).000.0001")).toBe("+2348000000001");
    expect(toE164("+234 800 000 0001")).toBe("+2348000000001");
  });

  it.each([
    "",
    "   ",
    "0800000000",
    "080000000011",
    "8000000001",
    "23480000000",
    "+",
    "+0800000001",
    "++2348000000001",
    "0800000000a",
    "080/0000/0001",
  ])("refuses %j", (phone) => {
    expect(toE164(phone)).toBeNull();
  });
});

describe("TwilioSmsProvider request", () => {
  it("sends one form-encoded POST to the Messages resource", async () => {
    const { fetchFn, calls } = standIn(created);
    await new TwilioSmsProvider(CONFIG, fetchFn).send(msg);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACtest0000/Messages.json");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(String(init.body));
    expect([...form.keys()]).toEqual(["To", "From", "Body"]);
    expect(form.get("To")).toBe("+2348000000001");
    expect(form.get("From")).toBe("+15005550006");
    expect(form.get("Body")).toBe("Test message");
  });

  it("logs in with Basic auth: API key SID and secret", async () => {
    const { fetchFn, calls } = standIn(created);
    await new TwilioSmsProvider(CONFIG, fetchFn).send(msg);
    const headers = calls[0]!.init.headers as Record<string, string>;
    const expected = Buffer.from("SKtest0000:fake-secret-for-tests", "utf8").toString("base64");
    expect(headers["Authorization"]).toBe(`Basic ${expected}`);
  });

  it("sends a timeout signal", async () => {
    const { fetchFn, calls } = standIn(created);
    await new TwilioSmsProvider(CONFIG, fetchFn).send(msg);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("encodes the account SID in the address", async () => {
    const { fetchFn, calls } = standIn(created);
    await new TwilioSmsProvider({ ...CONFIG, accountSid: "AC/../x?y" }, fetchFn).send(msg);
    expect(calls[0]!.url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/AC%2F..%2Fx%3Fy/Messages.json",
    );
  });

  it("encodes & and = in the body", async () => {
    const { fetchFn, calls } = standIn(created);
    await new TwilioSmsProvider(CONFIG, fetchFn).send({ to: msg.to, body: "a&To=+1 b" });
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(form.get("Body")).toBe("a&To=+1 b");
    expect(form.getAll("To")).toEqual(["+2348000000001"]);
  });

  it("is not changed by editing the config after it is made", async () => {
    const config = { ...CONFIG };
    const { fetchFn, calls } = standIn(created);
    const sms = new TwilioSmsProvider(config, fetchFn);
    config.from = "+10000000000";
    await sms.send(msg);
    expect(new URLSearchParams(String(calls[0]!.init.body)).get("From")).toBe("+15005550006");
  });
});

describe("TwilioSmsProvider checks before sending", () => {
  it.each(["", "   ", "12345", "not a number"])("refuses the number %j and calls nothing", async (to) => {
    const { fetchFn, calls } = standIn(created);
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send({ to, body: "x" })).toEqual({
      ok: false,
      reason: "invalid_number",
    });
    expect(calls).toHaveLength(0);
  });

  it("checks the number before the body", async () => {
    const { fetchFn } = standIn(created);
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send({ to: "", body: "" })).toEqual({
      ok: false,
      reason: "invalid_number",
    });
  });

  it.each(["", "   ", "x".repeat(TWILIO_MAX_BODY + 1)])(
    "refuses a body of length %#",
    async (body) => {
      const { fetchFn, calls } = standIn(created);
      expect(await new TwilioSmsProvider(CONFIG, fetchFn).send({ to: msg.to, body })).toEqual({
        ok: false,
        reason: "invalid_message",
      });
      expect(calls).toHaveLength(0);
    },
  );

  it("sends a body of exactly 1600 characters", async () => {
    const { fetchFn, calls } = standIn(created);
    const body = "x".repeat(TWILIO_MAX_BODY);
    expect((await new TwilioSmsProvider(CONFIG, fetchFn).send({ to: msg.to, body })).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("TwilioSmsProvider answers", () => {
  it("gives the message sid on 201", async () => {
    const { fetchFn } = standIn(created);
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: true,
      providerMessageId: "SMtest0001",
    });
  });

  it.each([21211, 21614])("maps error code %i to invalid_number", async (code) => {
    const { fetchFn } = standIn(() => json(400, { status: 400, message: "bad", code }));
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "invalid_number",
    });
  });

  it.each([
    ["21608 (trial, unverified number)", () => json(400, { status: 400, code: 21608 })],
    ["401", () => json(401, { status: 401, message: "Authenticate", code: 20003 })],
    ["429", () => json(429, { status: 429, message: "Too Many Requests" })],
    ["500 without JSON", () => new Response("oops", { status: 500 })],
    ["503 with empty body", () => new Response(null, { status: 503 })],
    ["201 without sid", () => json(201, { status: "queued" })],
    ["201 with empty sid", () => json(201, { sid: "" })],
    ["201 not JSON", () => new Response("<xml/>", { status: 201 })],
    ["200 with sid", () => json(200, { sid: "SMtest0001" })],
    ["code as text", () => json(400, { code: "21211" })],
    ["JSON null", () => json(400, null)],
  ])("gives provider_error for %s", async (_label, reply) => {
    const { fetchFn } = standIn(reply);
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });

  it("gives provider_error when fetch throws (network error or timeout)", async () => {
    const { fetchFn } = standIn(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });

  it("gives provider_error when fetch rejects", async () => {
    const { fetchFn } = standIn(() => Promise.reject(new TypeError("fetch failed")));
    expect(await new TwilioSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });
});

describe("readSmsProvider", () => {
  const TWILIO_ENV = {
    SMS_PROVIDER: "twilio",
    TWILIO_ACCOUNT_SID: "ACtest0000",
    TWILIO_API_KEY_SID: "SKtest0000",
    TWILIO_API_KEY_SECRET: "fake-secret-for-tests",
    TWILIO_FROM: "+15005550006",
  };

  it.each([{}, { SMS_PROVIDER: "" }, { SMS_PROVIDER: "  " }, { SMS_PROVIDER: "fake" }])(
    "gives the fake for %j",
    (env) => {
      expect(readSmsProvider(env)).toBeInstanceOf(FakeSmsProvider);
    },
  );

  it("gives the fake even when Twilio settings are set but SMS_PROVIDER is not", () => {
    expect(readSmsProvider({ ...TWILIO_ENV, SMS_PROVIDER: undefined })).toBeInstanceOf(
      FakeSmsProvider,
    );
  });

  it("gives Twilio when all settings are set, and uses them", async () => {
    const { fetchFn, calls } = standIn(created);
    const sms = readSmsProvider({ ...TWILIO_ENV, TWILIO_FROM: " +15005550006 " }, fetchFn);
    expect(sms).toBeInstanceOf(TwilioSmsProvider);
    expect(await sms.send(msg)).toEqual({ ok: true, providerMessageId: "SMtest0001" });
    expect(calls[0]!.url).toContain("/Accounts/ACtest0000/");
    expect(new URLSearchParams(String(calls[0]!.init.body)).get("From")).toBe("+15005550006");
  });

  it.each(["Twilio", "TWILIO", "sms", "true"])("refuses SMS_PROVIDER=%j", (name) => {
    expect(() => readSmsProvider({ ...TWILIO_ENV, SMS_PROVIDER: name })).toThrow(SmsConfigError);
  });

  it.each([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_API_KEY_SID",
    "TWILIO_API_KEY_SECRET",
    "TWILIO_FROM",
  ] as const)("refuses twilio without %s and names it", (key) => {
    for (const value of [undefined, "", "   "]) {
      const env = { ...TWILIO_ENV, [key]: value };
      expect(() => readSmsProvider(env)).toThrow(`SMS_PROVIDER is twilio but ${key} is not set.`);
    }
  });

  it("names every missing setting and never a value", () => {
    let message = "";
    try {
      readSmsProvider({ SMS_PROVIDER: "twilio", TWILIO_API_KEY_SECRET: "fake-secret-for-tests" });
    } catch (error) {
      expect(error).toBeInstanceOf(SmsConfigError);
      message = (error as Error).message;
    }
    expect(message).toBe(
      "SMS_PROVIDER is twilio but TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_FROM are not set.",
    );
    expect(message).not.toContain("fake-secret");
  });
});
