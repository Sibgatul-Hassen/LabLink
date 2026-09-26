import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  createLabSchema,
  listLabsQuerySchema,
  updateLabSchema,
} from "../schemas/lab.schema";
import { LabService } from "../services/lab.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleLabError(error: unknown, res: Response): void {
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

  if (error.message === "Lab not found") {
    res.status(404).json({ error: "Lab not found" });
    return;
  }

  if (error.message === "Department not found") {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  if (error.message === "Lab assistant not found") {
    res.status(404).json({ error: "Lab assistant not found" });
    return;
  }

  if (error.message === "User must have LAB_ASSISTANT role") {
    res.status(400).json({ error: error.message });
    return;
  }

  if (
    error.message ===
    "Lab with this room number already exists in this department"
  ) {
    res.status(409).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

router.post(
  "/labs",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createLabSchema.parse(req.body);
      const lab = await LabService.createLab(validated);
      res.status(201).json({ data: lab });
    } catch (error) {
      handleLabError(error, res);
    }
  },
);

router.get(
  "/labs",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listLabsQuerySchema.parse(req.query);
      const result = await LabService.listLabs(query);
      res.status(200).json(result);
    } catch (error) {
      handleLabError(error, res);
    }
  },
);

router.get(
  "/labs/:id",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const lab = await LabService.getLabById(req.params.id);
      res.status(200).json({ data: lab });
    } catch (error) {
      handleLabError(error, res);
    }
  },
);

router.patch(
  "/labs/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateLabSchema.parse(req.body);
      const lab = await LabService.updateLab(req.params.id, validated);
      res.status(200).json({ data: lab });
    } catch (error) {
      handleLabError(error, res);
    }
  },
);

router.delete(
  "/labs/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await LabService.deleteLab(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleLabError(error, res);
    }
  },
);

export default router;
