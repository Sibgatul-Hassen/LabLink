import { Router, Response } from "express";
import { z, ZodError } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { AuthenticatedRequest } from "../types";

const router = Router();
const querySchema = z.object({
  entityType: z.string().max(80).optional(),
  actorId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

router.get("/audit-logs", requireAuth, requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = querySchema.parse(req.query);
      const where = { ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}) };
      const [data, total] = await Promise.all([
        prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit, take: query.limit }),
        prisma.auditLog.count({ where }),
      ]);
      res.status(200).json({ data, total, page: query.page, limit: query.limit });
    } catch (error) {
      if (error instanceof ZodError) res.status(400).json({ error: error.issues[0]?.message ?? "Invalid query" });
      else res.status(500).json({ error: "Internal server error" });
    }
  });

export default router;
