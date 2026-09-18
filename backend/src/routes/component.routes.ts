import { Router, Response } from "express";
import { ComponentService } from "../services/component.service";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { departmentScope } from "../middleware/scope";
import {
  createComponentSchema,
  updateComponentSchema,
  listComponentsQuerySchema,
} from "../schemas/component.schema";
import { AuthenticatedRequest } from "../types";
import { ComponentSubstituteService } from "../services/component-substitute.service";
import {
  createComponentSubstituteSchema,
  updateComponentSubstituteSchema,
} from "../schemas/component-substitute.schema";

const router = Router();

// POST /api/components - Create (CENTRAL_STORE_OFFICER, SYSTEM_ADMIN only)
router.post(
  "/components",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createComponentSchema.parse(req.body);
      const component = await ComponentService.createComponent(validated);
      res.status(201).json({ data: component });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("already exists")) {
          res.status(409).json({ error: error.message });
        } else if (error.message.includes("required")) {
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

// GET /api/components - List (all authenticated users)
router.get(
  "/components",
  requireAuth,
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listComponentsQuerySchema.parse(req.query);
      const result = await ComponentService.listComponents(query);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: "Invalid query parameters" });
    }
  },
);

// GET /api/components/export/csv - Export components as CSV
router.get(
  "/components/export/csv",
  requireAuth,
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listComponentsQuerySchema.parse(req.query);
      const csv = await ComponentService.exportCsv(query);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="components.csv"',
      );
      res.status(200).send(csv);
    } catch (error) {
      res.status(400).json({ error: "Invalid query parameters" });
    }
  },
);

// GET /api/components/:id - Get one (all authenticated users)
router.get(
  "/components/:id",
  requireAuth,
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const component = await ComponentService.getComponentById(req.params.id);
      res.status(200).json({ data: component });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Component not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// PATCH /api/components/:id - Update (CENTRAL_STORE_OFFICER, SYSTEM_ADMIN only)
router.patch(
  "/components/:id",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateComponentSchema.parse(req.body);
      const component = await ComponentService.updateComponent(
        req.params.id,
        validated,
      );
      res.status(200).json({ data: component });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else if (error.message.includes("already exists")) {
          res.status(409).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// DELETE /api/components/:id - Delete (SYSTEM_ADMIN only)
router.delete(
  "/components/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await ComponentService.deleteComponent(req.params.id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);
router.get(
  "/components/:id/substitutes",
  requireAuth,
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const substitutes = await ComponentSubstituteService.listSubstitutes(
        req.params.id,
      );
      res.status(200).json({ data: substitutes });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/components/:id/substitutes",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createComponentSubstituteSchema.parse(req.body);
      const substitutes = await ComponentSubstituteService.addSubstitute(
        req.params.id,
        validated,
        req.user?.id,
      );
      res.status(201).json({ data: substitutes });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "ZodError"
      ) {
        res.status(400).json({ error: "Invalid request data" });
      } else if (error instanceof Error) {
        if (error.message === "SELF_SUBSTITUTE") {
          res
            .status(409)
            .json({ error: "A component cannot substitute for itself." });
        } else if (error.message === "DUPLICATE_PAIR") {
          res
            .status(409)
            .json({ error: "This substitution pair already exists." });
        } else if (error.message === "SUBSTITUTE_NOT_FOUND") {
          res.status(404).json({ error: "Substitute component not found" });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

router.patch(
  "/components/:id/substitutes/:subId",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateComponentSubstituteSchema.parse(req.body);
      const substitutes = await ComponentSubstituteService.updateSubstitute(
        req.params.id,
        req.params.subId,
        validated,
      );
      res.status(200).json({ data: substitutes });
    } catch (error) {
      if (error instanceof Error && error.message === "PAIR_NOT_FOUND") {
        res.status(404).json({ error: "Substitution pair not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

router.delete(
  "/components/:id/substitutes/:subId",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  departmentScope,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const substitutes = await ComponentSubstituteService.removeSubstitute(
        req.params.id,
        req.params.subId,
      );
      res.status(200).json({ data: substitutes });
    } catch (error) {
      if (error instanceof Error && error.message === "PAIR_NOT_FOUND") {
        res.status(404).json({ error: "Substitution pair not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

export default router;
