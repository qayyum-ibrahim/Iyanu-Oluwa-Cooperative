// Access tokens and refresh-token primitives (D-06, D-27). Pure logic: node:crypto only.
// No routes and no storage here. Never log a token, a secret or a refresh token.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Default life of an access token: 15 minutes (A-31). */
export const ACCESS_TOKEN_SECONDS = 900;
/** Longest life createAccessToken accepts: one day (A-31). */
export const MAX_ACCESS_TOKEN_SECONDS = 86_400;
/** The signing secret must be at least this many UTF-8 bytes (A-32). */
export const MIN_SECRET_BYTES = 32;
/** The name of the setting that holds the signing secret. Its value never goes in git. */
export const TOKEN_SECRET_SETTING = "TOKEN_SECRET";

const VERSION = "v1";
const MAX_TOKEN_LENGTH = 1024;
const B64URL = /^[A-Za-z0-9_-]+$/;
const REFRESH_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const HASH_SHAPE = /^[0-9a-f]{64}$/;

/** A setup or programming mistake (bad secret, bad argument). Messages never hold the secret. */
export class TokenConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenConfigError";
  }
}

/** Returns the secret if it is a string of at least 32 bytes. Throws TokenConfigError if not. */
export function assertSecretAllowed(secret: unknown): string {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new TokenConfigError(
      `The token secret is missing or shorter than ${MIN_SECRET_BYTES} bytes.`,
    );
  }
  return secret;
}

/** Reads the signing secret from a settings object such as process.env. */
export function readTokenSecret(env: Readonly<Record<string, string | undefined>>): string {
  return assertSecretAllowed(env[TOKEN_SECRET_SETTING]);
}

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

function toSeconds(now: Date): number {
  const ms = now.getTime();
  if (!Number.isFinite(ms)) throw new TokenConfigError("The time is not a valid date.");
  return Math.floor(ms / 1000);
}

/**
 * Makes an access token: "v1.<payload>.<signature>". The payload holds only the user id
 * (sub), the issue time (iat) and the expiry (exp), in whole seconds. No role, no
 * permissions: those are checked from the store on every request (A-27).
 * Throws TokenConfigError for a bad secret, user id, time or lifetime.
 */
export function createAccessToken(
  secret: string,
  userId: unknown,
  now: Date,
  lifetimeSeconds: number = ACCESS_TOKEN_SECONDS,
): string {
  const key = assertSecretAllowed(secret);
  if (typeof userId !== "string" || userId.length === 0) {
    throw new TokenConfigError("A token needs a user id.");
  }
  if (
    !Number.isSafeInteger(lifetimeSeconds) ||
    lifetimeSeconds <= 0 ||
    lifetimeSeconds > MAX_ACCESS_TOKEN_SECONDS
  ) {
    throw new TokenConfigError("The token lifetime is not allowed.");
  }
  const iat = toSeconds(now);
  const payload = JSON.stringify({ sub: userId, iat, exp: iat + lifetimeSeconds });
  const body = `${VERSION}.${Buffer.from(payload, "utf8").toString("base64url")}`;
  const token = `${body}.${sign(key, body)}`;
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new TokenConfigError("The user id is too long for a token.");
  }
  return token;
}

/** A bad token gives no reason. Every kind of failure looks the same. */
export type AccessTokenResult =
  | { ok: true; userId: string; issuedAt: Date; expiresAt: Date }
  | { ok: false };

const FAILED: AccessTokenResult = { ok: false };

/**
 * Checks an access token. The signature is checked before the payload is read.
 * Never throws for a bad token. Throws TokenConfigError for a bad secret or an invalid `now`
 * (those are mistakes in our own code, not bad input).
 * A token is valid from its issue second up to, not including, its expiry second.
 */
export function verifyAccessToken(secret: string, token: unknown, now: Date): AccessTokenResult {
  const key = assertSecretAllowed(secret);
  const nowSeconds = toSeconds(now);

  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return FAILED;
  const parts = token.split(".");
  if (parts.length !== 3) return FAILED;
  const [version, payload, signature] = parts;
  if (version !== VERSION || payload === undefined || signature === undefined) return FAILED;
  if (!B64URL.test(payload) || !B64URL.test(signature)) return FAILED;
  if (!safeEqual(sign(key, `${version}.${payload}`), signature)) return FAILED;

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return FAILED;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return FAILED;
  const record = data as Record<string, unknown>;
  const sub = record["sub"];
  const iat = record["iat"];
  const exp = record["exp"];
  if (typeof sub !== "string" || sub.length === 0) return FAILED;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat)) return FAILED;
  if (typeof exp !== "number" || !Number.isSafeInteger(exp)) return FAILED;
  if (exp <= iat || exp - iat > MAX_ACCESS_TOKEN_SECONDS) return FAILED;
  if (iat > nowSeconds || nowSeconds >= exp) return FAILED;

  return { ok: true, userId: sub, issuedAt: new Date(iat * 1000), expiresAt: new Date(exp * 1000) };
}

/** True if the value looks like a refresh token we made: 43 URL-safe characters. */
export function isRefreshTokenShape(value: unknown): value is string {
  return typeof value === "string" && REFRESH_SHAPE.test(value);
}

/** SHA-256 of the token, as 64 lower-case hex characters. Only this hash is ever stored. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Makes a new refresh token from 32 random bytes. Give `token` to the client once.
 * Store `hash` only. Storage is in the Store; rotation is in sessions.ts.
 */
export function createRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

/** Does this token match a stored hash? Anything malformed gives false, never an error. */
export function refreshTokenMatches(token: unknown, storedHash: unknown): boolean {
  if (!isRefreshTokenShape(token)) return false;
  if (typeof storedHash !== "string" || !HASH_SHAPE.test(storedHash)) return false;
  return safeEqual(hashRefreshToken(token), storedHash);
}