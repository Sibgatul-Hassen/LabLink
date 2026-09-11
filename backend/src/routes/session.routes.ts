import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  assignExperimentSchema,
  generateSessionsSchema,
  listSessionsQuerySchema,
} from "../schemas/session.schema";
import { SessionService } from "../services/session.service";
import { RequisitionService } from "../services/requisition.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleSessionError(error: unknown, res: Response): void {
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

  if (
    error.message === "Class session not found" ||
    error.message === "Experiment not found"
  ) {
    res.status(404).json({ error: error.message });
    return;
  }

  // An instructor reaching for someone else's section is a permission failure,
  // not a validation failure.
  if (
    error.message === "You can only assign experiments to your own sections"
  ) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (error.message === "Experiment does not belong to this session's course") {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error.message === "This class session already has a requisition") {
    res.status(409).json({ error: error.message });
    return;
  }

  if (
    error.message === "You can only raise requisitions for your own department"
  ) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (error.message === "This class session has no experiment assigned") {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

router.post(
  "/sessions/generate",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { horizonDays } = generateSessionsSchema.parse(req.body ?? {});
      const result = await SessionService.generateSessions(horizonDays);
      res.status(200).json({ data: result });
    } catch (error) {
      handleSessionError(error, res);
    }
  },
);

router.get(
  "/sessions",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listSessionsQuerySchema.parse(req.query);
      const result = await SessionService.listSessions(query);
      res.status(200).json(result);
    } catch (error) {
      handleSessionError(error, res);
    }
  },
);

router.get(
  "/sessions/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const session = await SessionService.getSessionById(req.params.id);
      res.status(200).json({ data: session });
    } catch (error) {
      handleSessionError(error, res);
    }
  },
);

// Feature 40. The role guard admits instructors; the service then narrows an
// instructor to their own sections.
router.patch(
  "/sessions/:id/experiment",
  requireAuth,
  requireRole("INSTRUCTOR", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = assignExperimentSchema.parse(req.body);

      const session = await SessionService.assignExperiment(
        req.params.id,
        validated,
        { id: req.user.id, role: req.user.role },
      );

      res.status(200).json({ data: session });
    } catch (error) {
      handleSessionError(error, res);
    }
  },
);

// Task 4.2. Gated the same way RequisitionService.canRaise gates a hand-raised
// CLASS requisition — only a lab assistant (their own department) or an admin.
router.post(
  "/sessions/:id/draft-requisition",
  requireAuth,
  requireRole("LAB_ASSISTANT", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const requisition = await RequisitionService.draftRequisitionForSession(
        req.params.id,
        {
          id: req.user.id,
          role: req.user.role,
          departmentId: req.user.departmentId,
        },
      );

      res.status(201).json({ data: requisition });
    } catch (error) {
      handleSessionError(error, res);
    }
  },
);

export default router;
