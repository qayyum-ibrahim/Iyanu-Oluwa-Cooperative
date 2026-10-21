// Expense routes (step 5.7). Thin: all rules live in expenses.ts.
// Guards run first (401, then 403), then the body is read, so a caller without the right
// never reaches the parser. Never log a body.

import express, { Router, type Request, type Response } from "express";
import {
  getAuth,
  requireAuth,
  requirePermission,
  sendUnauthorized,
  type GuardDeps,
} from "./guards.js";
import {
  createExpense,
  type ExpenseActor,
  type ExpenseFailure,
  type ExpenseFailureResult,
} from "./expenses.js";

const STATUS: Record<ExpenseFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
};

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function actorOf(res: Response): ExpenseActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, f: ExpenseFailureResult): void {
  res.status(STATUS[f.reason]).json({
    error: f.reason,
    ...(f.code !== undefined ? { code: f.code } : {}),
  });
}

export function createExpensesRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.post(
    "/",
    requirePermission("expenses.create"),
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const actor = actorOf(res);
      if (actor === null) {
        sendUnauthorized(res);
        return;
      }
      const body = bodyOf(req);
      const result = await createExpense(deps.store, actor, {
        category: body["category"],
        amount: body["amount"],
        method: body["method"],
        description: body["description"],
        narration: body["narration"],
      });
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.status(201).json({ expense: result.value });
    },
  );

  return router;
}
