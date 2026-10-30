import express from "express";
import { createAuditRouter } from "./audit-routes.js";
import { createAuthRouter } from "./auth-routes.js";
import { createDashboardRouter } from "./dashboard-routes.js";
import { createExpensesRouter } from "./expenses-routes.js";
import { createExportsRouter } from "./exports-routes.js";
import { createLoansRouter } from "./loans-routes.js";
import { createMembersRouter } from "./members-routes.js";
import { createPaymentsRouter } from "./payments-routes.js";
import { createPayOffsRouter } from "./payoffs-routes.js";
import { createReportsRouter } from "./reports-routes.js";
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
  /** Folder of the built web pages (web/dist, step E.4). Unset: no pages are served. */
  webDir?: string;
  /** Proxies in front of the server (Express "trust proxy" as a number, step E.7). Default 0: none. */
  trustProxyHops?: number;
}

export class TrustProxyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustProxyConfigError";
  }
}

/** Highest TRUST_PROXY_HOPS accepted (A-297). */
export const MAX_TRUST_PROXY_HOPS = 5;

/**
 * Reads TRUST_PROXY_HOPS (D-122): missing or empty gives 0, so the socket address is used and
 * X-Forwarded-For is ignored. Otherwise a whole number from 0 to MAX_TRUST_PROXY_HOPS. Throws
 * TrustProxyConfigError for anything else; the message never holds the value.
 */
export function readTrustProxyHops(env: Readonly<Record<string, string | undefined>>): number {
  const text = (env["TRUST_PROXY_HOPS"] ?? "").trim();
  if (text === "") return 0;
  if (!/^[0-9]$/.test(text) || Number(text) > MAX_TRUST_PROXY_HOPS) {
    throw new TrustProxyConfigError(
      `TRUST_PROXY_HOPS must be a whole number from 0 to ${MAX_TRUST_PROXY_HOPS}.`,
    );
  }
  return Number(text);
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

/**
 * Security headers on every reply (OWASP REST Security and HTTP Headers cheat sheets, read at 9.2).
 * HSTS since step E.7 (D-122): Render serves only HTTPS; the short max-age is the OWASP HSTS cheat
 * sheet's rollout value, no preload. X-XSS-Protection is left unset on purpose.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=86400; includeSubDomains",
};

/**
 * Headers that replace two of the above on a web page file (step E.4). The others stay.
 * The CSP is the OWASP CSP cheat sheet's tightened basic policy, with frame-ancestors 'none' (as
 * X-Frame-Options DENY) and base-uri 'none' added. no-cache, so a new build is picked up at once.
 */
export const PAGE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-cache",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

/** True for /api and anything under it: those paths are only ever API routes. */
function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

const securityHeaders: express.RequestHandler = (_req, res, next) => {
  res.set(SECURITY_HEADERS);
  next();
};

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
 * With `deps` the API routes are mounted, at / and under /api. A bad token secret throws at once,
 * at start-up. With `deps.webDir` the files in it are served as web pages.
 */
export function createApp(deps?: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  // Behind Render's proxy the client address is in X-Forwarded-For (step E.7). 0 keeps it ignored.
  const trustProxyHops = deps?.trustProxyHops ?? 0;
  if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);
  app.use(securityHeaders);
  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  if (deps !== undefined) {
    const tokenSecret = assertSecretAllowed(deps.tokenSecret);
    const now = deps.now ?? (() => new Date());
    const sms = deps.sms ?? new FakeSmsProvider();
    api.use(
      "/auth",
      express.json({ limit: "10kb" }),
      createAuthRouter({ store: deps.store, tokenSecret, now }),
    );
    api.use("/staff", createStaffRouter({ store: deps.store, tokenSecret, now }));
    api.use("/audit", createAuditRouter({ store: deps.store, tokenSecret, now }));
    api.use("/members", createMembersRouter({ store: deps.store, tokenSecret, now }));
    api.use("/payments", createPaymentsRouter({ store: deps.store, tokenSecret, now, sms }));
    api.use("/loans", createLoansRouter({ store: deps.store, tokenSecret, now }));
    api.use("/expenses", createExpensesRouter({ store: deps.store, tokenSecret, now }));
    api.use("/payoffs", createPayOffsRouter({ store: deps.store, tokenSecret, now }));
    api.use("/dashboard", createDashboardRouter({ store: deps.store, tokenSecret, now }));
    api.use("/reports", createReportsRouter({ store: deps.store, tokenSecret, now }));
    api.use("/exports", createExportsRouter({ store: deps.store, tokenSecret, now }));
  }
  // The built web pages call the API under /api (web/src/api-proxy.ts). The routes still answer
  // without the prefix, for the live check and the /health ping (step E.4).
  app.use("/api", api);
  app.use(api);
  if (deps?.webDir !== undefined) {
    const pages = express.static(deps.webDir, {
      setHeaders: (res) => {
        res.set(PAGE_HEADERS);
      },
    });
    // A missing file falls through to the 404 below. Nothing under /api is ever a page.
    app.use((req, res, next) => {
      if (isApiPath(req.path)) {
        next();
        return;
      }
      void pages(req, res, next);
    });
  }
  // Our own 404: Express's default one replaces the Content-Security-Policy set above.
  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  app.use(errorHandler);
  return app;
}