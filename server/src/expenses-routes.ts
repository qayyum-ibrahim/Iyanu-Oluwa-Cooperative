// Expense routes (step 5.7, idempotency key in 5.7c, list in 5.8b, delete in 5.9b, edit in 5.9c,
// day spent in U.6b, day filter in U.6b2). Thin: all rules live in expenses.ts.
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
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
  type ExpenseActor,
  type ExpenseFailure,
  type ExpenseFailureResult,
} from "./expenses.js";

const STATUS: Record<ExpenseFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
  idempotency_conflict: 409,
  not_found: 404,
  not_deletable: 409,
  not_editable: 409,
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
        idempotencyKey: req.header("idempotency-key"),
        category: body["category"],
        amount: body["amount"],
        method: body["method"],
        spentOn: body["spentOn"],
        description: body["description"],
        narration: body["narration"],
      });
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      if (result.replayed) res.setHeader("Idempotent-Replayed", "true");
      res.status(201).json({ expense: result.value });
    },
  );

  router.get("/", requirePermission("expenses.view"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const q = req.query;
    const result = await listExpenses(deps.store, actor, {
      createdById: q["createdById"],
      category: q["category"],
      method: q["method"],
      fromDay: q["fromDay"],
      toDay: q["toDay"],
    });
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.status(200).json(result.value);
  });

  router.put(
    "/:id",
    requirePermission("expenses.edit"),
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const actor = actorOf(res);
      if (actor === null) {
        sendUnauthorized(res);
        return;
      }
      const body = bodyOf(req);
      const result = await updateExpense(deps.store, actor, req.params["id"], {
        category: body["category"],
        amount: body["amount"],
        method: body["method"],
        spentOn: body["spentOn"],
        description: body["description"],
        narration: body["narration"],
      });
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.status(200).json({ expense: result.value });
    },
  );

  router.delete("/:id", requirePermission("expenses.delete"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const result = await deleteExpense(deps.store, actor, req.params["id"]);
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.status(204).end();
  });

  return router;
}
