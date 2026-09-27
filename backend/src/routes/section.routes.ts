import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireAcademicScope } from "../middleware/academicScope";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  createSectionSchema,
  listSectionsQuerySchema,
  sectionAssigneeQuerySchema,
  updateSectionSchema,
} from "../schemas/section.schema";
import { SectionService } from "../services/section.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleSectionError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message ?? "Invalid request",
    });
    return;
  }

  if (!(error instanceof Error)) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (error.message === "Forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

  if (error.message === "Section not found") {
    res.status(404).json({ error: "Section not found" });
    return;
  }

  if (error.message === "Course not found") {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  if (error.message === "Instructor not found") {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }

  if (error.message === "Lab assistant not found") {
    res.status(404).json({ error: "Lab assistant not found" });
    return;
  }

  if (
    error.message === "User must have INSTRUCTOR role" ||
    error.message === "User must have LAB_ASSISTANT role"
  ) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (
    error.message ===
    "Section with this course, name, and semester already exists"
  ) {
    res.status(409).json({ error: error.message });
    return;
  }

  if (
    error.message === "Section has routine slots and cannot be deleted"
  ) {
    res.status(409).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

router.post(
  "/sections",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("course", "courseId", "body"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createSectionSchema.parse(req.body);
      const section = await SectionService.createSection(validated);

      res.status(201).json({ data: section });
    } catch (error) {
      handleSectionError(error, res);
    }
  },
);

router.get(
  "/sections",
  requireAuth, requireRole("INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listSectionsQuerySchema.parse(req.query);
      const result = await SectionService.listSections(query, req.user!);

      res.status(200).json(result);
    } catch (error) {
      handleSectionError(error, res);
    }
  },
);

router.get(
  "/sections/assignees",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = sectionAssigneeQuerySchema.parse(req.query);
      const users = await SectionService.listAssignees(query.role, req.user?.role === "DEPT_STORE_HEAD" ? req.user.departmentId : undefined);

      res.status(200).json({ data: users });
    } catch (error) {
      handleSectionError(error, res);
    }
  },
);

router.get(
  "/sections/:id",
  requireAuth, requireRole("INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const section = await SectionService.getSectionById(req.params.id, req.user!);

      res.status(200).json({ data: section });
    } catch (error) {
      handleSectionError(error, res);
    }
  },
);

router.patch(
  "/sections/:id",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("section", "id"),
  requireAcademicScope("course", "courseId", "body", true),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateSectionSchema.parse(req.body);

      const section = await SectionService.updateSection(
        req.params.id,
        validated,
      );

      res.status(200).json({ data: section });
    } catch (error) {
      handleSectionError(error, res);
    }
  },
);

router.delete(
  "/sections/:id",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("section", "id"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await SectionService.deleteSection(req.params.id);

      res.status(204).send();
    } catch (error) {
      handleSectionError(error, res);
    }
  },
);

export default router;
