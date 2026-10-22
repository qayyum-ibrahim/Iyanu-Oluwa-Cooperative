import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REFRESH_TOKEN_KEY,
  browserLocalStorage,
  createSessionKeeper,
  type TokenStorage,
} from "../src/session.ts";

function memoryStorage(): TokenStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function throwingStorage(): TokenStorage {
  const fail = () => {
    throw new Error("blocked");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe("session keeper", () => {
  it("starts empty", () => {
    const keeper = createSessionKeeper(memoryStorage());
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
  });

  it("keeps the access token in memory and only the refresh token in storage", () => {
    const storage = memoryStorage();
    const keeper = createSessionKeeper(storage);
    keeper.save({ accessToken: "acc", refreshToken: "ref" });
    expect(keeper.accessToken()).toBe("acc");
    expect(keeper.refreshToken()).toBe("ref");
    expect([...storage.data.entries()]).toEqual([[REFRESH_TOKEN_KEY, "ref"]]);
  });

  it("a new keeper on the same storage has the refresh token but no access token", () => {
    const storage = memoryStorage();
    createSessionKeeper(storage).save({ accessToken: "acc", refreshToken: "ref" });
    const reloaded = createSessionKeeper(storage);
    expect(reloaded.accessToken()).toBeNull();
    expect(reloaded.refreshToken()).toBe("ref");
  });

  it("clear removes both tokens", () => {
    const storage = memoryStorage();
    const keeper = createSessionKeeper(storage);
    keeper.save({ accessToken: "acc", refreshToken: "ref" });
    keeper.clear();
    expect(keeper.accessToken()).toBeNull();
    expect(keeper.refreshToken()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("works without storage, and with storage that throws", () => {
    for (const storage of [null, throwingStorage()]) {
      const keeper = createSessionKeeper(storage);
      keeper.save({ accessToken: "acc", refreshToken: "ref" });
      expect(keeper.accessToken()).toBe("acc");
      expect(keeper.refreshToken()).toBeNull();
      keeper.clear();
      expect(keeper.accessToken()).toBeNull();
    }
  });
});

describe("browserLocalStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives localStorage, not sessionStorage", () => {
    const local = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", memoryStorage());
    expect(browserLocalStorage()).toBe(local);
    createSessionKeeper(browserLocalStorage()).save({ accessToken: "acc", refreshToken: "ref" });
    expect(local.data.get(REFRESH_TOKEN_KEY)).toBe("ref");
  });

  it("gives null when there is no localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(browserLocalStorage()).toBeNull();
  });
});
