import express from "express";
import { createAuditRouter } from "./audit-routes.js";
import { createAuthRouter } from "./auth-routes.js";
import { createLoansRouter } from "./loans-routes.js";
import { createMembersRouter } from "./members-routes.js";
import { createPaymentsRouter } from "./payments-routes.js";
import { FakeSmsProvider, type SmsProvider } from "./sms.js";
import { createStaffRouter } from "./staff-routes.js";
import type { Store } from "./store.js";
import { assertSecretAllowed } from "./tokens.js";

export interface AppDeps {
  store: Store;
  tokenSecret: string;
  /** For tests. Defaults to the real clock. */
  now?: () => Date;
  /** Defaults to a FakeSmsProvider (D-07). server.ts passes it on purpose. */
  sms?: SmsProvider;
}

/** Returns the HTTP status for a client error (4xx) raised by Express itself, else null. */
function clientErrorStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500) {
      return status;
    }
  }
  return null;
}

const errorHandler: express.ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = clientErrorStatus(err);
  if (status === null) {
    // Log the error name only: a message could hold request data.
    console.error("request failed:", err instanceof Error ? err.name : "unknown");
    res.status(500).json({ error: "server_error" });
    return;
  }
  res.status(status).json({ error: status === 413 ? "too_large" : "bad_request" });
};

/**
 * Without `deps` only /health exists (the health test uses this).
 * With `deps` the /auth and /staff routes are mounted. A bad token secret throws at once, at start-up.
 */
export function createApp(deps?: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  if (deps !== undefined) {
    const tokenSecret = assertSecretAllowed(deps.tokenSecret);
    const now = deps.now ?? (() => new Date());
    const sms = deps.sms ?? new FakeSmsProvider();
    app.use(
      "/auth",
      express.json({ limit: "10kb" }),
      createAuthRouter({ store: deps.store, tokenSecret, now }),
    );
    app.use("/staff", createStaffRouter({ store: deps.store, tokenSecret, now }));
    app.use("/audit", createAuditRouter({ store: deps.store, tokenSecret, now }));
    app.use("/members", createMembersRouter({ store: deps.store, tokenSecret, now }));
    app.use("/payments", createPaymentsRouter({ store: deps.store, tokenSecret, now, sms }));
    app.use("/loans", createLoansRouter({ store: deps.store, tokenSecret, now }));
  }
  app.use(errorHandler);
  return app;
}