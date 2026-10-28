// Export routes (steps 8.4 and 9.1i; D-104, D-110, A-253, A-277). Thin: all rules live in exports.ts.
// Guards run first (401, then 403), then the kind, then the query. The reply is an .xlsx file,
// or JSON on a refusal. Never log a query.

import { Router, type Response } from "express";
import {
  exportCashflow,
  exportCategory,
  exportExpenses,
  exportMember,
  exportMembers,
  exportTransactions,
  type CategoryExportInput,
  type ExportActor,
  type ExportFailure,
  type ExportFailureResult,
  type ExportKind,
  type ExportResult,
  type MemberExportInput,
} from "./exports.js";
import { getAuth, requireAuth, requirePermission, sendUnauthorized, type GuardDeps } from "./guards.js";
import { lagosDay } from "./payments.js";
import type { Store } from "./store.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const STATUS: Record<ExportFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
  not_found: 404,
};

// Each kind reads only its own fields: members ignores the days, the four others ignore category
// (A-253); only member reads memberId, and it reads nothing else (A-277).
const EXPORTERS: Record<
  ExportKind,
  (store: Store, actor: ExportActor, input: CategoryExportInput & MemberExportInput) => Promise<ExportResult>
> = {
  members: exportMembers,
  transactions: exportTransactions,
  expenses: exportExpenses,
  cashflow: exportCashflow,
  category: exportCategory,
  member: exportMember,
};

function isKind(value: string): value is ExportKind {
  return Object.prototype.hasOwnProperty.call(EXPORTERS, value);
}

function actorOf(res: Response): ExportActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, f: ExportFailureResult): void {
  res.status(STATUS[f.reason]).json({
    error: f.reason,
    ...(f.code !== undefined ? { code: f.code } : {}),
  });
}

export function createExportsRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get("/:kind", requirePermission("reports.export"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const kind = req.params["kind"];
    if (typeof kind !== "string" || !isKind(kind)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const q = req.query;
    const result = await EXPORTERS[kind](deps.store, actor, {
      fromDay: q["fromDay"],
      toDay: q["toDay"],
      category: q["category"],
      createdById: q["createdById"],
      memberId: q["memberId"],
    });
    if (!result.ok) {
      sendFailure(res, result);
      return;
    }
    // The name holds only the kind and today's Lagos day: no category text, no person, no member.
    res.status(200);
    res.set("Content-Type", XLSX_TYPE);
    res.set("Content-Disposition", `attachment; filename="${kind}-${lagosDay(deps.now())}.xlsx"`);
    res.send(result.value);
  });

  return router;
}
