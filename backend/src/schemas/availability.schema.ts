import { z } from "zod";

export const availabilityQuerySchema = z
  .object({
    componentId: z.string().min(1, "Component is required"),
    // Optional: privileged roles may ask about any department. Everyone else
    // is forced to their own in the route.
    departmentId: z.string().optional(),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((data) => data.from < data.to, {
    // A zero-length or inverted window overlaps nothing, so every claim would
    // be ignored and the answer would look falsely generous.
    message: "The window's start must be before its end",
    path: ["to"],
  });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
