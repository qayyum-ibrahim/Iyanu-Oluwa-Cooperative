// Payment routes (step 4.4, idempotency key in 4.5, SMS in 4.7, list in 4.8, loan codes in 5.5). Thin: all rules
// live in payments.ts and payment-sms.ts.
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
import { recordPayment } from "./payment-sms.js";
import {
  listPayments,
  type PaymentActor,
  type PaymentFailure,
  type PaymentFailureResult,
} from "./payments.js";
import type { SmsProvider } from "./sms.js";

export interface PaymentsRouterDeps extends GuardDeps {
  sms: SmsProvider;
}

const STATUS: Record<PaymentFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
  not_found: 404,
  member_inactive: 409,
  idempotency_conflict: 409,
  no_active_loan: 409,
  loan_overpayment: 409,
};

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function actorOf(res: Response): PaymentActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, f: PaymentFailureResult): void {
  res.status(STATUS[f.reason]).json({
    error: f.reason,
    ...(f.code !== undefined ? { code: f.code } : {}),
    ...(f.lineIndex !== undefined ? { lineIndex: f.lineIndex } : {}),
  });
}

export function createPaymentsRouter(deps: PaymentsRouterDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.post(
    "/",
    requirePermission("payments.create"),
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const actor = actorOf(res);
      if (actor === null) {
        sendUnauthorized(res);
        return;
      }
      const body = bodyOf(req);
      const result = await recordPayment(deps.store, deps.sms, actor, {
        idempotencyKey: req.header("idempotency-key"),
        memberId: body["memberId"],
        method: body["method"],
        total: body["total"],
        lines: body["lines"],
        sendSms: body["sendSms"],
      });
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
      res.status(201).json({ payment: result.value, sms: result.sms });
    },
  );

  router.get("/", requirePermission("payments.view"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const result = await listPayments(deps.store, actor, { memberId: req.query["memberId"] });
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.status(200).json({ payments: result.value });
  });

  return router;
}