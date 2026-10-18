// Member routes (step 3.2). Thin: all rules live in members.ts and permissions.ts.
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
  createMember,
  getMember,
  listMembers,
  type MemberActor,
  type MemberFailure,
} from "./members.js";

const STATUS: Record<MemberFailure, number> = {
  forbidden: 403,
  invalid_input: 400,
  not_found: 404,
};

function bodyOf(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function actorOf(res: Response): MemberActor | null {
  const auth = getAuth(res);
  return auth === null ? null : { id: auth.user.id, subject: auth.subject };
}

function sendFailure(res: Response, reason: MemberFailure): void {
  res.status(STATUS[reason]).json({ error: reason });
}

export function createMembersRouter(deps: GuardDeps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.post(
    "/",
    requirePermission("members.create"),
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const actor = actorOf(res);
      if (actor === null) {
        sendUnauthorized(res);
        return;
      }
      const body = bodyOf(req);
      const result = await createMember(deps.store, actor, {
        fullName: body["fullName"],
        phone: body["phone"],
        address: body["address"],
        occupation: body["occupation"],
      });
      if (!result.ok) {
        sendFailure(res, result.reason);
        return;
      }
      res.status(201).json({ member: result.value });
    },
  );

  router.get("/", requirePermission("members.view"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const q = req.query;
    const result = await listMembers(deps.store, actor, {
      status: q["status"],
      createdById: q["createdById"],
    });
    if (!result.ok) {
      sendFailure(res, result.reason);
      return;
    }
    res.status(200).json({ members: result.value });
  });

  router.get("/:id", requirePermission("members.view"), async (req, res) => {
    const actor = actorOf(res);
    if (actor === null) {
      sendUnauthorized(res);
      return;
    }
    const result = await getMember(deps.store, actor, req.params["id"]);
    if (!result.ok) {
      sendFailure(res, result.reason);
      return;
    }
    res.status(200).json({ member: result.value });
  });

  return router;
}