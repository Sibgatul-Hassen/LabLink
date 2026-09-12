import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  aggregatePurchaseRequestsSchema,
  createPurchaseRequestSchema,
  listPurchaseRequestsQuerySchema,
} from "../schemas/purchase.schema";
import { PurchaseActor, PurchaseService } from "../services/purchase.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

const NOT_FOUND_MESSAGES = [
  "Purchase request not found",
  "Component not found",
  "Requisition not found",
  "No pending purchase requests found for this component",
];

function handlePurchaseError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  if (!(error instanceof Error)) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (NOT_FOUND_MESSAGES.includes(error.message)) {
    res.status(404).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

function actorFrom(req: AuthenticatedRequest): PurchaseActor | null {
  if (!req.user) {
    return null;
  }

  return {
    id: req.user.id,
    role: req.user.role,
    departmentId: req.user.departmentId,
  };
}

router.post(
  "/purchase-requests",
  requireAuth,
  requireRole(
    "LAB_ASSISTANT",
    "DEPT_STORE_HEAD",
    "CENTRAL_STORE_OFFICER",
    "SYSTEM_ADMIN",
  ),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = createPurchaseRequestSchema.parse(req.body);
      const purchaseRequest = await PurchaseService.createPurchaseRequest(
        validated,
        actor.id,
      );

      res.status(201).json({ data: purchaseRequest });
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

// Task 5.10. Manual trigger — createPurchaseRequest already auto-aggregates
// on every create, but this covers requests that got out of sync some other
// way (a batch import, a bug, direct DB work). Gated to the office roles
// that actually manage purchasing, unlike create itself which lab
// assistants and dept store heads can also do.
router.post(
  "/purchase-requests/aggregate",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = aggregatePurchaseRequestsSchema.parse(req.body);
      const purchaseRequest = await PurchaseService.aggregatePurchaseRequests(
        validated.componentId,
      );

      res.status(200).json({ data: purchaseRequest });
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

// No requireRole — open to any authenticated user, scope narrows what comes
// back rather than whether the call is allowed, same as GET /requisitions
// and GET /borrow-requests.
router.get(
  "/purchase-requests",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = listPurchaseRequestsQuerySchema.parse(req.query);
      const result = await PurchaseService.listPurchaseRequests(
        query,
        actor,
      );

      res.status(200).json(result);
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

router.get(
  "/purchase-requests/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const purchaseRequest = await PurchaseService.getPurchaseRequest(
        req.params.id,
        actor,
      );

      res.status(200).json({ data: purchaseRequest });
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

export default router;
