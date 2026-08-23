import { z } from "zod";

// Strict zero-padded 24-hour "HH:MM". The service compares these as strings,
// which only orders correctly when the format is exact.
const timeOfDay = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "Time must be in HH:MM format, for example 08:30",
  );

const routineSlotFields = z.object({
  sectionId: z.string().min(1, "Section is required"),
  labId: z.string().min(1, "Lab is required"),
  dayOfWeek: z.coerce
    .number()
    .int("Day of week must be an integer")
    .min(0, "Day of week must be between 0 and 6")
    .max(6, "Day of week must be between 0 and 6"),
  startTime: timeOfDay,
  endTime: timeOfDay,
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date(),
});

export const createRoutineSlotSchema = routineSlotFields
  .refine((data) => data.startTime < data.endTime, {
    message: "Start time must be before end time",
    path: ["endTime"],
  })
  .refine((data) => data.effectiveFrom <= data.effectiveTo, {
    message: "Effective from date must be on or before the effective to date",
    path: ["effectiveTo"],
  });

export const updateRoutineSlotSchema = routineSlotFields
  .partial()
  .refine(
    (data) =>
      data.startTime === undefined ||
      data.endTime === undefined ||
      data.startTime < data.endTime,
    {
      message: "Start time must be before end time",
      path: ["endTime"],
    },
  )
  .refine(
    (data) =>
      data.effectiveFrom === undefined ||
      data.effectiveTo === undefined ||
      data.effectiveFrom <= data.effectiveTo,
    {
      message: "Effective from date must be on or before the effective to date",
      path: ["effectiveTo"],
    },
  );

export const listRoutineSlotsQuerySchema = z.object({
  sectionId: z.string().optional(),
  labId: z.string().optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateRoutineSlotRequest = z.infer<typeof createRoutineSlotSchema>;
export type UpdateRoutineSlotRequest = z.infer<typeof updateRoutineSlotSchema>;
export type ListRoutineSlotsQuery = z.infer<typeof listRoutineSlotsQuerySchema>;
