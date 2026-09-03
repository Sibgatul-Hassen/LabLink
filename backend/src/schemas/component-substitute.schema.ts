import { z } from "zod";

export const createComponentSubstituteSchema = z.object({
  substituteId: z.string().min(1, "substituteId is required"),
  ratio: z
    .number()
    .int()
    .positive("ratio must be a positive integer")
    .default(1),
  notes: z.string().max(1000).optional().nullable(),
});

export const updateComponentSubstituteSchema = z.object({
  ratio: z
    .number()
    .int()
    .positive("ratio must be a positive integer")
    .optional(),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreateComponentSubstituteRequest = z.infer<
  typeof createComponentSubstituteSchema
>;
export type UpdateComponentSubstituteRequest = z.infer<
  typeof updateComponentSubstituteSchema
>;
