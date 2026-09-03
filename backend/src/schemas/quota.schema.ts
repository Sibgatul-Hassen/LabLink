import { z } from "zod";

export const listQuotasQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.string().optional(),
  componentId: z.string().optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateQuotaSchema = z
  .object({
    qty: z
      .number()
      .int("Quota quantity must be an integer")
      .nonnegative("Quota quantity must be non-negative")
      .optional(),
    suggestedQty: z
      .number()
      .int("Suggested quantity must be an integer")
      .nonnegative("Suggested quantity must be non-negative")
      .optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (data) => data.qty !== undefined || data.suggestedQty !== undefined,
    {
      message: "At least one quota value must be provided",
    },
  );

export const listQuotaHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListQuotasQuery = z.infer<typeof listQuotasQuerySchema>;
export type UpdateQuotaRequest = z.infer<typeof updateQuotaSchema>;
export type ListQuotaHistoryQuery = z.infer<
  typeof listQuotaHistoryQuerySchema
>;
