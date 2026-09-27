import { Router, Response } from "express";

import { requireAuth } from "../middleware/auth";
import { requireAcademicScope } from "../middleware/academicScope";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from "../schemas/course.schema";
import { CourseService } from "../services/course.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

// Department heads create courses in their own department.
router.post(
  "/courses",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("department", "departmentId", "body"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createCourseSchema.parse(req.body);
      const course = await CourseService.createCourse(validated);

      res.status(201).json({ data: course });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Department not found")) {
          res.status(404).json({ error: "Department not found" });
        } else if (error.message.includes("already exists")) {
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

// Academic readers are scoped by assignment or department.
router.get(
  "/courses",
  requireAuth, requireRole("INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listCoursesQuerySchema.parse(req.query);
      const result = await CourseService.listCourses(query, req.user!);

      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: "Invalid query parameters" });
    }
  },
);

// Read one course within the actor's academic scope.
router.get(
  "/courses/:id",
  requireAuth, requireRole("INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const course = await CourseService.getCourseById(req.params.id, req.user!);

      res.status(200).json({ data: course });
    } catch (error) {
      if (error instanceof Error && error.message === "Forbidden") {
        res.status(403).json({ error: "Forbidden" });
      } else if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Course not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// Department heads update courses in their own department.
router.patch(
  "/courses/:id",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("course", "id"),
  requireAcademicScope("department", "departmentId", "body", true),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateCourseSchema.parse(req.body);

      const course = await CourseService.updateCourse(req.params.id, validated);

      res.status(200).json({ data: course });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Course not found")) {
          res.status(404).json({ error: "Course not found" });
        } else if (error.message.includes("Department not found")) {
          res.status(404).json({ error: "Department not found" });
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

// Department heads soft delete courses in their own department.
router.delete(
  "/courses/:id",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("course", "id"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await CourseService.deleteCourse(req.params.id);

      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Course not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

export default router;
