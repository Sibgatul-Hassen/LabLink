import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  aggregatePurchaseRequestsSchema,
  createPurchaseRequestSchema,
  decidePurchaseRequestSchema,
  listPurchaseRequestsQuerySchema,
  receiveGoodsSchema,
} from "../schemas/purchase.schema";
import { PurchaseActor, PurchaseService } from "../services/purchase.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

const NOT_FOUND_MESSAGES = [
  "Purchase request not found",
  "Component not found",
  "Requisition not found",
  "No pending purchase requests found for this component",
  "No pending approval step found for this purchase request",
  "Office department not found",
];

// Task 5.13. Unlike every prior check on this router, "does this actor's
// role match the current rung" can only be known after loading the request
// — requireRole alone can't express it — so it's a runtime 403 from the
// service, not a route-level gate.
const FORBIDDEN_MESSAGES = [
  "Role does not match the approver for this purchase request's current rung",
];

const BAD_REQUEST_MESSAGES = [
  "Purchase request is not pending a decision",
  "Only an approved purchase request can receive goods",
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

  if (FORBIDDEN_MESSAGES.includes(error.message)) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (BAD_REQUEST_MESSAGES.includes(error.message)) {
    res.status(400).json({ error: error.message });
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
  requireAuth, requireRole(...ALL_ROLES),
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

// Task 5.11. Registered before /purchase-requests/:id, which would
// otherwise swallow this literal path as an :id lookup (same method, same
// path shape) — Express matches routes in registration order.
router.get(
  "/purchase-requests/queue",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const purchaseRequests = await PurchaseService.getQueue(actor);
      res.status(200).json({ data: purchaseRequests });
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

router.get(
  "/purchase-requests/:id",
  requireAuth, requireRole(...ALL_ROLES),
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

// Task 5.13. All four roles may attempt this — which one is actually
// allowed to act depends on which rung the request is currently at, which
// PurchaseService.decidePurchaseRequest checks at runtime (see
// FORBIDDEN_MESSAGES above); requireRole here only screens out roles that
// could never hold any rung (e.g. STUDENT, LAB_ASSISTANT).
router.post(
  "/purchase-requests/:id/decide",
  requireAuth,
  requireRole(
    "CENTRAL_STORE_OFFICER",
    "DEPT_STORE_HEAD",
    "OFFICE_ADMIN",
    "SYSTEM_ADMIN",
  ),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = decidePurchaseRequestSchema.parse(req.body);
      const purchaseRequest = await PurchaseService.decidePurchaseRequest(
        req.params.id,
        validated,
        actor,
      );

      res.status(200).json({ data: purchaseRequest });
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

// Task 5.15. Deliberately narrower than the decide roles — receiving goods
// is a physical stock-room act, not an approval rung, so only the central
// store (who actually stocks the shelf) and SYSTEM_ADMIN can do it.
router.post(
  "/purchase-requests/:id/receive",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = receiveGoodsSchema.parse(req.body);
      const purchaseRequest = await PurchaseService.receiveGoods(
        req.params.id,
        validated.poNumber,
        validated.qtyReceived,
        actor,
      );

      res.status(200).json({ data: purchaseRequest });
    } catch (error) {
      handlePurchaseError(error, res);
    }
  },
);

export default router;
