import { Router, Response } from "express";
import { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import {
  adjustStockSchema,
  listStockMovementsQuerySchema,
  listStocksQuerySchema,
  transferStockSchema,
  updateReorderPointSchema,
} from "../schemas/stock.schema";
import { StockService } from "../services/stock.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

// GET /api/stocks - List stock (all authenticated users)
router.get(
  "/stocks",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listStocksQuerySchema.parse(req.query);
      const result = await StockService.listStocks(query);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid query parameters" });
        return;
      }

      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/stocks/:componentId/movements - Movement history
router.get(
  "/stocks/:componentId/movements",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listStockMovementsQuerySchema.parse(req.query);
      const result = await StockService.listMovements(
        req.params.componentId,
        query,
      );

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid query parameters" });
      } else if (
        error instanceof Error &&
        error.message.includes("not found")
      ) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// GET /api/stocks/:componentId - Get one stock record
router.get(
  "/stocks/:componentId",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const stock = await StockService.getStockByComponentId(
        req.params.componentId,
      );

      res.status(200).json({ data: stock });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else if (error.message.includes("not initialized")) {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// PATCH /api/stocks/:componentId/reorder-point
router.patch(
  "/stocks/:componentId/reorder-point",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = updateReorderPointSchema.parse(req.body);

      const stock = await StockService.updateReorderPoint(
        req.params.componentId,
        validated,
      );

      res.status(200).json({ data: stock });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid request body" });
      } else if (
        error instanceof Error &&
        error.message.includes("not found")
      ) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// POST /api/stocks/:componentId/adjust
router.post(
  "/stocks/:componentId/adjust",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = adjustStockSchema.parse(req.body);

      const result = await StockService.adjustStock(
        req.params.componentId,
        validated,
        req.user.id,
      );

      res.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: "Invalid request body" });
      } else if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else if (
          error.message.includes("negative") ||
          error.message.includes("spare quantity")
        ) {
          res.status(409).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// POST /api/stocks/transfer — Task 4.10. Every other stock route in this file
// is plural ("/stocks/..."), so this stays plural too rather than introducing
// a one-off "/stock/transfer".
router.post(
  "/stocks/transfer",
  requireAuth,
  requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = transferStockSchema.parse(req.body);

      const result = await StockService.transferStock(
        validated,
        req.user.id,
      );

      res.status(200).json({ data: result });
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json({ error: error.issues[0]?.message ?? "Invalid request body" });
      } else if (error instanceof Error) {
        if (error.message.includes("not found")) {
          res.status(404).json({ error: error.message });
        } else if (error.message.includes("negative")) {
          res.status(409).json({ error: error.message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

export default router;
