import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { availabilityQuerySchema } from "../schemas/availability.schema";
import { AvailabilityService } from "../services/availability.service";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../types";
import { Role } from "@prisma/client";

const router = Router();

// The same list scope.ts uses. These roles see every department; everyone else
// is confined to their own.
const UNSCOPED_ROLES: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
];

function handleAvailabilityError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  if (!(error instanceof Error)) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (
    error.message === "Component not found" ||
    error.message === "Department not found"
  ) {
    res.status(404).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

// Open to every authenticated role. Proposal section 6 gives STUDENT the
// ability to "check availability" — it is one of the three things a student
// can do at all.
router.get(
  "/availability",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = availabilityQuerySchema.parse(req.query);

      let departmentId: string;

      if (UNSCOPED_ROLES.includes(req.user.role)) {
        // May ask about any department; falls back to their own if they have
        // one and did not specify.
        const requested = query.departmentId ?? req.user.departmentId;

        if (!requested) {
          res.status(400).json({
            error: "Specify a departmentId — your account is not tied to one",
          });
          return;
        }

        departmentId = requested;
      } else {
        // Scoped roles cannot ask about anyone else, whatever the query says.
        if (!req.user.departmentId) {
          res.status(403).json({ error: "No department assigned to this account" });
          return;
        }

        departmentId = req.user.departmentId;
      }

      // Without these checks a typo'd id would return quota 0, onHand 0 and
      // "available: 0" — indistinguishable from a real shortage.
      const [component, department] = await Promise.all([
        prisma.component.findUnique({ where: { id: query.componentId } }),
        prisma.department.findUnique({ where: { id: departmentId } }),
      ]);

      if (!component || !component.isActive) {
        throw new Error("Component not found");
      }

      if (!department || !department.isActive) {
        throw new Error("Department not found");
      }

      const result = await AvailabilityService.breakdown(
        departmentId,
        query.componentId,
        { from: query.from, to: query.to },
      );

      res.status(200).json({ data: result });
    } catch (error) {
      handleAvailabilityError(error, res);
    }
  },
);

export default router;
