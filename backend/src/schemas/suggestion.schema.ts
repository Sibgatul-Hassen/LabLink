import { z } from "zod";

export const suggestionQuerySchema = z.object({
  type: z.enum([
    "SUBSTITUTE", "REORDER_POINT", "QUOTA", "ITEM_LIST",
    "SHORTAGE_ALERT", "COLLECTION_RISK", "SLOT",
  ]).optional(),
  status: z.enum(["PENDING", "ACCEPTED", "DISMISSED", "EXPIRED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const suggestionDecisionSchema = z.object({
  accepted: z.boolean(),
  note: z.string().trim().max(1000).optional(),
});
