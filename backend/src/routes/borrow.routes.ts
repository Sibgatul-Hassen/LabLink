import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  createBorrowRequestSchema,
  findLendersQuerySchema,
  listBorrowRequestsQuerySchema,
} from "../schemas/borrow.schema";
import { BorrowActor, BorrowService } from "../services/borrow.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

const NOT_FOUND_MESSAGES = [
  "Borrow request not found",
  "Requisition not found",
  "Lending department not found",
  "Component not found",
];

const FORBIDDEN_MESSAGES = [
  "You can only raise borrow requests for your own department",
];

const BAD_REQUEST_MESSAGES = ["A department cannot borrow from itself"];

function handleBorrowError(error: unknown, res: Response): void {
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

function actorFrom(req: AuthenticatedRequest): BorrowActor | null {
  if (!req.user) {
    return null;
  }

  return {
    id: req.user.id,
    role: req.user.role,
    departmentId: req.user.departmentId,
  };
}

// Manual, store-level create only. Tier 3 of the resolver (task 5.x, later)
// will auto-create these on a requisition's behalf without going through
// this endpoint, so the role check belongs here rather than in the service.
router.post(
  "/borrow-requests",
  requireAuth,
  requireRole(
    "DEPT_STORE_HEAD",
    "CENTRAL_STORE_OFFICER",
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

      const validated = createBorrowRequestSchema.parse(req.body);
      const borrowRequest = await BorrowService.createBorrowRequest(
        validated,
        actor,
      );

      res.status(201).json({ data: borrowRequest });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

router.get(
  "/borrow-requests",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const query = listBorrowRequestsQuerySchema.parse(req.query);
      const result = await BorrowService.listBorrowRequests(query, actor);

      res.status(200).json(result);
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

// Task 5.2. Registered ahead of "/borrow-requests/:id" — a literal segment
// must come before a param route on the same depth, or Express would match
// "lenders" as an :id and hand this to getBorrowRequestById instead.
//
// Not nested under a specific borrow request: this ranks potential lenders
// for a component + window before any borrow request exists, so it lives at
// its own path rather than "/borrow-requests/:id/lenders".
router.get(
  "/borrow-requests/lenders",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN", "DEPT_STORE_HEAD"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = findLendersQuerySchema.parse(req.query);

      const lenders = await BorrowService.findLenders(
        query.componentId,
        query.qtyNeeded,
        query.windowStart,
        query.windowEnd,
        query.excludeDeptId,
      );

      res.status(200).json({ data: lenders });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

router.get(
  "/borrow-requests/:id",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const borrowRequest = await BorrowService.getBorrowRequestById(
        req.params.id,
        actor,
      );

      res.status(200).json({ data: borrowRequest });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

export default router;
