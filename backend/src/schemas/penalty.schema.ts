import { z } from "zod";

export const penaltyTypeSchema = z.enum(["LATE", "LOST", "DAMAGED"]);

export const penaltyRateSchema = z.object({
  type: penaltyTypeSchema,
  ratePerDay: z.number().positive().max(1000000).nullable().optional(),
  costFraction: z.number().positive().max(1).nullable().optional(),
  capAmount: z.number().positive().max(1000000).nullable().optional(),
  blockThreshold: z.number().nonnegative().max(1000000).default(0),
}).superRefine((value, context) => {
  if (value.type === "LATE" && value.ratePerDay == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Late rate per day is required" });
  }
  if (value.type !== "LATE" && value.costFraction == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Cost fraction is required" });
  }
});

export const penaltyQuerySchema = z.object({
  status: z.enum(["OUTSTANDING", "PAID", "WAIVED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const payPenaltySchema = z.object({
  receiptRef: z.string().trim().min(1).max(100),
});

export const waivePenaltySchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export type PenaltyRateInput = z.infer<typeof penaltyRateSchema>;
