// Owner setup script (D-06, D-24). Run inside server/:  npm run setup:owner
// Asks for the owner email and password at run time. Nothing is read from git or from .env.
// The password is never printed or logged.

import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createPrismaClient } from "./db.js";
import { InvalidEmailError } from "./email.js";
import { createOwner, OwnerAlreadyExistsError } from "./owner.js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PasswordPolicyError } from "./password.js";
import { createPrismaStore } from "./prisma-store.js";
import { DuplicateEmailError } from "./store.js";

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("Run this in a terminal. The password must be typed, not piped in.");
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Set DATABASE_URL in server/.env. Nothing was changed.");
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    const store = createPrismaStore(prisma);
    if (await store.users.hasSuperAdmin()) {
      console.log("A Super Admin already exists. Nothing was changed.");
      process.exitCode = 1;
      return;
    }

    // While `muted` is true, typed characters are not shown.
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });

    let email: string;
    let name: string;
    let password: string;
    let again: string;
    try {
      console.log("Create the Super Admin (owner) account.");
      email = await rl.question("Owner email: ");
      name = await rl.question('Display name (press Enter for "Owner"): ');
      muted = true;
      process.stdout.write(`Password (${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters): `);
      password = await rl.question("");
      process.stdout.write("\n");
      process.stdout.write("Repeat password: ");
      again = await rl.question("");
      process.stdout.write("\n");
      muted = false;
    } finally {
      rl.close();
    }

    if (password !== again) {
      console.error("The two passwords do not match. Nothing was changed.");
      process.exitCode = 1;
      return;
    }

    try {
      const owner = await createOwner(store, { email, password, displayName: name });
      console.log(`Super Admin created: ${owner.email}`);
    } catch (e) {
      if (
        e instanceof OwnerAlreadyExistsError ||
        e instanceof InvalidEmailError ||
        e instanceof PasswordPolicyError ||
        e instanceof DuplicateEmailError
      ) {
        console.error(`${e.message}. Nothing was changed.`);
        process.exitCode = 1;
        return;
      }
      throw e;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  // Print only the error name. Some error messages can contain request data.
  console.error(`Setup failed unexpectedly (${e instanceof Error ? e.name : "unknown error"}).`);
  process.exitCode = 1;
});