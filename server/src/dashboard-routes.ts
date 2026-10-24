// Dashboard route (step 7.3b). Thin: all rules live in dashboard.ts.
// Guards run first (401, then 403), then the query is checked. Read only. Never log a query.

import { Router, type Response } from "express";
import { getDashboard, type DashboardActor, type DashboardFailure, type DashboardFailureResult } from "./dashboard.js";
import { getAuth, requireAuth, requirePermission, sendUnauthorized, type GuardDeps } from "./guards.js";

const STATUS: Record<DashboardFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
};

function actorOf(res: Response): DashboardActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, f: DashboardFailureResult): void {
  res.status(STATUS[f.reason]).json({
    error: f.reason,
    ...(f.code !== undefined ? { code: f.code } : {}),
  });
}

export function createDashboardRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get("/", requirePermission("dashboard"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const q = req.query;
    const result = await getDashboard(deps.store, actor, {
      month: q["month"],
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
