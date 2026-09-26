import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  approveBorrowSchema,
  createBorrowRequestSchema,
  findLendersQuerySchema,
  listBorrowRequestsQuerySchema,
  rejectBorrowSchema,
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
  "Only the lending department can approve this request",
  "Only the lending department can reject this request",
  "Only the lending department can hand over this request",
  "Only the borrowing department can return this request",
];

const BAD_REQUEST_MESSAGES = [
  "A department cannot borrow from itself",
  "Only a requested borrow can be approved",
  "Only a requested borrow can be rejected",
  "Approved quantity must be at least 1 and no more than the requested quantity",
  "A reason is required to reject a borrow request",
  "Only an approved borrow can be handed over",
  "This borrow request has no approved quantity to hand over",
  "Only a handed-over borrow can be returned",
  "This borrow request has no approved quantity to return",
];

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
  requireAuth, requireRole(...ALL_ROLES),
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

// Task 5.4. Both literal segments, so both must be registered ahead of
// "/borrow-requests/:id" for the same reason "/borrow-requests/lenders" is.
router.get(
  "/borrow-requests/incoming",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const borrowRequests = await BorrowService.listIncoming(
        req.user.departmentId,
      );

      res.status(200).json({ data: borrowRequests });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

router.get(
  "/borrow-requests/outgoing",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const borrowRequests = await BorrowService.listOutgoing(
        req.user.departmentId,
      );

      res.status(200).json({ data: borrowRequests });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

router.get(
  "/borrow-requests/:id",
  requireAuth, requireRole(...ALL_ROLES),
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

// Task 5.5. "Only the lender department's user can approve/reject" is
// checked inside the service against the full actor, the same way
// createBorrowRequest's own department check is — not here, since it needs
// the loaded BorrowRequest's lenderDeptId to compare against.
router.post(
  "/borrow-requests/:id/approve",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = approveBorrowSchema.parse(req.body);
      const borrowRequest = await BorrowService.approveBorrow(
        req.params.id,
        validated.approvedQty,
        actor,
      );

      res.status(200).json({ data: borrowRequest });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

router.post(
  "/borrow-requests/:id/reject",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = rejectBorrowSchema.parse(req.body);
      const borrowRequest = await BorrowService.rejectBorrow(
        req.params.id,
        validated.reason,
        actor,
      );

      res.status(200).json({ data: borrowRequest });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

// Task 5.6. No request body — the approved qty already lives on the
// BorrowLine from approveBorrow. Transactional guarantee lives in
// BorrowService.handOverBorrow itself, same as approve/reject.
router.post(
  "/borrow-requests/:id/hand-over",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const borrowRequest = await BorrowService.handOverBorrow(
        req.params.id,
        actor,
      );

      res.status(200).json({ data: borrowRequest });
    } catch (error) {
      handleBorrowError(error, res);
    }
  },
);

// Task 5.7. No request body — the approved qty already lives on the
// BorrowLine. Transactional guarantee lives in BorrowService.returnBorrow
// itself, same as approve/reject/hand-over.
router.post(
  "/borrow-requests/:id/return",
  requireAuth,
  requireRole("DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const actor = actorFrom(req);

      if (!actor) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const borrowRequest = await BorrowService.returnBorrow(
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
