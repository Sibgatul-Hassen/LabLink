import { PenaltyStatus, PenaltyType, Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AssessPenaltyInput, PenaltyRateInput } from "../schemas/penalty.schema";

const OFFICE_ROLES: Role[] = ["OFFICE_ADMIN", "SYSTEM_ADMIN"];
const ALL_SCOPE_ROLES: Role[] = ["CENTRAL_STORE_OFFICER", ...OFFICE_ROLES];

const include = {
  user: { select: { id: true, fullName: true, email: true } },
  component: { select: { id: true, code: true, name: true } },
  requisition: { select: { id: true, type: true } },
} satisfies Prisma.PenaltyInclude;

export function calculatePenaltyAmount(
  type: PenaltyType,
  qty: number,
  unitCost: number | null,
  ratePerDay: number | null,
  costFraction: number | null,
  capAmount: number | null,
): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Invalid penalty quantity");
  const raw = type === "LATE"
    ? new Prisma.Decimal(ratePerDay ?? 0).mul(qty)
    : new Prisma.Decimal(unitCost ?? 0).mul(costFraction ?? 0).mul(qty);
  if (raw.lte(0)) throw new Error("Penalty rate or component cost is missing");
  const capped = capAmount === null ? raw : Prisma.Decimal.min(raw, new Prisma.Decimal(capAmount));
  return capped.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export class PenaltyService {
  static async blockStatus(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const [rates, outstanding] = await Promise.all([
      db.penaltyRate.findMany({ where: { blockThreshold: { gt: 0 } } }),
      db.penalty.aggregate({
        where: { userId, status: "OUTSTANDING" },
        _sum: { amount: true },
      }),
    ]);
    const amount = outstanding._sum.amount ?? new Prisma.Decimal(0);
    // Existing installations may have distinct values from older rate edits.
    // Use the lowest positive threshold until the next save synchronizes them.
    const threshold = rates.reduce<Prisma.Decimal | null>((lowest, rate) =>
      lowest === null || rate.blockThreshold.lt(lowest) ? rate.blockThreshold : lowest, null);
    return {
      blocked: threshold !== null && amount.gte(threshold),
      outstandingTotal: amount.toFixed(2),
      threshold: threshold?.toFixed(2) ?? null,
    };
  }

  static async assertPersonalAllowed(userId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
    const status = await this.blockStatus(userId, db);
    if (status.blocked) throw new Error("Outstanding penalties have reached the personal requisition limit");
  }

  static async list(actor: { id: string; role: Role }, status?: PenaltyStatus, page = 1, limit = 20) {
    const where: Prisma.PenaltyWhereInput = {
      ...(!ALL_SCOPE_ROLES.includes(actor.role) ? { userId: actor.id } : {}),
      ...(status ? { status } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.penalty.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.penalty.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  static listRates() {
    return prisma.penaltyRate.findMany({ orderBy: { type: "asc" } });
  }

  static setRate(data: PenaltyRateInput) {
    return prisma.$transaction(async (tx) => {
      await tx.penaltyRate.updateMany({ data: { blockThreshold: data.blockThreshold } });
      return tx.penaltyRate.upsert({
        where: { type: data.type },
        create: data,
        update: data,
      });
    });
  }

  static async assess(data: AssessPenaltyInput) {
    return prisma.$transaction(async (tx) => {
      const requisition = await tx.requisition.findUnique({
        where: { id: data.requisitionId },
      });
      if (!requisition) throw new Error("Requisition not found");
      if (requisition.type !== "PERSONAL" || requisition.status !== "RETURNED") {
        throw new Error("Only returned personal requisitions can be assessed");
      }
      const rate = await tx.penaltyRate.findUnique({ where: { type: data.type } });
      if (!rate) throw new Error("Penalty rate is not configured");

      let qty: number;
      let componentId: string | null = null;
      let unitCost: number | null = null;
      if (data.type === "LATE") {
        if (data.componentId || data.qty) throw new Error("Late penalties use the return date");
        if (!requisition.returnedAt) throw new Error("Return date is missing");
        qty = Math.ceil((requisition.returnedAt.getTime() - requisition.neededTo.getTime()) / 86400000);
        if (qty <= 0) throw new Error("Requisition was returned on time");
      } else {
        if (!data.componentId || !data.qty) throw new Error("Component and quantity are required");
        componentId = data.componentId;
        qty = data.qty;
        const component = await tx.component.findUnique({ where: { id: componentId } });
        if (!component) throw new Error("Component not found");
        unitCost = component.unitCost?.toNumber() ?? null;
        const movements = await tx.stockMovement.aggregate({
          where: {
            refType: "REQUISITION", refId: requisition.id, componentId,
            type: data.type === "LOST" ? "LOST" : "DAMAGED",
          },
          _sum: { qty: true },
        });
        const assessed = await tx.penalty.aggregate({
          where: { requisitionId: requisition.id, componentId, type: data.type, status: { not: "WAIVED" } },
          _sum: { qty: true },
        });
        if (qty > (movements._sum.qty ?? 0) - (assessed._sum.qty ?? 0)) {
          throw new Error("Penalty quantity exceeds recorded loss or damage");
        }
      }

      const amount = calculatePenaltyAmount(
        data.type, qty, unitCost,
        rate.ratePerDay?.toNumber() ?? null,
        rate.costFraction?.toNumber() ?? null,
        rate.capAmount?.toNumber() ?? null,
      );
      if (data.type === "LATE") {
        const existing = await tx.penalty.findFirst({
          where: { requisitionId: requisition.id, type: "LATE" },
        });
        if (existing) throw new Error("Late penalty already assessed");
      }
      return tx.penalty.create({
        data: {
          userId: requisition.requestedById,
          requisitionId: requisition.id,
          componentId,
          type: data.type,
          qty,
          amount,
        },
        include,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  static async pay(id: string, actorId: string, receiptRef: string) {
    const result = await prisma.penalty.updateMany({
      where: { id, status: "OUTSTANDING" },
      data: { status: "PAID", paidAt: new Date(), paidRecordedById: actorId, receiptRef },
    });
    if (result.count !== 1) throw new Error("Outstanding penalty not found");
    return prisma.penalty.findUniqueOrThrow({ where: { id }, include });
  }

  static async waive(id: string, actorId: string, reason: string) {
    const result = await prisma.penalty.updateMany({
      where: { id, status: "OUTSTANDING" },
      data: { status: "WAIVED", waivedById: actorId, waivedReason: reason },
    });
    if (result.count !== 1) throw new Error("Outstanding penalty not found");
    return prisma.penalty.findUniqueOrThrow({ where: { id }, include });
  }
}
