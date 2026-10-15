import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_SECONDS,
  TokenConfigError,
  assertSecretAllowed,
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  isRefreshTokenShape,
  readTokenSecret,
  refreshTokenMatches,
  verifyAccessToken,
} from "../src/tokens.js";

const SECRET = "test-secret-".padEnd(40, "x");
const OTHER_SECRET = "other-secret-".padEnd(40, "y");
const NOW = new Date("2026-10-15T10:00:00.000Z");
const nowSec = Math.floor(NOW.getTime() / 1000);
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");

/** Builds a token with a correct signature around any payload text. */
function forgeRaw(secret: string, rawPayload: string): string {
  const body = `v1.${b64(rawPayload)}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
const forge = (secret: string, payload: unknown) => forgeRaw(secret, JSON.stringify(payload));

const good = { sub: "user-1", iat: nowSec, exp: nowSec + 900 };

describe("token secret", () => {
  it("accepts 32 ASCII characters", () => {
    expect(assertSecretAllowed("a".repeat(32))).toBe("a".repeat(32));
  });

  it("counts UTF-8 bytes, not characters", () => {
    expect(assertSecretAllowed("é".repeat(16))).toBe("é".repeat(16));
  });

  it("rejects 31 characters", () => {
    expect(() => assertSecretAllowed("a".repeat(31))).toThrow(TokenConfigError);
  });

  it("rejects 30 bytes written as 15 two-byte characters", () => {
    expect(() => assertSecretAllowed("é".repeat(15))).toThrow(TokenConfigError);
  });

  it.each([undefined, null, 123, {}, ["x".repeat(40)]])("rejects a non-string: %j", (value) => {
    expect(() => assertSecretAllowed(value)).toThrow(TokenConfigError);
  });

  it("does not put the secret in the error message", () => {
    const secret = "short-secret-abc";
    try {
      assertSecretAllowed(secret);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TokenConfigError);
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("reads the secret from the TOKEN_SECRET setting", () => {
    expect(readTokenSecret({ TOKEN_SECRET: SECRET })).toBe(SECRET);
  });

  it("throws when the TOKEN_SECRET setting is missing", () => {
    expect(() => readTokenSecret({})).toThrow(TokenConfigError);
  });

  it("throws when the TOKEN_SECRET setting is too short", () => {
    expect(() => readTokenSecret({ TOKEN_SECRET: "short" })).toThrow(TokenConfigError);
  });
});

describe("access tokens", () => {
  const token = createAccessToken(SECRET, "user-1", NOW);

  it("round-trips: user id, issue time and a 15-minute expiry", () => {
    expect(ACCESS_TOKEN_SECONDS).toBe(900);
    expect(verifyAccessToken(SECRET, token, NOW)).toEqual({
      ok: true,
      userId: "user-1",
      issuedAt: NOW,
      expiresAt: at(900),
    });
  });

  it("uses a custom lifetime", () => {
    const t = createAccessToken(SECRET, "user-1", NOW, 60);
    expect(verifyAccessToken(SECRET, t, at(59)).ok).toBe(true);
    expect(verifyAccessToken(SECRET, t, at(60)).ok).toBe(false);
  });

  it("accepts the one-day maximum lifetime", () => {
    const t = createAccessToken(SECRET, "user-1", NOW, 86_400);
    expect(verifyAccessToken(SECRET, t, NOW).ok).toBe(true);
  });

  it("is valid in the last second before expiry", () => {
    expect(verifyAccessToken(SECRET, token, at(899)).ok).toBe(true);
  });

  it("is expired at the expiry second", () => {
    expect(verifyAccessToken(SECRET, token, at(900))).toEqual({ ok: false });
  });

  it("is refused before its issue time", () => {
    expect(verifyAccessToken(SECRET, token, at(-1))).toEqual({ ok: false });
  });

  it("drops milliseconds when issuing", () => {
    const t = createAccessToken(SECRET, "user-1", new Date(NOW.getTime() + 999));
    const result = verifyAccessToken(SECRET, t, NOW);
    expect(result).toMatchObject({ ok: true, issuedAt: NOW });
  });

  it("gives different tokens for different users", () => {
    expect(createAccessToken(SECRET, "user-2", NOW)).not.toBe(token);
  });

  it("refuses a token signed with another secret", () => {
    expect(verifyAccessToken(OTHER_SECRET, token, NOW)).toEqual({ ok: false });
  });

  it("refuses a token whose payload was changed", () => {
    const [version, , signature] = token.split(".");
    const forged = `${version}.${b64(JSON.stringify({ ...good, sub: "user-2" }))}.${signature}`;
    expect(verifyAccessToken(SECRET, forged, NOW)).toEqual({ ok: false });
  });

  it("refuses a token whose signature was changed", () => {
    const last = token.slice(-1);
    const bad = token.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(verifyAccessToken(SECRET, bad, NOW)).toEqual({ ok: false });
  });

  it("refuses another version label even with a correct signature", () => {
    const body = `v2.${b64(JSON.stringify(good))}`;
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    expect(verifyAccessToken(SECRET, `${body}.${sig}`, NOW)).toEqual({ ok: false });
  });

  it("refuses a token with the wrong number of parts", () => {
    for (const bad of ["", "a.b", "a.b.c.d", `${token}.extra`, "v1.."]) {
      expect(verifyAccessToken(SECRET, bad, NOW)).toEqual({ ok: false });
    }
  });

  it("refuses an empty signature", () => {
    const unsigned = `${token.split(".").slice(0, 2).join(".")}.`;
    expect(verifyAccessToken(SECRET, unsigned, NOW)).toEqual({ ok: false });
  });

  it.each([undefined, null, 123, {}, ["x"]])("refuses a non-string token: %j", (value) => {
    expect(verifyAccessToken(SECRET, value, NOW)).toEqual({ ok: false });
  });

  it("refuses a token longer than 1024 characters", () => {
    expect(verifyAccessToken(SECRET, `v1.${"a".repeat(2000)}.sig`, NOW)).toEqual({ ok: false });
  });

  it("accepts a correctly signed good payload (checks the test helper)", () => {
    expect(verifyAccessToken(SECRET, forge(SECRET, good), NOW).ok).toBe(true);
  });

  const rawCases: Array<[string, string]> = [
    ["not JSON", "not json"],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", JSON.stringify("text")],
    ["missing sub", JSON.stringify({ iat: nowSec, exp: nowSec + 900 })],
    ["an empty sub", JSON.stringify({ ...good, sub: "" })],
    ["a numeric sub", JSON.stringify({ ...good, sub: 42 })],
    ["a text iat", JSON.stringify({ ...good, iat: "x" })],
    ["a fractional exp", JSON.stringify({ ...good, exp: nowSec + 900.5 })],
    ["exp equal to iat", JSON.stringify({ ...good, exp: nowSec })],
    ["exp before iat", JSON.stringify({ ...good, exp: nowSec - 10 })],
    ["missing exp", JSON.stringify({ sub: "user-1", iat: nowSec })],
    ["a huge exp", `{"sub":"user-1","iat":${nowSec},"exp":1e308}`],
    ["longer than one day", JSON.stringify({ ...good, exp: nowSec + 86_401 })],
    [
      "issued in the future",
      JSON.stringify({ sub: "user-1", iat: nowSec + 60, exp: nowSec + 960 }),
    ],
  ];
  it.each(rawCases)("refuses a correctly signed payload that is %s", (_label, raw) => {
    expect(verifyAccessToken(SECRET, forgeRaw(SECRET, raw), NOW)).toEqual({ ok: false });
  });

  it("gives exactly { ok: false } for a failure, with no reason", () => {
    const result = verifyAccessToken(SECRET, "garbage", NOW);
    expect(result).toEqual({ ok: false });
    expect(Object.keys(result)).toEqual(["ok"]);
  });

  it("throws on a bad secret when verifying (our mistake, not bad input)", () => {
    expect(() => verifyAccessToken("short", "garbage", NOW)).toThrow(TokenConfigError);
  });

  it("throws on an invalid time when verifying", () => {
    expect(() => verifyAccessToken(SECRET, token, new Date("nope"))).toThrow(TokenConfigError);
  });

  it("holds only sub, iat and exp in the payload (no role, no permissions)", () => {
    const payload = token.split(".")[1] ?? "";
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(data).sort()).toEqual(["exp", "iat", "sub"]);
  });

  it("refuses to create a token with an empty user id", () => {
    expect(() => createAccessToken(SECRET, "", NOW)).toThrow(TokenConfigError);
  });

  it("refuses to create a token with a non-string user id", () => {
    expect(() => createAccessToken(SECRET, 42, NOW)).toThrow(TokenConfigError);
  });

  it("refuses to create a token with a user id so long the token passes 1024 characters", () => {
    expect(() => createAccessToken(SECRET, "u".repeat(1000), NOW)).toThrow(TokenConfigError);
  });

  it.each([0, -5, 1.5, Number.NaN, 86_401])("refuses to create a token with lifetime %s", (n) => {
    expect(() => createAccessToken(SECRET, "user-1", NOW, n)).toThrow(TokenConfigError);
  });

  it("refuses to create a token with a short secret", () => {
    expect(() => createAccessToken("short", "user-1", NOW)).toThrow(TokenConfigError);
  });

  it("refuses to create a token with an invalid time", () => {
    expect(() => createAccessToken(SECRET, "user-1", new Date("nope"))).toThrow(TokenConfigError);
  });
});

describe("refresh tokens", () => {
  it("makes a 43-character URL-safe token and a 64-character hex hash", () => {
    const { token, hash } = createRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the hash of its own token", () => {
    const { token, hash } = createRefreshToken();
    expect(hash).toBe(hashRefreshToken(token));
  });

  it("makes a different token and hash each time", () => {
    const a = createRefreshToken();
    const b = createRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });

  it("hashes with SHA-256 (known test value for 'abc')", () => {
    expect(hashRefreshToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("matches the right token to its hash", () => {
    const { token, hash } = createRefreshToken();
    expect(refreshTokenMatches(token, hash)).toBe(true);
  });

  it("does not match another token", () => {
    const a = createRefreshToken();
    const b = createRefreshToken();
    expect(refreshTokenMatches(b.token, a.hash)).toBe(false);
  });

  it("does not match a hash of the wrong length", () => {
    const { token, hash } = createRefreshToken();
    expect(refreshTokenMatches(token, hash.slice(0, 63))).toBe(false);
    expect(refreshTokenMatches(token, `${hash}0`)).toBe(false);
  });

  it("gives false, not an error, for non-string input", () => {
    const { token, hash } = createRefreshToken();
    for (const bad of [undefined, null, 42, {}]) {
      expect(refreshTokenMatches(bad, hash)).toBe(false);
      expect(refreshTokenMatches(token, bad)).toBe(false);
    }
  });

  it("does not match a token of the wrong shape, even with its own hash", () => {
    expect(refreshTokenMatches("abc", hashRefreshToken("abc"))).toBe(false);
  });

  it("does not match an upper-case copy of the right hash", () => {
    const { token, hash } = createRefreshToken();
    expect(refreshTokenMatches(token, hash.toUpperCase())).toBe(false);
  });

  it("recognises the shape of a refresh token", () => {
    expect(isRefreshTokenShape(createRefreshToken().token)).toBe(true);
    expect(isRefreshTokenShape("a".repeat(42))).toBe(false);
    expect(isRefreshTokenShape("a".repeat(44))).toBe(false);
    expect(isRefreshTokenShape(`${"a".repeat(42)}+`)).toBe(false);
    expect(isRefreshTokenShape(42)).toBe(false);
  });
});