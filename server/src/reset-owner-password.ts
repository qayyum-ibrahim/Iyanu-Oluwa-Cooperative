// Owner password reset script (D-24, D-36). Run inside server/:  npm run reset:owner
// The password is typed at run time, twice, with no echo. It is never printed or logged.

import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createPrismaClient } from "./db.js";
import {
  MultipleOwnersError,
  NoOwnerError,
  findOnlyOwner,
  resetOwnerPassword,
} from "./owner-reset.js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PasswordPolicyError } from "./password.js";
import { createPrismaStore } from "./prisma-store.js";

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

    let ownerEmail: string;
    try {
      ownerEmail = (await findOnlyOwner(store)).email;
    } catch (e) {
      if (e instanceof NoOwnerError) {
        console.error("No Super Admin exists. Run npm run setup:owner first. Nothing was changed.");
        process.exitCode = 1;
        return;
      }
      if (e instanceof MultipleOwnersError) {
        console.error("More than one Super Admin exists. This script will not guess. Nothing was changed.");
        process.exitCode = 1;
        return;
      }
      throw e;
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

    let password: string;
    let again: string;
    try {
      console.log(`Reset the password of the Super Admin: ${ownerEmail}`);
      muted = true;
      process.stdout.write(`New password (${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters): `);
      password = await rl.question("");
      process.stdout.write("\n");
      process.stdout.write("Repeat new password: ");
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
      const result = await resetOwnerPassword(store, password);
      console.log(`Password changed for ${result.email}. Sessions ended: ${result.tokensRevoked}.`);
      if (!result.isActive) {
        console.log("Note: this account is inactive. It cannot sign in until it is made active.");
      }
    } catch (e) {
      if (
        e instanceof PasswordPolicyError ||
        e instanceof NoOwnerError ||
        e instanceof MultipleOwnersError
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
  console.error(`Reset failed unexpectedly (${e instanceof Error ? e.name : "unknown error"}).`);
  process.exitCode = 1;
});