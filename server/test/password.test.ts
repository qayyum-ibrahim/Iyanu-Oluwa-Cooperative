import { hash as rawHash, verify } from "argon2";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PasswordPolicyError,
  hashPassword,
  verifyPassword,
} from "../src/password.js";

// argon2 is slow on purpose, and the owner's computer may be slower than mine.
const SLOW = 30_000;
const GOOD = "correct horse battery";

describe("hashPassword", () => {
  it("returns an argon2id PHC string that does not contain the password", async () => {
    const h = await hashPassword(GOOD);
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h.includes(GOOD)).toBe(false);
  }, SLOW);

  it("gives a different hash each time (random salt)", async () => {
    const a = await hashPassword(GOOD);
    const b = await hashPassword(GOOD);
    expect(a).not.toBe(b);
  }, SLOW);

  it("rejects a password shorter than the minimum", async () => {
    await expect(hashPassword("a".repeat(PASSWORD_MIN_LENGTH - 1))).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it("accepts a password of exactly the minimum length", async () => {
    await expect(hashPassword("a".repeat(PASSWORD_MIN_LENGTH))).resolves.toMatch(/^\$argon2id\$/);
  }, SLOW);

  it("rejects a password longer than the maximum", async () => {
    await expect(hashPassword("a".repeat(PASSWORD_MAX_LENGTH + 1))).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it("accepts a password of exactly the maximum length", async () => {
    await expect(hashPassword("a".repeat(PASSWORD_MAX_LENGTH))).resolves.toMatch(/^\$argon2id\$/);
  }, SLOW);

  it("rejects input that is not text", async () => {
    await expect(hashPassword(12345678901234 as unknown as string)).rejects.toBeInstanceOf(PasswordPolicyError);
    await expect(hashPassword(undefined as unknown as string)).rejects.toBeInstanceOf(PasswordPolicyError);
  });
});

describe("verifyPassword", () => {
  it("is true for the right password and false for a wrong one", async () => {
    const h = await hashPassword(GOOD);
    expect(await verifyPassword(h, GOOD)).toBe(true);
    expect(await verifyPassword(h, GOOD + "x")).toBe(false);
    expect(await verifyPassword(h, "")).toBe(false);
  }, SLOW);

  it("is case sensitive", async () => {
    const h = await hashPassword(GOOD);
    expect(await verifyPassword(h, GOOD.toUpperCase())).toBe(false);
  }, SLOW);

  it("does not trim spaces", async () => {
    const spaced = `  ${GOOD}  `;
    const h = await hashPassword(spaced);
    expect(await verifyPassword(h, spaced)).toBe(true);
    expect(await verifyPassword(h, GOOD)).toBe(false);
  }, SLOW);

  it("works with non-ASCII characters", async () => {
    const pw = "pässwörd-ọmọ-Ibadan-2026";
    const h = await hashPassword(pw);
    expect(await verifyPassword(h, pw)).toBe(true);
  }, SLOW);

  it("returns false, without throwing, for a malformed or empty hash", async () => {
    expect(await verifyPassword("not a hash", GOOD)).toBe(false);
    expect(await verifyPassword("", GOOD)).toBe(false);
    expect(await verifyPassword("$argon2id$v=19$m=1,t=1,p=1$bad$bad", GOOD)).toBe(false);
  });

  it("returns false for a password over the maximum length, even if it would match", async () => {
    // Made with raw argon2 on purpose: hashPassword refuses this length, so only the guard can make this false.
    const tooLong = "a".repeat(PASSWORD_MAX_LENGTH + 1);
    const h = await rawHash(tooLong);
    expect(await verify(h, tooLong)).toBe(true);
    expect(await verifyPassword(h, tooLong)).toBe(false);
  }, SLOW);

  it("returns false for input that is not text", async () => {
    expect(await verifyPassword(undefined as unknown as string, GOOD)).toBe(false);
    expect(await verifyPassword("$argon2id$x", null as unknown as string)).toBe(false);
  });
});