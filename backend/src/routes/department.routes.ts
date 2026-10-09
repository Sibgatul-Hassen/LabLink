import { Router, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  createDepartmentSchema,
  listDepartmentsQuerySchema,
  updateDepartmentSchema,
} from "../schemas/department.schema";
import { DepartmentService } from "../services/department.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

// POST /api/departments - Create (SYSTEM_ADMIN only)
router.post(
  "/departments",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createDepartmentSchema.parse(req.body);
      const department = await DepartmentService.createDepartment(validated);

      res.status(201).json({ data: department });
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

// GET /api/departments - List (all authenticated users)
router.get(
  "/departments",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listDepartmentsQuerySchema.parse(req.query);
      const result = await DepartmentService.listDepartments(query);

      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: "Invalid query parameters" });
    }
  },
);

// GET /api/departments/:id - Get one (all authenticated users)
router.get(
  "/departments/:id",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const department = await DepartmentService.getDepartmentById(
        req.params.id,
      );

      res.status(200).json({ data: department });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Department not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// PATCH /api/departments/:id - Update (SYSTEM_ADMIN only)
router.patch(
  "/departments/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateDepartmentSchema.parse(req.body);
      const department = await DepartmentService.updateDepartment(
        req.params.id,
        validated,
      );

      res.status(200).json({ data: department });
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

// DELETE /api/departments/:id - Soft delete (SYSTEM_ADMIN only)
router.delete(
  "/departments/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await DepartmentService.deleteDepartment(req.params.id);

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

export default router;
