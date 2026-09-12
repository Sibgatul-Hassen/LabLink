import { z } from "zod";

export const createComponentSchema = z.object({
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  category: z.string().min(1, "Category is required").max(100),
  sizeClass: z.enum(["EXPENSIVE", "SMALL"] as const),
  unit: z.string().min(1, "Unit is required").max(50).default("pcs"),
  unitCost: z.number().nonnegative("Unit cost must be non-negative").optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  isReturnable: z.boolean().default(true),
});

export const updateComponentSchema = createComponentSchema.partial();

export const listComponentsQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateComponentRequest = z.infer<typeof createComponentSchema>;
export type UpdateComponentRequest = z.infer<typeof updateComponentSchema>;
export type ListComponentsQuery = z.infer<typeof listComponentsQuerySchema>;
