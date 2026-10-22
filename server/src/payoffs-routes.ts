// Pay-off routes (step 6.4b, D-76). Thin: all rules live in payoffs.ts.
// Guards run first (401, then 403), then the body is read, so a caller without the right
// never reaches the parser. Never log a body or a key.

import express, { Router, type Request, type Response } from "express";
import {
  getAuth,
  requireAuth,
  requirePermission,
  sendUnauthorized,
  type GuardDeps,
} from "./guards.js";
import {
  processPayOff,
  type PayOffActor,
  type PayOffFailure,
  type PayOffFailureResult,
} from "./payoffs.js";

const STATUS: Record<PayOffFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
  not_found: 404,
  member_inactive: 409,
  active_loan: 409,
  nothing_to_pay_off: 409,
  payout_changed: 409,
  idempotency_conflict: 409,
};

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function actorOf(res: Response): PayOffActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, f: PayOffFailureResult): void {
  res.status(STATUS[f.reason]).json({
    error: f.reason,
    ...(f.code !== undefined ? { code: f.code } : {}),
  });
}

export function createPayOffsRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.post(
    "/",
    requirePermission("payoff.process"),
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const actor = actorOf(res);
      if (actor === null) {
        sendUnauthorized(res);
        return;
      }
      const body = bodyOf(req);
      const result = await processPayOff(deps.store, actor, {
        idempotencyKey: req.header("idempotency-key"),
        memberId: body["memberId"],
        method: body["method"],
        total: body["total"],
      });
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
      res.status(201).json({ payOff: result.value });
    },
  );

  return router;
}
