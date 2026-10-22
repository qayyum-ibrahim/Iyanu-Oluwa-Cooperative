// Token keeping (D-84, replaces D-83's sessionStorage). The access token lives in memory only.
// The refresh token lives in localStorage: every tab shares it and it survives closing the
// browser until sign-out or expiry (7 days). Never log a token.

export const REFRESH_TOKEN_KEY = "iyanu.refreshToken";

/** The part of the Storage interface we use, so tests can pass a fake. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionKeeper {
  accessToken(): string | null;
  refreshToken(): string | null;
  save(tokens: SessionTokens): void;
  clear(): void;
}

export function createSessionKeeper(storage: TokenStorage | null): SessionKeeper {
  let access: string | null = null;

  function readRefresh(): string | null {
    try {
      return storage?.getItem(REFRESH_TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }

  return {
    accessToken: () => access,
    refreshToken: readRefresh,
    save(tokens) {
      access = tokens.accessToken;
      try {
        storage?.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      } catch {
        // Storage blocked: the session lasts until the access token expires.
      }
    },
    clear() {
      access = null;
      try {
        storage?.removeItem(REFRESH_TOKEN_KEY);
      } catch {
        // Nothing stored to remove.
      }
    },
  };
}

/** localStorage when the browser gives it, else null (server render, blocked storage). */
export function browserLocalStorage(): TokenStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
