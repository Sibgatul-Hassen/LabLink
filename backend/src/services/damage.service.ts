import { DamageStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

const include = {
  component: { select: { id: true, code: true, name: true } },
  reportedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DamageReportInclude;

export class DamageService {
  static async list(status?: DamageStatus, page = 1, limit = 20) {
    const where: Prisma.DamageReportWhereInput = status ? { status } : {};
    const [data, total] = await Promise.all([
      prisma.damageReport.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.damageReport.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  static async changeStatus(
    id: string,
    status: DamageStatus,
    actorId: string,
    notes?: string,
  ) {
    await prisma.$transaction(async (tx) => {
      const report = await tx.damageReport.findUnique({ where: { id } });
      if (!report) throw new Error("Damage report not found");

      const allowed: Record<DamageStatus, DamageStatus[]> = {
        REPORTED: ["UNDER_MAINTENANCE", "WRITTEN_OFF"],
        UNDER_MAINTENANCE: ["REPAIRED", "WRITTEN_OFF"],
        REPAIRED: [],
        WRITTEN_OFF: [],
      };
      if (!allowed[report.status].includes(status)) {
        throw new Error("Invalid damage status transition");
      }

      const updated = await tx.damageReport.updateMany({
        where: { id, status: report.status },
        data: {
          status,
          inspectedById: actorId,
          inspectedAt: new Date(),
          ...(notes ? { notes } : {}),
        },
      });
      if (updated.count !== 1) {
        throw new Error("Damage report changed concurrently");
      }

      if (status === "REPAIRED") {
        await tx.stock.upsert({
          where: { componentId: report.componentId },
          create: { componentId: report.componentId, onHand: report.qty },
          update: { onHand: { increment: report.qty } },
        });
        await tx.stockMovement.create({
          data: {
            componentId: report.componentId,
            qty: report.qty,
            type: "REPAIRED",
            refType: "DAMAGE_REPORT",
            refId: id,
            performedById: actorId,
            note: notes,
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return prisma.damageReport.findUniqueOrThrow({ where: { id }, include });
  }
}
