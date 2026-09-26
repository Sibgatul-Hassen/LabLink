import { prisma } from "../lib/prisma";
import { NotificationService } from "../services/notification.service";
import { RequisitionService } from "../services/requisition.service";
import { SessionService } from "../services/session.service";

const DAY = 24 * 60 * 60 * 1000;

export interface JobResult {
  created: number;
  skipped: number;
  failed: number;
}

/** Draft tomorrow's class requisitions after generating dated sessions. */
export async function draftOvernightRequisitions(now = new Date()): Promise<JobResult> {
  await SessionService.generateSessions(21);
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  ));
  const dayAfter = new Date(tomorrow.getTime() + DAY);
  const sessions = await prisma.classSession.findMany({
    where: {
      date: { gte: tomorrow, lt: dayAfter },
      status: "SCHEDULED",
      experimentId: { not: null },
      requisition: null,
    },
    include: {
      routineSlot: {
        select: {
          lab: { select: { labAssistantId: true } },
          section: {
            select: {
              labAssistantId: true,
              course: { select: { departmentId: true } },
            },
          },
        },
      },
    },
  });

  const result: JobResult = { created: 0, skipped: 0, failed: 0 };
  for (const session of sessions) {
    const departmentId = session.routineSlot.section.course.departmentId;
    const assignedIds = [
      session.routineSlot.section.labAssistantId,
      session.routineSlot.lab.labAssistantId,
    ].filter((id): id is string => id !== null);
    const assigned = assignedIds.length
      ? await prisma.user.findFirst({
          where: {
            id: { in: assignedIds }, role: "LAB_ASSISTANT", departmentId, isActive: true,
          },
        })
      : null;
    const assistant = assigned ?? await prisma.user.findFirst({
      where: { role: "LAB_ASSISTANT", departmentId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const actor = assistant ?? await prisma.user.findFirst({
      where: { role: "SYSTEM_ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
    });

    if (!actor) {
      result.skipped += 1;
      continue;
    }

    try {
      const requisition = await RequisitionService.draftRequisitionForSession(
        session.id,
        { id: actor.id, role: actor.role, departmentId: actor.departmentId },
      );
      await NotificationService.createNotification({
        userId: actor.id,
        title: "Class requisition drafted",
        body: "Review the draft for tomorrow's class before submitting it.",
        refType: "AUTO_DRAFT",
        refId: requisition.id,
      });
      result.created += 1;
    } catch (error) {
      if (error instanceof Error && error.message === "This class session already has a requisition") {
        result.skipped += 1;
      } else {
        result.failed += 1;
        console.error("[Jobs] Could not draft session", session.id, error);
      }
    }
  }
  return result;
}

/** Alert store staff at most once per component per day while stock is low. */
export async function checkLowStock(now = new Date()): Promise<JobResult> {
  const [stocks, recipients] = await Promise.all([
    prisma.stock.findMany({
      include: { component: { select: { isActive: true, code: true, name: true } } },
    }),
    prisma.user.findMany({
      where: {
        role: { in: ["CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN"] }, isActive: true,
      },
      select: { id: true },
    }),
  ]);
  const result: JobResult = { created: 0, skipped: 0, failed: 0 };
  const since = new Date(now.getTime() - DAY);

  for (const stock of stocks) {
    if (!stock.component.isActive || stock.reorderPoint <= 0 || stock.onHand >= stock.reorderPoint) {
      continue;
    }
    for (const recipient of recipients) {
      try {
        const recent = await prisma.notification.findFirst({
          where: {
            userId: recipient.id,
            refType: "LOW_STOCK",
            refId: stock.componentId,
            createdAt: { gte: since },
          },
          select: { id: true },
        });
        if (recent) {
          result.skipped += 1;
          continue;
        }
        await NotificationService.createNotification({
          userId: recipient.id,
          title: "Low stock: " + stock.component.code,
          body: stock.component.name + " has " + stock.onHand +
            " on hand; reorder point is " + stock.reorderPoint + ".",
          refType: "LOW_STOCK",
          refId: stock.componentId,
        });
        result.created += 1;
      } catch (error) {
        result.failed += 1;
        console.error("[Jobs] Could not alert on stock", stock.componentId, error);
      }
    }
  }
  return result;
}
