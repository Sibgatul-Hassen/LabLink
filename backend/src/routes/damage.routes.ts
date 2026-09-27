import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { damageQuerySchema, damageStatusSchema } from "../schemas/damage.schema";
import { DamageService } from "../services/damage.service";
import { AuthenticatedRequest } from "../types";

const router = Router();
const roles = ["LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER"] as const;

function handleError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
  } else if (error instanceof Error && error.message === "Damage report not found") {
    res.status(404).json({ error: error.message });
  } else if (error instanceof Error && error.message === "Forbidden") {
    res.status(403).json({ error: error.message });
  } else if (error instanceof Error && (
    error.message === "Invalid damage status transition" ||
    error.message === "Damage report changed concurrently"
  )) {
    res.status(409).json({ error: error.message });
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    res.status(409).json({ error: "Damage report changed concurrently; please try again" });
  } else {
    res.status(500).json({ error: "Internal server error" });
  }
}

router.get(
  "/damage-reports",
  requireAuth,
  requireRole(...roles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = damageQuerySchema.parse(req.query);
      res.status(200).json(await DamageService.list(req.user!, query.status, query.page, query.limit));
    } catch (error) {
      handleError(error, res);
    }
  },
);

router.patch(
  "/damage-reports/:id",
  requireAuth,
  requireRole("LAB_ASSISTANT"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const data = damageStatusSchema.parse(req.body);
      const report = await DamageService.changeStatus(
        req.params.id, data.status, req.user, data.notes,
      );
      res.status(200).json({ data: report });
    } catch (error) {
      handleError(error, res);
    }
  },
);

export default router;
