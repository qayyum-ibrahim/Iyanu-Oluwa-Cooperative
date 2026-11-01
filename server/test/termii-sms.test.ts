import { describe, expect, it } from "vitest";
import {
  FakeSmsProvider,
  SmsConfigError,
  TERMII_CHANNEL,
  TermiiSmsProvider,
  TwilioSmsProvider,
  readSmsProvider,
  type FetchFn,
  type TermiiConfig,
} from "../src/sms.js";

// The Termii adapter (step E.10). Every test uses a stand-in fetch: no network.
// Fake settings and numbers only (D-08). The reply shape follows the Termii docs sample.

const CONFIG: TermiiConfig = {
  baseUrl: "https://termii.example.test",
  apiKey: "fake-key-for-tests",
  senderId: "TestSender",
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

const sent = (): Response =>
  json(200, { code: "ok", message_id: "9000000000000000001", message: "Successfully Sent", balance: 10 });
const msg = { to: "08000000001", body: "Test message" };

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

describe("TermiiSmsProvider request", () => {
  it("sends one JSON POST to {baseUrl}/api/sms/send", async () => {
    const { fetchFn, calls } = standIn(sent);
    await new TermiiSmsProvider(CONFIG, fetchFn).send(msg);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://termii.example.test/api/sms/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("puts the number without +, the sender, the text, plain, dnd and the API key in the body", async () => {
    const { fetchFn, calls } = standIn(sent);
    await new TermiiSmsProvider(CONFIG, fetchFn).send(msg);
    expect(bodyOf(calls[0]!)).toEqual({
      to: "2348000000001",
      from: "TestSender",
      sms: "Test message",
      type: "plain",
      channel: "dnd",
      api_key: "fake-key-for-tests",
    });
    expect(TERMII_CHANNEL).toBe("dnd");
  });

  it("does not put the API key in the address or the headers", async () => {
    const { fetchFn, calls } = standIn(sent);
    await new TermiiSmsProvider(CONFIG, fetchFn).send(msg);
    expect(calls[0]!.url).not.toContain("fake-key");
    expect(JSON.stringify(calls[0]!.init.headers)).not.toContain("fake-key");
  });

  it("drops trailing slashes from the base URL", async () => {
    const { fetchFn, calls } = standIn(sent);
    await new TermiiSmsProvider({ ...CONFIG, baseUrl: "https://termii.example.test//" }, fetchFn).send(msg);
    expect(calls[0]!.url).toBe("https://termii.example.test/api/sms/send");
  });

  it("keeps quotes and symbols in the text as given", async () => {
    const { fetchFn, calls } = standIn(sent);
    const body = 'NGN 1,500.00 "paid" & {ok}';
    await new TermiiSmsProvider(CONFIG, fetchFn).send({ to: msg.to, body });
    expect(bodyOf(calls[0]!)["sms"]).toBe(body);
  });

  it("sends a timeout signal", async () => {
    const { fetchFn, calls } = standIn(sent);
    await new TermiiSmsProvider(CONFIG, fetchFn).send(msg);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("is not changed by editing the config after it is made", async () => {
    const config = { ...CONFIG };
    const { fetchFn, calls } = standIn(sent);
    const sms = new TermiiSmsProvider(config, fetchFn);
    config.senderId = "Other";
    await sms.send(msg);
    expect(bodyOf(calls[0]!)["from"]).toBe("TestSender");
  });
});

describe("TermiiSmsProvider checks before sending", () => {
  it.each(["", "   ", "12345", "not a number"])("refuses the number %j and calls nothing", async (to) => {
    const { fetchFn, calls } = standIn(sent);
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send({ to, body: "x" })).toEqual({
      ok: false,
      reason: "invalid_number",
    });
    expect(calls).toHaveLength(0);
  });

  it("checks the number before the body", async () => {
    const { fetchFn } = standIn(sent);
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send({ to: "", body: "" })).toEqual({
      ok: false,
      reason: "invalid_number",
    });
  });

  it.each(["", "   "])("refuses the body %j and calls nothing", async (body) => {
    const { fetchFn, calls } = standIn(sent);
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send({ to: msg.to, body })).toEqual({
      ok: false,
      reason: "invalid_message",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("TermiiSmsProvider answers", () => {
  it("gives the message_id on 200 with code ok", async () => {
    const { fetchFn } = standIn(sent);
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: true,
      providerMessageId: "9000000000000000001",
    });
  });

  it.each([
    ["400", () => json(400, { message: "Invalid Sender Id" })],
    ["401", () => json(401, { message: "No valid API key provided" })],
    ["422", () => json(422, { message: "Insufficient balance" })],
    ["429", () => json(429, { message: "Too Many Requests" })],
    ["500 without JSON", () => new Response("oops", { status: 500 })],
    ["503 with empty body", () => new Response(null, { status: 503 })],
    ["200 with another code", () => json(200, { code: "error", message_id: "1" })],
    ["200 without code", () => json(200, { message_id: "1" })],
    ["200 without message_id", () => json(200, { code: "ok" })],
    ["200 with empty message_id", () => json(200, { code: "ok", message_id: "" })],
    ["200 with a numeric message_id", () => json(200, { code: "ok", message_id: 1 })],
    ["201 with code ok", () => json(201, { code: "ok", message_id: "1" })],
    ["200 not JSON", () => new Response("<html/>", { status: 200 })],
    ["JSON null", () => json(200, null)],
  ])("gives provider_error for %s", async (_label, reply) => {
    const { fetchFn } = standIn(reply);
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });

  it("gives provider_error when fetch throws (network error or timeout)", async () => {
    const { fetchFn } = standIn(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });

  it("gives provider_error when fetch rejects", async () => {
    const { fetchFn } = standIn(() => Promise.reject(new TypeError("fetch failed")));
    expect(await new TermiiSmsProvider(CONFIG, fetchFn).send(msg)).toEqual({
      ok: false,
      reason: "provider_error",
    });
  });
});

describe("readSmsProvider with termii", () => {
  const TERMII_ENV = {
    SMS_PROVIDER: "termii",
    TERMII_BASE_URL: "https://termii.example.test",
    TERMII_API_KEY: "fake-key-for-tests",
    TERMII_SENDER_ID: "TestSender",
  };

  it("gives Termii when all settings are set, and uses them trimmed", async () => {
    const { fetchFn, calls } = standIn(sent);
    const sms = readSmsProvider(
      { ...TERMII_ENV, TERMII_BASE_URL: " https://termii.example.test/ ", TERMII_SENDER_ID: " TestSender " },
      fetchFn,
    );
    expect(sms).toBeInstanceOf(TermiiSmsProvider);
    expect((await sms.send(msg)).ok).toBe(true);
    expect(calls[0]!.url).toBe("https://termii.example.test/api/sms/send");
    expect(bodyOf(calls[0]!)["from"]).toBe("TestSender");
  });

  it("gives the fake when Termii settings are set but SMS_PROVIDER is not", () => {
    expect(readSmsProvider({ ...TERMII_ENV, SMS_PROVIDER: undefined })).toBeInstanceOf(FakeSmsProvider);
  });

  it("does not need Twilio settings, and twilio does not take Termii settings", () => {
    expect(readSmsProvider(TERMII_ENV)).not.toBeInstanceOf(TwilioSmsProvider);
    expect(() => readSmsProvider({ ...TERMII_ENV, SMS_PROVIDER: "twilio" })).toThrow(
      "SMS_PROVIDER is twilio but TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_FROM are not set.",
    );
  });

  it.each(["Termii", "TERMII", "termi"])("refuses SMS_PROVIDER=%j", (name) => {
    expect(() => readSmsProvider({ ...TERMII_ENV, SMS_PROVIDER: name })).toThrow(
      "SMS_PROVIDER must be fake, twilio or termii.",
    );
  });

  it.each(["TERMII_BASE_URL", "TERMII_API_KEY", "TERMII_SENDER_ID"] as const)(
    "refuses termii without %s and names it",
    (key) => {
      for (const value of [undefined, "", "   "]) {
        const env = { ...TERMII_ENV, [key]: value };
        expect(() => readSmsProvider(env)).toThrow(`SMS_PROVIDER is termii but ${key} is not set.`);
      }
    },
  );

  it("names every missing setting and never a value", () => {
    let message = "";
    try {
      readSmsProvider({ SMS_PROVIDER: "termii", TERMII_API_KEY: "fake-key-for-tests" });
    } catch (error) {
      expect(error).toBeInstanceOf(SmsConfigError);
      message = (error as Error).message;
    }
    expect(message).toBe("SMS_PROVIDER is termii but TERMII_BASE_URL, TERMII_SENDER_ID are not set.");
    expect(message).not.toContain("fake-key");
  });

  it.each(["http://termii.example.test", "termii.example.test", "ftp://termii.example.test", "not a url"])(
    "refuses the base URL %j: the API key must go over https",
    (url) => {
      let message = "";
      try {
        readSmsProvider({ ...TERMII_ENV, TERMII_BASE_URL: url });
      } catch (error) {
        expect(error).toBeInstanceOf(SmsConfigError);
        message = (error as Error).message;
      }
      expect(message).toBe("TERMII_BASE_URL must be an https address.");
      expect(message).not.toContain("termii.example");
    },
  );
});
