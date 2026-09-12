import { z } from "zod";

/**
 * Task 5.8. The brief's createPurchaseRequestSchema names a qtyRequested
 * field and a reason field — PurchaseRequest actually has qtyNeeded (not
 * qtyRequested) and no reason column at all. The reason is still accepted
 * as input; PurchaseService.createPurchaseRequest stores it on the first
 * ApprovalStep's remarks, since that is the only free-text field anywhere
 * on this pair of models.
 */
export const createPurchaseRequestSchema = z.object({
  componentId: z.string().min(1, "Component is required"),
  qtyRequested: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1"),
  reason: z.string().min(1, "A reason is required").max(1000),
  requisitionId: z.string().min(1).optional(),
});

export const listPurchaseRequestsQuerySchema = z.object({
  status: z
    .enum(["PENDING", "APPROVED", "RECEIVED", "REJECTED", "CANCELLED"])
    .optional(),
  urgency: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreatePurchaseRequestInput = z.infer<
  typeof createPurchaseRequestSchema
>;
export type ListPurchaseRequestsQuery = z.infer<
  typeof listPurchaseRequestsQuerySchema
>;
