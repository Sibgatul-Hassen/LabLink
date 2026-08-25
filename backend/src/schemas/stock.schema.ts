import { z } from "zod";

export const listStocksQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  lowStockOnly: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateReorderPointSchema = z.object({
  reorderPoint: z.number().int().nonnegative("Reorder point must be non-negative"),
});

export const adjustStockSchema = z.object({
  qty: z
    .number()
    .int("Quantity must be an integer")
    .refine((value) => value !== 0, "Quantity cannot be zero"),
  note: z.string().max(500).optional(),
});

export const listStockMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListStocksQuery = z.infer<typeof listStocksQuerySchema>;
export type UpdateReorderPointRequest = z.infer<
  typeof updateReorderPointSchema
>;
export type AdjustStockRequest = z.infer<typeof adjustStockSchema>;
export type ListStockMovementsQuery = z.infer<
  typeof listStockMovementsQuerySchema
>;
