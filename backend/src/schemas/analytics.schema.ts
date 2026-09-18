import { z } from "zod";

// Omitting from/to considers every generated session. Narrowing to a single
// week gives the same answer in practice, since the routine repeats weekly —
// the range exists so a caller can ask about a specific stretch of term.
export const peakClassesQuerySchema = z.object({
  departmentId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type PeakClassesQuery = z.infer<typeof peakClassesQuerySchema>;

export const shortageFrequencyQuerySchema = z.object({
  departmentId: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export type ShortageFrequencyQuery = z.infer<typeof shortageFrequencyQuerySchema>;
