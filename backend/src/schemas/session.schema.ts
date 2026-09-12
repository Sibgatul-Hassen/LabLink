import { z } from "zod";

export const generateSessionsSchema = z.object({
  // Feature 37 specifies 21 days; the parameter exists so tests can use a
  // short horizon without waiting on three weeks of dates.
  horizonDays: z.coerce
    .number()
    .int("Horizon must be an integer")
    .positive("Horizon must be at least 1 day")
    .max(365, "Horizon cannot exceed 365 days")
    .default(21),
});

export const listSessionsQuerySchema = z.object({
  labId: z.string().optional(),
  sectionId: z.string().optional(),
  courseId: z.string().optional(),
  status: z.enum(["SCHEDULED", "RUNNING", "COMPLETED", "CANCELLED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// null clears the assignment, so the instructor can undo a mistake.
export const assignExperimentSchema = z.object({
  experimentId: z.string().min(1).nullable(),
});

export type GenerateSessionsRequest = z.infer<typeof generateSessionsSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type AssignExperimentRequest = z.infer<typeof assignExperimentSchema>;
