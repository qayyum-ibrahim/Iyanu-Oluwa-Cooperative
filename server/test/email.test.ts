import { describe, expect, it } from "vitest";
import { EMAIL_MAX_LENGTH, InvalidEmailError, normalizeEmail } from "../src/email.js";

describe("normalizeEmail", () => {
  it("lower-cases", () => {
    expect(normalizeEmail("Owner@Example.COM")).toBe("owner@example.com");
  });

  it("trims outer spaces", () => {
    expect(normalizeEmail("  owner@example.com \n")).toBe("owner@example.com");
  });

  it("keeps plus tags and subdomains", () => {
    expect(normalizeEmail("a.b+tag@mail.example.co.ng")).toBe("a.b+tag@mail.example.co.ng");
  });

  it.each([
    "",
    "   ",
    "owner",
    "owner@",
    "@example.com",
    "owner@example",
    "owner@@example.com",
    "own er@example.com",
    "owner@exa mple.com",
    "owner@.example.com",
    "owner@example..com",
    "owner@example.com.",
  ])("rejects %j", (bad) => {
    expect(() => normalizeEmail(bad)).toThrow(InvalidEmailError);
  });

  it("rejects input that is not text", () => {
    expect(() => normalizeEmail(undefined)).toThrow(InvalidEmailError);
    expect(() => normalizeEmail(42)).toThrow(InvalidEmailError);
  });

  it("accepts the maximum length and rejects one more", () => {
    const tail = "@example.com";
    const ok = "a".repeat(EMAIL_MAX_LENGTH - tail.length) + tail;
    expect(normalizeEmail(ok)).toBe(ok);
    expect(() => normalizeEmail("a" + ok)).toThrow(InvalidEmailError);
  });
});