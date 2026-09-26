import { Router, Response } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import { departmentScope } from "../middleware/scope";
import {
  generateQuotaSuggestionsSchema,
  listQuotaHistoryQuerySchema,
  listQuotasQuerySchema,
  updateQuotaSchema,
} from "../schemas/quota.schema";
import { QuotaService } from "../services/quota.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function getScopedDepartmentId(
  req: AuthenticatedRequest,
): string | null | undefined {
  const value = req.scope?.departmentId;

  if (typeof value === "string" || value === null) {
    return value;
  }

  return undefined;
}

// GET /api/quotas - List quotas with department scoping
router.get(
  "/quotas",
  requireAuth, requireRole(...ALL_ROLES),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listQuotasQuerySchema.parse(req.query);

      const result = await QuotaService.listQuotas(
        query,
        getScopedDepartmentId(req),
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid query parameters" });
      } else if (
        error instanceof Error &&
        (
          error.message.includes("Forbidden department access") ||
          error.message.includes("No department assigned")
        )
      ) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// POST /api/quotas/suggestions - Generate automatic quota suggestions
// CENTRAL_STORE_OFFICER and SYSTEM_ADMIN only
router.post(
  "/quotas/suggestions",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = generateQuotaSuggestionsSchema.parse(req.body);

      const result = await QuotaService.generateSuggestions(validated);

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: error.issues[0]?.message ?? "Invalid request body",
        });
      } else if (
        error instanceof Error &&
        error.message.includes("Department not found")
      ) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// GET /api/quotas/:departmentId/:componentId/history
router.get(
  "/quotas/:departmentId/:componentId/history",
  requireAuth, requireRole(...ALL_ROLES),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listQuotaHistoryQuerySchema.parse(req.query);

      const result = await QuotaService.listHistory(
        req.params.departmentId,
        req.params.componentId,
        query,
        getScopedDepartmentId(req),
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid query parameters" });
      } else if (error instanceof Error) {
        if (
          error.message.includes("Forbidden department access") ||
          error.message.includes("No department assigned")
        ) {
          res.status(403).json({ error: error.message });
        } else if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// GET /api/quotas/:departmentId/:componentId
router.get(
  "/quotas/:departmentId/:componentId",
  requireAuth, requireRole(...ALL_ROLES),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const quota = await QuotaService.getQuota(
        req.params.departmentId,
        req.params.componentId,
        getScopedDepartmentId(req),
      );

      res.status(200).json({ data: quota });
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes("Forbidden department access") ||
          error.message.includes("No department assigned")
        ) {
          res.status(403).json({ error: error.message });
        } else if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// PATCH /api/quotas/:departmentId/:componentId
// CENTRAL_STORE_OFFICER and SYSTEM_ADMIN only
router.patch(
  "/quotas/:departmentId/:componentId",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = updateQuotaSchema.parse(req.body);

      const quota = await QuotaService.updateQuota(
        req.params.departmentId,
        req.params.componentId,
        validated,
        req.user.id,
      );

      res.status(200).json({ data: quota });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid request body" });
      } else if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else if (error.message.includes("Reason is required")) {
          res.status(400).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

export default router;
