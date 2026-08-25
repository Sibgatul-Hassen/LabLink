import { z } from "zod";

export const createSectionSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  name: z.string().min(1, "Section name is required").max(50),
  semester: z.string().min(1, "Semester is required").max(100),
  studentCount: z.coerce
    .number()
    .int("Student count must be an integer")
    .min(0, "Student count cannot be negative"),
  instructorId: z.string().min(1).nullable().optional(),
  labAssistantId: z.string().min(1).nullable().optional(),
});

export const sectionAssigneeQuerySchema = z.object({
  role: z.enum(["INSTRUCTOR", "LAB_ASSISTANT"]),
});

export const updateSectionSchema = createSectionSchema.partial();

export const listSectionsQuerySchema = z.object({
  search: z.string().optional(),
  courseId: z.string().optional(),
  semester: z.string().optional(),
  instructorId: z.string().optional(),
  labAssistantId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateSectionRequest = z.infer<typeof createSectionSchema>;
export type UpdateSectionRequest = z.infer<typeof updateSectionSchema>;
export type ListSectionsQuery = z.infer<typeof listSectionsQuerySchema>;
