import { z } from "zod";

export const importRoutineSlotsSchema = z.object({
  csv: z.string().min(1, "CSV content is required"),
});

export type ImportRoutineSlotsRequest = z.infer<
  typeof importRoutineSlotsSchema
>;
