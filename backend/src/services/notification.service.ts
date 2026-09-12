import { Notification, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AvailabilityQueryClient } from "./availability.service";

/**
 * Task 5.20. Notification already exists in schema.prisma (added in an
 * earlier migration, before this task) — the brief's field list matches it
 * except one name: the read flag is `isRead`, not `read`.
 */
export interface NotificationContent {
  title: string;
  body: string;
  refType?: string;
  refId?: string;
}

export class NotificationService {
  /**
   * Takes the same optional transaction client every other multi-step-aware
   * method in this codebase does, so a trigger fired from inside another
   * method's own transaction (e.g. decidePurchaseRequest) becomes part of
   * that same transaction rather than a separate one — consistent with how
   * this codebase already treats every other side effect of a status
   * change (StockMovement rows, ApprovalStep updates, etc.).
   */
  static async createNotification(
    input: { userId: string } & NotificationContent,
    client: AvailabilityQueryClient = prisma,
  ): Promise<Notification> {
    return client.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        body: input.body,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    });
  }

  /**
   * For a purchase request escalating to the next rung, ApprovalStep.
   * approverId is null until someone actually decides on it — the new step
   * is created with only an approverRole, no specific assignee — so there
   * is no individual to notify yet, only a role. This notifies every active
   * user holding that role, using createMany rather than N separate
   * createNotification calls.
   */
  static async notifyRole(
    role: Role,
    content: NotificationContent,
    client: AvailabilityQueryClient = prisma,
  ): Promise<void> {
    const users = await client.user.findMany({
      where: { role, isActive: true },
      select: { id: true },
    });

    if (users.length === 0) {
      return;
    }

    await client.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        title: content.title,
        body: content.body,
        refType: content.refType ?? null,
        refId: content.refId ?? null,
      })),
    });
  }

  static async listNotifications(userId: string): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Scope is part of the lookup — an id that exists but belongs to another
   * user reads as absent rather than forbidden, the same convention every
   * other getById/actOnId in this codebase already follows.
   */
  static async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }
}
