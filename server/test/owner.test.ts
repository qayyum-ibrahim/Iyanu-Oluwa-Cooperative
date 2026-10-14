import { describe, expect, it } from "vitest";
import { InvalidEmailError } from "../src/email.js";
import { createMemoryStore } from "../src/memory-store.js";
import { createOwner, OwnerAlreadyExistsError } from "../src/owner.js";
import { PasswordPolicyError, verifyPassword } from "../src/password.js";

// A fake password for tests only.
const PASSWORD = "test-only-password-123";

const input = (over: Record<string, unknown> = {}) => ({
  email: "  Owner@Example.TEST ",
  password: PASSWORD,
  displayName: "  Test Owner  ",
  ...over,
});

describe("createOwner", () => {
  it("creates an active SUPER_ADMIN with a normalised email and a trimmed name", async () => {
    const store = createMemoryStore();
    const owner = await createOwner(store, input());
    expect(owner.role).toBe("SUPER_ADMIN");
    expect(owner.isActive).toBe(true);
    expect(owner.email).toBe("owner@example.test");
    expect(owner.displayName).toBe("Test Owner");
    expect(await store.users.findByEmail("owner@example.test")).toMatchObject({ id: owner.id });
    expect(await store.users.hasSuperAdmin()).toBe(true);
  });

  it("stores a hash that verifies, never the password itself", async () => {
    const store = createMemoryStore();
    const owner = await createOwner(store, input());
    expect(owner.passwordHash).not.toContain(PASSWORD);
    expect(owner.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(owner.passwordHash, PASSWORD)).toBe(true);
    expect(await verifyPassword(owner.passwordHash, "some-other-password")).toBe(false);
  });

  it("writes one owner.setup audit entry with the owner as actor and no password in it", async () => {
    const store = createMemoryStore();
    const owner = await createOwner(store, input());
    const entries = await store.audit.listByActor(owner.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "owner.setup",
      entityType: "User",
      entityId: owner.id,
      actorId: owner.id,
    });
    expect(JSON.stringify(entries)).not.toContain(PASSWORD);
  });

  it("refuses a second owner and saves nothing", async () => {
    const store = createMemoryStore();
    await createOwner(store, input());
    await expect(
      createOwner(store, input({ email: "second@example.test" })),
    ).rejects.toBeInstanceOf(OwnerAlreadyExistsError);
    expect(await store.users.findByEmail("second@example.test")).toBeNull();
  });

  it("refuses when a Super Admin was created some other way", async () => {
    const store = createMemoryStore();
    await store.users.create({
      email: "other-admin@example.test",
      passwordHash: "not-a-real-hash",
      displayName: "Other",
      role: "SUPER_ADMIN",
    });
    await expect(createOwner(store, input())).rejects.toBeInstanceOf(OwnerAlreadyExistsError);
  });

  it("is not blocked by staff accounts", async () => {
    const store = createMemoryStore();
    await store.users.create({
      email: "staff@example.test",
      passwordHash: "not-a-real-hash",
      displayName: "Staff",
    });
    const owner = await createOwner(store, input());
    expect(owner.role).toBe("SUPER_ADMIN");
  });

  it("rejects a bad email and saves nothing", async () => {
    const store = createMemoryStore();
    await expect(createOwner(store, input({ email: "not-an-email" }))).rejects.toBeInstanceOf(
      InvalidEmailError,
    );
    expect(await store.users.hasSuperAdmin()).toBe(false);
  });

  it("rejects a short password and saves nothing", async () => {
    const store = createMemoryStore();
    await expect(createOwner(store, input({ password: "short" }))).rejects.toBeInstanceOf(
      PasswordPolicyError,
    );
    expect(await store.users.hasSuperAdmin()).toBe(false);
  });

  it("rejects a password that is not text and saves nothing", async () => {
    const store = createMemoryStore();
    await expect(createOwner(store, input({ password: 123456789012 }))).rejects.toBeInstanceOf(
      PasswordPolicyError,
    );
    expect(await store.users.hasSuperAdmin()).toBe(false);
  });

  it('uses "Owner" when the display name is blank', async () => {
    const store = createMemoryStore();
    const owner = await createOwner(store, input({ displayName: "   " }));
    expect(owner.displayName).toBe("Owner");
  });
});