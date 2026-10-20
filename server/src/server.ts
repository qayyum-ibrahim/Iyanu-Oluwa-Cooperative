// Starts the real server: real database, real signing secret (D-32).
// Run from inside server/ so ".env" and the default "file:./dev.db" resolve there.
// Never log a secret, a token or a request body.
// SMS goes to the fake provider until the Twilio adapter exists (D-07, D-49).

import "dotenv/config";
import { createApp } from "./app.js";
import { createPrismaClient } from "./db.js";
import { createPrismaStore } from "./prisma-store.js";
import { FakeSmsProvider } from "./sms.js";
import { TokenConfigError, readTokenSecret } from "./tokens.js";

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

  const prisma = createPrismaClient(process.env["DATABASE_URL"] ?? "file:./dev.db");
  const app = createApp({
    store: createPrismaStore(prisma),
    tokenSecret,
    sms: new FakeSmsProvider(),
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