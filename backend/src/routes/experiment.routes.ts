import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  createExperimentItemSchema,
  createExperimentSchema,
  listExperimentsQuerySchema,
  updateExperimentItemSchema,
  updateExperimentSchema,
} from "../schemas/experiment.schema";
import { ExperimentService } from "../services/experiment.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleExperimentError(error: unknown, res: Response): void {
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
    error.message === "Experiment not found" ||
    error.message === "Experiment item not found" ||
    error.message === "Course not found" ||
    error.message === "Component not found"
  ) {
    res.status(404).json({ error: error.message });
    return;
  }

  if (
    error.message ===
      "Experiment with this number already exists for the course" ||
    error.message === "This component is already on the experiment item list" ||
    error.message ===
      "Experiment is assigned to class sessions and cannot be deleted"
  ) {
    res.status(409).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

router.post(
  "/experiments",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createExperimentSchema.parse(req.body);
      const experiment = await ExperimentService.createExperiment(validated);
      res.status(201).json({ data: experiment });
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

router.get(
  "/experiments",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listExperimentsQuerySchema.parse(req.query);
      const result = await ExperimentService.listExperiments(query);
      res.status(200).json(result);
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

router.get(
  "/experiments/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const experiment = await ExperimentService.getExperimentById(
        req.params.id,
      );
      res.status(200).json({ data: experiment });
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

router.patch(
  "/experiments/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateExperimentSchema.parse(req.body);
      const experiment = await ExperimentService.updateExperiment(
        req.params.id,
        validated,
      );
      res.status(200).json({ data: experiment });
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

router.delete(
  "/experiments/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await ExperimentService.deleteExperiment(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

// ─────────────── item list ───────────────

router.post(
  "/experiments/:id/items",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createExperimentItemSchema.parse(req.body);
      const experiment = await ExperimentService.addItem(
        req.params.id,
        validated,
      );
      res.status(201).json({ data: experiment });
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

router.patch(
  "/experiments/:id/items/:itemId",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateExperimentItemSchema.parse(req.body);
      const experiment = await ExperimentService.updateItem(
        req.params.id,
        req.params.itemId,
        validated,
      );
      res.status(200).json({ data: experiment });
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

router.delete(
  "/experiments/:id/items/:itemId",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await ExperimentService.deleteItem(req.params.id, req.params.itemId);
      res.status(204).send();
    } catch (error) {
      handleExperimentError(error, res);
    }
  },
);

export default router;
