import { z } from "zod";

const borrowLineInput = z.object({
  componentId: z.string().min(1, "Component is required"),
  qtyRequested: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1"),
});

export const createBorrowRequestSchema = z
  .object({
    requisitionId: z.string().min(1, "Requisition is required"),
    lenderDeptId: z.string().min(1, "Lender department is required"),
    returnBy: z.coerce.date(),
    remarks: z.string().max(1000).optional(),
    lines: z.array(borrowLineInput).min(1, "At least one line is required"),
  })
  .refine(
    (data) => {
      const ids = data.lines.map((line) => line.componentId);
      return new Set(ids).size === ids.length;
    },
    { message: "Duplicate component in borrow lines", path: ["lines"] },
  );

export const listBorrowRequestsQuerySchema = z.object({
  status: z
    .enum([
      "REQUESTED",
      "APPROVED",
      "REJECTED",
      "HANDED_OVER",
      "RETURNED",
      "CANCELLED",
    ])
    .optional(),
  direction: z.enum(["LENDING", "BORROWING"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateBorrowRequest = z.infer<typeof createBorrowRequestSchema>;
export type ListBorrowRequestsQuery = z.infer<
  typeof listBorrowRequestsQuerySchema
>;
