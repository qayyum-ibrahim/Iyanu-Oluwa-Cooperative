// Report routes (step 7.4c). Thin: all rules live in reports.ts.
// Guards run first (401, then 403), then the query is checked. Read only. Never log a query.

import { Router, type Response } from "express";
import { getAuth, requireAuth, requirePermission, sendUnauthorized, type GuardDeps } from "./guards.js";
import {
  getCategoryReport,
  type CategoryReportFailure,
  type CategoryReportFailureResult,
  type ReportActor,
} from "./reports.js";

const STATUS: Record<CategoryReportFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
};

function actorOf(res: Response): ReportActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, f: CategoryReportFailureResult): void {
  res.status(STATUS[f.reason]).json({
    error: f.reason,
    ...(f.code !== undefined ? { code: f.code } : {}),
  });
}

export function createReportsRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get("/categories", requirePermission("reports.view"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const q = req.query;
    const result = await getCategoryReport(deps.store, actor, {
      fromDay: q["fromDay"],
      toDay: q["toDay"],
      createdById: q["createdById"],
    });
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    res.status(200).json(result.value);
  });

  return router;
}
