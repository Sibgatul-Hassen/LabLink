import { DamageStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

const include = {
  component: { select: { id: true, code: true, name: true } },
  reportedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.DamageReportInclude;

export class DamageService {
  private static async scope(actor: { id: string; role: Role; departmentId: string | null }, client: typeof prisma | Prisma.TransactionClient = prisma): Promise<Prisma.DamageReportWhereInput> {
    if (actor.role === "CENTRAL_STORE_OFFICER") return {};
    const where: Prisma.RequisitionWhereInput = actor.role === "LAB_ASSISTANT"
      ? { type: "CLASS", classSession: { routineSlot: { OR: [
      { section: { labAssistantId: actor.id } }, { lab: { labAssistantId: actor.id } },
    ] } } }
      : actor.role === "DEPT_STORE_HEAD" ? { departmentId: actor.departmentId ?? "__none__" }
      : { id: "__none__" };
    const requisitions = await client.requisition.findMany({ where, select: { id: true } });
    return { requisitionId: { in: requisitions.map((request) => request.id) } };
  }

  static async list(actor: { id: string; role: Role; departmentId: string | null }, status?: DamageStatus, page = 1, limit = 20) {
    const where: Prisma.DamageReportWhereInput = { ...(await this.scope(actor)), ...(status ? { status } : {}) };
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
    actor: { id: string; role: Role; departmentId: string | null },
    notes?: string,
  ) {
    if (actor.role !== "LAB_ASSISTANT") throw new Error("Forbidden");
    await prisma.$transaction(async (tx) => {
      const report = await tx.damageReport.findFirst({ where: { id, ...(await this.scope(actor, tx)) } });
      if (!report) {
        if (await tx.damageReport.count({ where: { id } })) throw new Error("Forbidden");
        throw new Error("Damage report not found");
      }

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
          inspectedById: actor.id,
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
            performedById: actor.id,
            note: notes,
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return prisma.damageReport.findUniqueOrThrow({ where: { id }, include });
  }
}
