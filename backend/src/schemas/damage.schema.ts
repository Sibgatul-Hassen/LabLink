import { z } from "zod";

export const damageQuerySchema = z.object({
  status: z.enum(["REPORTED", "UNDER_MAINTENANCE", "REPAIRED", "WRITTEN_OFF"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const damageStatusSchema = z.object({
  status: z.enum(["UNDER_MAINTENANCE", "REPAIRED", "WRITTEN_OFF"]),
  notes: z.string().trim().max(1000).optional(),
});
