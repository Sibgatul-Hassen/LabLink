import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  assessPenaltySchema, payPenaltySchema, penaltyQuerySchema,
  penaltyRateSchema, waivePenaltySchema,
} from "../schemas/penalty.schema";
import { PenaltyService } from "../services/penalty.service";
import { AuthenticatedRequest } from "../types";

const router = Router();
const allRoles = [
  "STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD",
  "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN",
] as const;
const financeRoles = ["OFFICE_ADMIN", "SYSTEM_ADMIN"] as const;

function handleError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? "Invalid request" });
  } else if (error instanceof Error && ["Requisition not found", "Component not found", "Outstanding penalty not found"].includes(error.message)) {
    res.status(404).json({ error: error.message });
  } else if (error instanceof Error && [
    "Only returned personal requisitions can be assessed", "Penalty rate is not configured",
    "Penalty quantity exceeds recorded loss or damage", "Late penalty already assessed",
    "Requisition was returned on time",
  ].includes(error.message)) {
    res.status(409).json({ error: error.message });
  } else if (error instanceof Error && [
    "Invalid penalty quantity", "Penalty rate or component cost is missing",
    "Late penalties use the return date", "Return date is missing",
    "Component and quantity are required",
  ].includes(error.message)) {
    res.status(400).json({ error: error.message });
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    res.status(409).json({ error: "Penalty changed concurrently; please try again" });
  } else {
    res.status(500).json({ error: "Internal server error" });
  }
}

router.get("/penalties", requireAuth, requireRole(...allRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
      const query = penaltyQuerySchema.parse(req.query);
      res.status(200).json(await PenaltyService.list(req.user, query.status, query.page, query.limit));
    } catch (error) { handleError(error, res); }
  },
);

router.get("/penalty-rates", requireAuth, requireRole(...allRoles),
  async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    try { res.status(200).json({ data: await PenaltyService.listRates() }); }
    catch (error) { handleError(error, res); }
  },
);

router.get("/penalties/block-status", requireAuth, requireRole(...allRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
      res.status(200).json(await PenaltyService.blockStatus(req.user.id));
    } catch (error) { handleError(error, res); }
  },
);

router.put("/penalty-rates", requireAuth, requireRole(...financeRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = penaltyRateSchema.parse(req.body);
      res.status(200).json({ data: await PenaltyService.setRate(data) });
    } catch (error) { handleError(error, res); }
  },
);

router.post("/penalties/assess", requireAuth, requireRole(...financeRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data = assessPenaltySchema.parse(req.body);
      res.status(201).json({ data: await PenaltyService.assess(data) });
    } catch (error) { handleError(error, res); }
  },
);

router.post("/penalties/:id/pay", requireAuth, requireRole(...financeRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
      const data = payPenaltySchema.parse(req.body);
      res.status(200).json({ data: await PenaltyService.pay(req.params.id, req.user.id, data.receiptRef) });
    } catch (error) { handleError(error, res); }
  },
);

router.post("/penalties/:id/waive", requireAuth, requireRole(...financeRoles),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
      const data = waivePenaltySchema.parse(req.body);
      res.status(200).json({ data: await PenaltyService.waive(req.params.id, req.user.id, data.reason) });
    } catch (error) { handleError(error, res); }
  },
);

export default router;
