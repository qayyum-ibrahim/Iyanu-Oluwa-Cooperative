// Staff routes (D-34). Thin: all rules live in staff.ts and permissions.ts.
// Guards run first (401, then 403), then the body is read, so a caller without the right
// never reaches the parser. Never log a body or a password.

import express, { Router, type Request, type Response } from "express";
import {
  getAuth,
  requireAuth,
  requirePermission,
  sendUnauthorized,
  type GuardDeps,
} from "./guards.js";
import {
  createStaff,
  deactivateStaff,
  listStaff,
  reactivateStaff,
  resetStaffPassword,
  setStaffPermissions,
  type StaffActor,
  type StaffFailure,
  type StaffView,
} from "./staff.js";

const STATUS: Record<StaffFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
  email_taken: 409,
  not_found: 404,
};

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function actorOf(res: Response): StaffActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function viewJson(view: StaffView) {
  return {
    id: view.id,
    email: view.email,
    displayName: view.displayName,
    role: view.role,
    isActive: view.isActive,
    permissions: view.permissions,
    createdAt: view.createdAt.toISOString(),
  };
}

function sendFailure(res: Response, reason: StaffFailure): void {
  res.status(STATUS[reason]).json({ error: reason });
}

export function createStaffRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps), requirePermission("users.manage"), express.json({ limit: "10kb" }));

  router.post("/", async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const body = bodyOf(req);
    const result = await createStaff(deps.store, actor, {
      email: body["email"],
      password: body["password"],
      displayName: body["displayName"],
      permissions: body["permissions"],
    });
    if (!result.ok) {
      sendFailure(res, result.reason);
      return;
    }
    res.status(201).json({ staff: viewJson(result.value) });
  });

  router.get("/", async (_req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const result = await listStaff(deps.store, actor);
    if (!result.ok) {
      sendFailure(res, result.reason);
      return;
    }
    res.status(200).json({ staff: result.value.map(viewJson) });
  });

  router.put("/:id/permissions", async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const body = bodyOf(req);
    const result = await setStaffPermissions(deps.store, actor, req.params["id"], body["permissions"]);
    if (!result.ok) {
      sendFailure(res, result.reason);
      return;
    }
    res.status(200).json({ staff: viewJson(result.value) });
  });

  const activeRoute =
    (run: typeof deactivateStaff): express.RequestHandler =>
    async (req, res) => {
      const actor = actorOf(res);
      if (actor === null) {
        sendUnauthorized(res);
        return;
      }
      const result = await run(deps.store, actor, req.params["id"], deps.now());
      if (!result.ok) {
        sendFailure(res, result.reason);
        return;
      }
      res.status(200).json({ staff: viewJson(result.value) });
    };
  router.post("/:id/deactivate", activeRoute(deactivateStaff));
  router.post("/:id/reactivate", activeRoute(reactivateStaff));

  router.put("/:id/password", async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const body = bodyOf(req);
    const result = await resetStaffPassword(
      deps.store,
      actor,
      req.params["id"],
      body["password"],
      deps.now(),
    );
    if (!result.ok) {
      sendFailure(res, result.reason);
      return;
    }
    res.status(200).json({ staff: viewJson(result.value) });
  });

  return router;
}