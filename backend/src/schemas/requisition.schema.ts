import { z } from "zod";

const requisitionLineInput = z.object({
  componentId: z.string().min(1, "Component is required"),
  qtyNeeded: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1"),
});

export const createRequisitionSchema = z
  .object({
    type: z.enum(["CLASS", "PERSONAL", "MAINTENANCE"]),
    classSessionId: z.string().min(1).optional(),
    // Ignored for CLASS — the window is taken from the session. Required for
    // the other two, which have no session to derive it from.
    neededFrom: z.coerce.date().optional(),
    neededTo: z.coerce.date().optional(),
    // Optional: a draft may start empty and be built up line by line, which is
    // also how auto-draft (task 3.2) will populate one.
    lines: z.array(requisitionLineInput).optional(),
  })
  .refine((data) => data.type !== "CLASS" || Boolean(data.classSessionId), {
    message: "A class requisition must name a class session",
    path: ["classSessionId"],
  })
  .refine((data) => data.type === "CLASS" || !data.classSessionId, {
    message: "Only a class requisition may name a class session",
    path: ["classSessionId"],
  })
  .refine(
    (data) =>
      data.type === "CLASS" || (Boolean(data.neededFrom) && Boolean(data.neededTo)),
    {
      message: "Personal and maintenance requisitions need a time window",
      path: ["neededFrom"],
    },
  )
  .refine(
    (data) =>
      !data.neededFrom || !data.neededTo || data.neededFrom < data.neededTo,
    {
      // A zero-length window overlaps nothing, so availableToDept() would
      // report the full quota as free against it.
      message: "The window's start must be before its end",
      path: ["neededTo"],
    },
  );

// Only the window is editable. Type and class session define what a
// requisition *is*; changing either would mean deleting and starting again.
export const updateRequisitionSchema = z
  .object({
    neededFrom: z.coerce.date().optional(),
    neededTo: z.coerce.date().optional(),
  })
  .refine(
    (data) => Boolean(data.neededFrom) || Boolean(data.neededTo),
    { message: "Provide at least one field to update" },
  );

export const listRequisitionsQuerySchema = z.object({
  type: z.enum(["CLASS", "PERSONAL", "MAINTENANCE"]).optional(),
  status: z
    .enum([
      "DRAFT",
      "SUBMITTED",
      "READY",
      "AWAITING_BORROW",
      "AWAITING_PURCHASE",
      "ISSUED",
      "RETURNED",
      "REJECTED",
      "CANCELLED",
    ])
    .optional(),
  departmentId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const createRequisitionLineSchema = requisitionLineInput;

export const updateRequisitionLineSchema = z.object({
  qtyNeeded: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1"),
});

export type CreateRequisitionRequest = z.infer<typeof createRequisitionSchema>;
export type UpdateRequisitionRequest = z.infer<typeof updateRequisitionSchema>;
export type ListRequisitionsQuery = z.infer<typeof listRequisitionsQuerySchema>;
export type CreateRequisitionLineRequest = z.infer<
  typeof createRequisitionLineSchema
>;
export type UpdateRequisitionLineRequest = z.infer<
  typeof updateRequisitionLineSchema
>;

const returnRequisitionItemSchema = z
  .object({
    componentId: z.string().min(1, "Component is required"),
    goodQty: z.coerce.number().int().nonnegative().default(0),
    damagedQty: z.coerce.number().int().nonnegative().default(0),
    lostQty: z.coerce.number().int().nonnegative().default(0),
    usedUpQty: z.coerce.number().int().nonnegative().default(0),
  })
  .refine(
    (item) =>
      item.goodQty + item.damagedQty + item.lostQty + item.usedUpQty > 0,
    { message: "At least one quantity must be greater than zero" },
  );

export const returnRequisitionSchema = z
  .object({
    items: z
      .array(returnRequisitionItemSchema)
      .min(1, "At least one item is required"),
  })
  .refine(
    (data) => {
      const ids = data.items.map((item) => item.componentId);
      return new Set(ids).size === ids.length;
    },
    { message: "Duplicate component in return items" },
  );

export type ReturnRequisitionRequest = z.infer<typeof returnRequisitionSchema>;
