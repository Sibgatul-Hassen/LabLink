import { z } from "zod";

export const createCourseSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  title: z.string().min(1, "Title is required").max(255),
  departmentId: z.string().min(1, "Department is required"),
});

export const updateCourseSchema = createCourseSchema.partial();

export const listCoursesQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateCourseRequest = z.infer<typeof createCourseSchema>;
export type UpdateCourseRequest = z.infer<typeof updateCourseSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
