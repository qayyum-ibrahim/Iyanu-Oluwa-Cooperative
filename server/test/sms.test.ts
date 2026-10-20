import { describe, expect, it } from "vitest";
import { FakeSmsProvider, type SmsProvider } from "../src/sms.js";

const msg = { to: "08000000001", body: "Test message" };

describe("FakeSmsProvider", () => {
  it("accepts a message and gives ids fake-1, fake-2", async () => {
    const sms: SmsProvider = new FakeSmsProvider();
    expect(await sms.send(msg)).toEqual({ ok: true, providerMessageId: "fake-1" });
    expect(await sms.send(msg)).toEqual({ ok: true, providerMessageId: "fake-2" });
  });

  it("keeps accepted messages in order", async () => {
    const sms = new FakeSmsProvider();
    await sms.send({ to: "08000000001", body: "one" });
    await sms.send({ to: "08000000002", body: "two" });
    expect(sms.sent).toEqual([
      { to: "08000000001", body: "one" },
      { to: "08000000002", body: "two" },
    ]);
  });

  it("returns copies from sent", async () => {
    const sms = new FakeSmsProvider();
    await sms.send(msg);
    const first = sms.sent;
    first[0]!.body = "changed";
    first.pop();
    expect(sms.sent).toEqual([msg]);
  });

  it("is not changed by editing the message after sending", async () => {
    const sms = new FakeSmsProvider();
    const m = { to: "08000000001", body: "original" };
    await sms.send(m);
    m.body = "edited";
    expect(sms.sent[0]!.body).toBe("original");
  });

  it("refuses an empty number", async () => {
    const sms = new FakeSmsProvider();
    expect(await sms.send({ to: "", body: "x" })).toEqual({ ok: false, reason: "invalid_number" });
    expect(sms.sent).toEqual([]);
  });

  it("refuses a number of only spaces", async () => {
    const sms = new FakeSmsProvider();
    expect(await sms.send({ to: "   ", body: "x" })).toEqual({ ok: false, reason: "invalid_number" });
    expect(sms.sent).toEqual([]);
  });

  it("refuses a number that is not text", async () => {
    const sms = new FakeSmsProvider();
    const bad = { to: 8000000001 as unknown as string, body: "x" };
    expect(await sms.send(bad)).toEqual({ ok: false, reason: "invalid_number" });
    expect(sms.sent).toEqual([]);
  });

  it("refuses an empty body", async () => {
    const sms = new FakeSmsProvider();
    expect(await sms.send({ to: "08000000001", body: "" })).toEqual({
      ok: false,
      reason: "invalid_message",
    });
    expect(sms.sent).toEqual([]);
  });

  it("refuses a body of only spaces", async () => {
    const sms = new FakeSmsProvider();
    expect(await sms.send({ to: "08000000001", body: "  \n " })).toEqual({
      ok: false,
      reason: "invalid_message",
    });
  });

  it("refuses a body that is not text", async () => {
    const sms = new FakeSmsProvider();
    const bad = { to: "08000000001", body: null as unknown as string };
    expect(await sms.send(bad)).toEqual({ ok: false, reason: "invalid_message" });
    expect(sms.sent).toEqual([]);
  });

  it("checks the number before the body", async () => {
    const sms = new FakeSmsProvider();
    expect(await sms.send({ to: "", body: "" })).toEqual({ ok: false, reason: "invalid_number" });
  });

  it("failNext makes the next valid send fail with provider_error and saves nothing", async () => {
    const sms = new FakeSmsProvider();
    sms.failNext();
    expect(await sms.send(msg)).toEqual({ ok: false, reason: "provider_error" });
    expect(sms.sent).toEqual([]);
  });

  it("failNext accepts another reason", async () => {
    const sms = new FakeSmsProvider();
    sms.failNext("invalid_number");
    expect(await sms.send(msg)).toEqual({ ok: false, reason: "invalid_number" });
  });

  it("failNext affects one send only", async () => {
    const sms = new FakeSmsProvider();
    sms.failNext();
    await sms.send(msg);
    expect(await sms.send(msg)).toEqual({ ok: true, providerMessageId: "fake-1" });
    expect(sms.sent).toEqual([msg]);
  });

  it("does not use up an id on a failed send", async () => {
    const sms = new FakeSmsProvider();
    await sms.send(msg);
    sms.failNext();
    await sms.send(msg);
    expect(await sms.send(msg)).toEqual({ ok: true, providerMessageId: "fake-2" });
  });

  it("keeps a pending failure when a send is refused as invalid", async () => {
    const sms = new FakeSmsProvider();
    sms.failNext();
    await sms.send({ to: "", body: "x" });
    expect(await sms.send(msg)).toEqual({ ok: false, reason: "provider_error" });
  });
});