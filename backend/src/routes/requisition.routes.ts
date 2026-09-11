import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  createRequisitionLineSchema,
  createRequisitionSchema,
  listRequisitionsQuerySchema,
  returnRequisitionSchema,
  updateRequisitionLineSchema,
  updateRequisitionSchema,
} from "../schemas/requisition.schema";
import {
  RequisitionActor,
  RequisitionService,
} from "../services/requisition.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

const NOT_FOUND_MESSAGES = [
  "Requisition not found",
  "Requisition line not found",
  "Class session not found",
  "Component not found",
];

const FORBIDDEN_MESSAGES = [
  "You cannot raise this type of requisition",
  "You can only raise requisitions for your own department",
  "You can only change your own requisitions",
];

const CONFLICT_MESSAGES = [
  "This class session already has a requisition",
  "This component is already on the requisition",
  "Only a draft requisition can be changed",
];

const BAD_REQUEST_MESSAGES = [
  "Your account has no department",
  "The window of a class requisition follows its class session",
  "The window's start must be before its end",
  "Requisition must be ready before it can be issued",
  "Requisition must be issued before it can be returned",
  "Component not on this requisition",
  "Return quantity exceeds issued quantity",
];

function handleRequisitionError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  if (!(error instanceof Error)) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (NOT_FOUND_MESSAGES.includes(error.message)) {
    res.status(404).json({ error: error.message });
    return;
  }

  if (FORBIDDEN_MESSAGES.includes(error.message)) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (CONFLICT_MESSAGES.includes(error.message)) {
    res.status(409).json({ error: error.message });
    return;
  }

  if (BAD_REQUEST_MESSAGES.includes(error.message)) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Carries the component code, so it cannot live in a fixed-string array.
  if (error.message.startsWith("Insufficient stock")) {
    res.status(409).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

function actorFrom(req: AuthenticatedRequest): RequisitionActor | null {
  if (!req.user) {
    return null;
  }

  return {
    id: req.user.id,
    role: req.user.role,
    departmentId: req.user.departmentId,
  };
}

/**
 * No requireRole guard on these routes, deliberately.
 *
 * Which roles may create a requisition depends on the *type* in the body — a
 * student may raise PERSONAL but not CLASS, a lab assistant the reverse. And
 * reading is open to everyone, with the scope narrowing what comes back rather
 * than whether the call is allowed. Middleware cannot express either rule
 * without reading the body or the database, so both live in the service.
 */

router.post(
  "/requisitions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = createRequisitionSchema.parse(req.body);
      const requisition = await RequisitionService.createRequisition(
        validated,
        actor,
      );

      res.status(201).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.get(
  "/requisitions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = listRequisitionsQuerySchema.parse(req.query);
      const result = await RequisitionService.listRequisitions(query, actor);

      res.status(200).json(result);
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.get(
  "/requisitions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const requisition = await RequisitionService.getRequisitionById(
        req.params.id,
        actor,
      );

      res.status(200).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.patch(
  "/requisitions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = updateRequisitionSchema.parse(req.body);
      const requisition = await RequisitionService.updateRequisition(
        req.params.id,
        validated,
        actor,
      );

      res.status(200).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.delete(
  "/requisitions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      await RequisitionService.deleteRequisition(req.params.id, actor);

      res.status(204).send();
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

// ─────────────── lines ───────────────

// All three return the whole requisition, so the client always holds a current
// line list without a second fetch.

router.post(
  "/requisitions/:id/lines",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = createRequisitionLineSchema.parse(req.body);
      const requisition = await RequisitionService.addLine(
        req.params.id,
        validated,
        actor,
      );

      res.status(201).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.patch(
  "/requisitions/:id/lines/:lineId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = updateRequisitionLineSchema.parse(req.body);
      const requisition = await RequisitionService.updateLine(
        req.params.id,
        req.params.lineId,
        validated,
        actor,
      );

      res.status(200).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.delete(
  "/requisitions/:id/lines/:lineId",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const requisition = await RequisitionService.removeLine(
        req.params.id,
        req.params.lineId,
        actor,
      );

      res.status(200).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

// ─────────────── issue & return ───────────────

router.post(
  "/requisitions/:id/issue",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const requisition = await RequisitionService.issueRequisition(
        req.params.id,
        actor,
      );

      res.status(200).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

router.post(
  "/requisitions/:id/return",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = returnRequisitionSchema.parse(req.body);
      const requisition = await RequisitionService.returnRequisition(
        req.params.id,
        validated,
        actor,
      );

      res.status(200).json({ data: requisition });
    } catch (error) {
      handleRequisitionError(error, res);
    }
  },
);

export default router;
