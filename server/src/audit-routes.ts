// Audit route (step 2.6). Thin: the rules live in audit-view.ts.
// Guards run first (401, then 403). Read-only: there is no write route.

import { Router } from "express";
import { listAuditEntries } from "./audit-view.js";
import { getAuth, requireAuth, requirePermission, sendUnauthorized, type GuardDeps } from "./guards.js";

export function createAuditRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps), requirePermission("users.manage"));

  router.get("/", async (req, res) => {
    const auth = getAuth(res);
    if (auth === null) {
      sendUnauthorized(res);
      return;
    }
    const q = req.query;
    const result = await listAuditEntries(
      deps.store,
      { subject: auth.subject },
      { actorId: q["actorId"], action: q["action"], limit: q["limit"], offset: q["offset"] },
    );
    if (!result.ok) {
      res.status(result.reason === "forbidden" ? 403 : 400).json({ error: result.reason });
      return;
    }
    res.status(200).json(result.value);
  });

  return router;
}