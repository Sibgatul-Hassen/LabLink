import { Router, Response } from "express";
import { ZodError } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  changePasswordSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../schemas/user.schema";
import { UserService } from "../services/user.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

function handleUserError(error: unknown, res: Response): void {
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

  if (error.message === "User not found") {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (error.message === "Department not found") {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  if (error.message === "User with this email already exists") {
    res.status(409).json({ error: error.message });
    return;
  }

  if (error.message === "Department is required for this role") {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error.message === "SELF_LOCKOUT_DEACTIVATE") {
    res
      .status(409)
      .json({ error: "You cannot deactivate your own account." });
    return;
  }

  if (error.message === "SELF_LOCKOUT_ROLE") {
    res.status(409).json({
      error: "You cannot change your own role away from System Admin.",
    });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

// POST /api/users - Create (SYSTEM_ADMIN only)
router.post(
  "/users",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = createUserSchema.parse(req.body);
      const user = await UserService.createUser(validated);
      res.status(201).json({ data: user });
    } catch (error) {
      handleUserError(error, res);
    }
  },
);

// GET /api/users - List (SYSTEM_ADMIN only)
router.get(
  "/users",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const query = listUsersQuerySchema.parse(req.query);
      const result = await UserService.listUsers(query);
      res.status(200).json(result);
    } catch (error) {
      handleUserError(error, res);
    }
  },
);

// GET /api/users/:id - Get one (SYSTEM_ADMIN only)
router.get(
  "/users/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = await UserService.getUserById(req.params.id);
      res.status(200).json({ data: user });
    } catch (error) {
      handleUserError(error, res);
    }
  },
);

// PATCH /api/users/:id - Update (SYSTEM_ADMIN only, no self-lockout)
router.patch(
  "/users/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const validated = updateUserSchema.parse(req.body);
      const user = await UserService.updateUser(
        req.params.id,
        validated,
        req.user.id,
      );
      res.status(200).json({ data: user });
    } catch (error) {
      handleUserError(error, res);
    }
  },
);

// PATCH /api/users/:id/password - Reset password (SYSTEM_ADMIN only)
router.patch(
  "/users/:id/password",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const validated = changePasswordSchema.parse(req.body);
      await UserService.changePassword(req.params.id, validated.password);
      res.status(204).send();
    } catch (error) {
      handleUserError(error, res);
    }
  },
);

// DELETE /api/users/:id - Soft delete / deactivate (SYSTEM_ADMIN only, no self-lockout)
router.delete(
  "/users/:id",
  requireAuth,
  requireRole("SYSTEM_ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      await UserService.deleteUser(req.params.id, req.user.id);
      res.status(204).send();
    } catch (error) {
      handleUserError(error, res);
    }
  },
);

export default router;
