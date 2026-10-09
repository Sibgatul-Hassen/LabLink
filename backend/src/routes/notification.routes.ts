import { Router, Response } from "express";

import { requireAuth } from "../middleware/auth";
import { ALL_ROLES, requireRole } from "../middleware/rbac";
import { NotificationService } from "../services/notification.service";
import { AuthenticatedRequest } from "../types";

const router = Router();

const NOT_FOUND_MESSAGES = ["Notification not found"];

function handleNotificationError(error: unknown, res: Response): void {
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

// No requireRole — every authenticated user manages their own
// notifications; scope narrows to req.user.id rather than gating by role,
// the same convention GET /purchase-requests and GET /borrow-requests use.
router.get(
  "/notifications",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const notifications = await NotificationService.listNotifications(
      req.user.id,
    );

    res.status(200).json({ data: notifications });
  },
);

router.patch(
  "/notifications/:id/read",
  requireAuth, requireRole(...ALL_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const notification = await NotificationService.markAsRead(
        req.params.id,
        req.user.id,
      );

      res.status(200).json({ data: notification });
    } catch (error) {
      handleNotificationError(error, res);
    }
  },
);

export default router;
