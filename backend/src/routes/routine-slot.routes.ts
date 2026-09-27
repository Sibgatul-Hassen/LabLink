import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireAcademicScope } from "../middleware/academicScope";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import { importRoutineSlotsSchema } from "../schemas/routine-import.schema";
import {
  createRoutineSlotSchema,
  listRoutineSlotsQuerySchema,
  updateRoutineSlotSchema,
} from "../schemas/routine-slot.schema";
import {
  CsvFormatError,
  RoutineImportService,
} from "../services/routine-import.service";
import { RoutineSlotService } from "../services/routine-slot.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleRoutineSlotError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  // A problem with the file itself, as opposed to a problem with one row.
  if (error instanceof CsvFormatError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (!(error instanceof Error)) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (error.message === "Forbidden") { res.status(403).json({ error: "Forbidden" }); return; }

  if (error.message === "Routine slot not found") {
    res.status(404).json({ error: "Routine slot not found" });
    return;
  }

  if (error.message === "Section not found") {
    res.status(404).json({ error: "Section not found" });
    return;
  }

  if (error.message === "Lab not found") {
    res.status(404).json({ error: "Lab not found" });
    return;
  }

  if (
    error.message === "Start time must be before end time" ||
    error.message ===
      "Effective from date must be on or before the effective to date"
  ) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (
    error.message ===
      "This lab is already booked for an overlapping time slot" ||
    error.message ===
      "This section already has a class at an overlapping time slot" ||
    error.message === "Routine slot has class sessions and cannot be deleted"
  ) {
    res.status(409).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

router.post(
  "/routine-slots",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("section", "sectionId", "body"),
  requireAcademicScope("lab", "labId", "body"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createRoutineSlotSchema.parse(req.body);
      const routineSlot = await RoutineSlotService.createRoutineSlot(validated);
      res.status(201).json({ data: routineSlot });
    } catch (error) {
      handleRoutineSlotError(error, res);
    }
  },
);

router.get(
  "/routine-slots",
  requireAuth, requireRole("INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listRoutineSlotsQuerySchema.parse(req.query);
      const result = await RoutineSlotService.listRoutineSlots(query, req.user!);
      res.status(200).json(result);
    } catch (error) {
      handleRoutineSlotError(error, res);
    }
  },
);

router.get(
  "/routine-slots/:id",
  requireAuth, requireRole("INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const routineSlot = await RoutineSlotService.getRoutineSlotById(
        req.params.id,
        req.user!,
      );
      res.status(200).json({ data: routineSlot });
    } catch (error) {
      handleRoutineSlotError(error, res);
    }
  },
);

router.patch(
  "/routine-slots/:id",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("routine", "id"),
  requireAcademicScope("section", "sectionId", "body", true),
  requireAcademicScope("lab", "labId", "body", true),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateRoutineSlotSchema.parse(req.body);
      const routineSlot = await RoutineSlotService.updateRoutineSlot(
        req.params.id,
        validated,
      );
      res.status(200).json({ data: routineSlot });
    } catch (error) {
      handleRoutineSlotError(error, res);
    }
  },
);

router.delete(
  "/routine-slots/:id",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  requireAcademicScope("routine", "id"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await RoutineSlotService.deleteRoutineSlot(req.params.id);
      res.status(204).send();
    } catch (error) {
      handleRoutineSlotError(error, res);
    }
  },
);

// ─────────────── CSV import ───────────────

// Returns 200 even when individual rows fail. A partially successful import is
// a successful request reporting mixed results; a 400 would imply nothing was
// written, which would be false. Only a malformed file itself gives 400.
router.post(
  "/routine-slots/import",
  requireAuth,
  requireRole("DEPT_STORE_HEAD"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { csv } = importRoutineSlotsSchema.parse(req.body);
      const result = await RoutineImportService.importRoutineSlots(csv, req.user?.departmentId);
      res.status(200).json({ data: result });
    } catch (error) {
      handleRoutineSlotError(error, res);
    }
  },
);

export default router;
