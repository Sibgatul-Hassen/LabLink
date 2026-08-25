import { z } from "zod";

export const createExperimentSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  number: z.coerce
    .number()
    .int("Experiment number must be an integer")
    .positive("Experiment number must be positive"),
  title: z.string().min(1, "Title is required").max(255),
});

export const updateExperimentSchema = createExperimentSchema.partial();

export const listExperimentsQuerySchema = z.object({
  search: z.string().optional(),
  courseId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// qtyPerGroup is the multiplicand behind every auto-drafted requisition
// quantity, so zero or negative values are rejected outright.
export const createExperimentItemSchema = z.object({
  componentId: z.string().min(1, "Component is required"),
  qtyPerGroup: z.coerce
    .number()
    .int("Quantity per group must be an integer")
    .positive("Quantity per group must be at least 1"),
});

export const updateExperimentItemSchema = createExperimentItemSchema.partial();

export type CreateExperimentRequest = z.infer<typeof createExperimentSchema>;
export type UpdateExperimentRequest = z.infer<typeof updateExperimentSchema>;
export type ListExperimentsQuery = z.infer<typeof listExperimentsQuerySchema>;
export type CreateExperimentItemRequest = z.infer<typeof createExperimentItemSchema>;
export type UpdateExperimentItemRequest = z.infer<typeof updateExperimentItemSchema>;
