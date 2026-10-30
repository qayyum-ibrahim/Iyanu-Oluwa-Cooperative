// Starts the real server: real database, real signing secret (D-32).
// Run from inside server/ so ".env" resolves there.
// Never log a secret, a token or a request body.
// SMS goes to the fake provider until the Twilio adapter exists (D-07, D-49).

import "dotenv/config";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createPrismaClient } from "./db.js";
import { createPrismaStore } from "./prisma-store.js";
import { FakeSmsProvider } from "./sms.js";
import { TokenConfigError, readTokenSecret } from "./tokens.js";

// The built web pages (`npm run build` in web/), served on the same address (D-116, step E.4).
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

function start(): void {
  let tokenSecret: string;
  try {
    tokenSecret = readTokenSecret(process.env);
  } catch (error) {
    if (error instanceof TokenConfigError) {
      console.error(`${error.message} Set TOKEN_SECRET in server/.env.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  // No default since the move to PostgreSQL (step E.2b): the database address must be set.
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Set DATABASE_URL in server/.env.");
    process.exitCode = 1;
    return;
  }

  const webDir = existsSync(join(WEB_DIR, "index.html")) ? WEB_DIR : undefined;
  if (webDir === undefined) {
    console.log("web pages not found (run npm run build in web/); serving the API only");
  }

  const prisma = createPrismaClient(databaseUrl);
  const app = createApp({
    store: createPrismaStore(prisma),
    tokenSecret,
    sms: new FakeSmsProvider(),
    webDir,
  });
  const port = Number(process.env["PORT"] ?? 3000);

  // Express 5 calls this with an error if the port cannot be opened (for example, already in use).
  const server = app.listen(port, (error?: unknown) => {
    if (error) {
      console.error(
        `Could not listen on port ${port} (${error instanceof Error ? error.name : "unknown error"}). Is another server running?`,
      );
      process.exitCode = 1;
      void prisma.$disconnect();
      return;
    }
    console.log(`server listening on port ${port}`);
  });

  // Stop cleanly on Ctrl+C or a stop signal: close the port, then the database.
  const stop = (): void => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

start();