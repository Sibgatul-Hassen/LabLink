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

export const findLendersQuerySchema = z
  .object({
    componentId: z.string().min(1, "Component is required"),
    qtyNeeded: z.coerce
      .number()
      .int("Quantity must be a whole number")
      .positive("Quantity must be at least 1"),
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
    excludeDeptId: z.string().min(1, "Department to exclude is required"),
  })
  .refine((data) => data.windowStart < data.windowEnd, {
    message: "The window's start must be before its end",
    path: ["windowEnd"],
  });

export type FindLendersQuery = z.infer<typeof findLendersQuerySchema>;

export const approveBorrowSchema = z.object({
  approvedQty: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Approved quantity must be at least 1"),
});

export const rejectBorrowSchema = z.object({
  reason: z.string().min(1, "A reason is required").max(1000),
});

export type ApproveBorrowRequest = z.infer<typeof approveBorrowSchema>;
export type RejectBorrowRequest = z.infer<typeof rejectBorrowSchema>;
