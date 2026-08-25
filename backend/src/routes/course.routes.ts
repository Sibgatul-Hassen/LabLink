import { Router, Response } from "express";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from "../schemas/course.schema";
import { CourseService } from "../services/course.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

// POST /api/courses - Create (SYSTEM_ADMIN only)
router.post(
  "/courses",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
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

// GET /api/courses - List (all authenticated users)
router.get(
  "/courses",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listCoursesQuerySchema.parse(req.query);
      const result = await CourseService.listCourses(query);

      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ error: "Invalid query parameters" });
    }
  },
);

// GET /api/courses/:id - Get one (all authenticated users)
router.get(
  "/courses/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const course = await CourseService.getCourseById(req.params.id);

      res.status(200).json({ data: course });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Course not found" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// PATCH /api/courses/:id - Update (SYSTEM_ADMIN only)
router.patch(
  "/courses/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
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

// DELETE /api/courses/:id - Soft delete (SYSTEM_ADMIN only)
router.delete(
  "/courses/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
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
