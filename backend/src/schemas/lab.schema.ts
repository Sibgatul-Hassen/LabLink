import { z } from "zod";

export const createLabSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  roomNo: z.string().min(1, "Room number is required").max(50),
  groupSize: z.coerce
    .number()
    .int("Group size must be an integer")
    .positive("Group size must be positive")
    .default(4),
  departmentId: z.string().min(1, "Department is required"),
  labAssistantId: z.string().min(1).nullable().optional(),
});

export const updateLabSchema = createLabSchema.partial();

export const listLabsQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateLabRequest = z.infer<typeof createLabSchema>;
export type UpdateLabRequest = z.infer<typeof updateLabSchema>;
export type ListLabsQuery = z.infer<typeof listLabsQuerySchema>;
