import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/memory-store.js";
import { runStoreContract } from "./helpers/store-contract.js";

// A fresh, empty store for every test.
runStoreContract(
  "in-memory adapter",
  () => createMemoryStore(),
  () => createMemoryStore(),
);

class Boom extends Error {
  constructor() {
    super("boom");
    this.name = "Boom";
  }
}

// These two cases pin the queue inside the memory adapter's transaction (A-111).
// The shared contract cannot reach it: it uses a fresh store per case and never
// starts a second transaction while a slow one is still open.
describe("memory adapter transactions (queue)", () => {
  it("runs transactions one at a time, so a slow failure does not undo a later one", async () => {
    const store = createMemoryStore();
    const slowEmail = "queue-slow@example.test";
    const fastEmail = "queue-fast@example.test";
    const events: string[] = [];

    const slow = store.transaction(async (tx) => {
      await tx.users.create({ email: slowEmail, passwordHash: "x", displayName: "Slow" });
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push("slow:end");
      throw new Boom();
    });
    const fast = store.transaction(async (tx) => {
      events.push("fast:start");
      await tx.users.create({ email: fastEmail, passwordHash: "x", displayName: "Fast" });
    });

    const results = await Promise.allSettled([slow, fast]);
    expect(results[0]?.status).toBe("rejected");
    expect(results[1]?.status).toBe("fulfilled");
    expect(events).toEqual(["slow:end", "fast:start"]);
    expect(await store.users.findByEmail(fastEmail)).not.toBeNull();
    expect(await store.users.findByEmail(slowEmail)).toBeNull();
  });

  it("still runs a transaction after an earlier one failed on the same store", async () => {
    const store = createMemoryStore();
    const firstEmail = "queue-after-fail-1@example.test";
    const secondEmail = "queue-after-fail-2@example.test";

    await expect(
      store.transaction(async (tx) => {
        await tx.users.create({ email: firstEmail, passwordHash: "x", displayName: "First" });
        return Promise.reject(new Boom());
      }),
    ).rejects.toBeInstanceOf(Boom);

    const value = await store.transaction(async (tx) => {
      await tx.users.create({ email: secondEmail, passwordHash: "x", displayName: "Second" });
      return "done";
    });

    expect(value).toBe("done");
    expect(await store.users.findByEmail(firstEmail)).toBeNull();
    expect(await store.users.findByEmail(secondEmail)).not.toBeNull();
  });
});