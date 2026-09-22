import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  peakClassesQuerySchema,
  shortageFrequencyQuerySchema,
  lendingNetworkQuerySchema,
} from "../schemas/analytics.schema";
import { AnalyticsService } from "../services/analytics.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleAnalyticsError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

// Capacity planning, so the audience is the roles that size quotas — not
// students or lab assistants. A department store head is scoped to their own
// department per feature 5; the office-level roles see every department.
router.get(
  "/analytics/peak-classes",
  requireAuth,
  requireRole(
    "DEPT_STORE_HEAD",
    "CENTRAL_STORE_OFFICER",
    "OFFICE_ADMIN",
    "SYSTEM_ADMIN",
  ),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = peakClassesQuerySchema.parse(req.query);

      if (req.user.role === "DEPT_STORE_HEAD") {
        if (!req.user.departmentId) {
          res
            .status(403)
            .json({ error: "No department assigned to this account" });
          return;
        }

        query.departmentId = req.user.departmentId;
      }

      const result = await AnalyticsService.peakClasses(query);

      res.status(200).json(result);
    } catch (error) {
      handleAnalyticsError(error, res);
    }
  },
);

router.get(
  "/analytics/shortage-frequency",
  requireAuth,
  requireRole(
    "DEPT_STORE_HEAD",
    "CENTRAL_STORE_OFFICER",
    "OFFICE_ADMIN",
    "SYSTEM_ADMIN",
  ),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = shortageFrequencyQuerySchema.parse(req.query);

      if (req.user.role === "DEPT_STORE_HEAD") {
        if (!req.user.departmentId) {
          res
            .status(403)
            .json({ error: "No department assigned to this account" });
          return;
        }

        query.departmentId = req.user.departmentId;
      }

      const result = await AnalyticsService.shortageFrequency(query);

      res.status(200).json(result);
    } catch (error) {
      handleAnalyticsError(error, res);
    }
  },
);

router.get(
  "/analytics/lending-network",
  requireAuth,
  requireRole(
    "DEPT_STORE_HEAD",
    "CENTRAL_STORE_OFFICER",
    "OFFICE_ADMIN",
    "SYSTEM_ADMIN",
  ),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = lendingNetworkQuerySchema.parse(req.query);

      if (req.user.role === "DEPT_STORE_HEAD") {
        if (!req.user.departmentId) {
          res
            .status(403)
            .json({ error: "No department assigned to this account" });
          return;
        }

        query.departmentId = req.user.departmentId;
      }

      const result = await AnalyticsService.lendingNetwork(query);

      res.status(200).json(result);
    } catch (error) {
      handleAnalyticsError(error, res);
    }
  },
);

export default router;
