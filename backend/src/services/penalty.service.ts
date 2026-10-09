import { PenaltyStatus, PenaltyType, Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { PenaltyRateInput } from "../schemas/penalty.schema";
import { ReturnRequisitionRequest } from "../schemas/requisition.schema";

const ALL_SCOPE_ROLES: Role[] = ["CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"];

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

  static async list(actor: { id: string; role: Role; departmentId: string | null }, status?: PenaltyStatus, page = 1, limit = 20) {
    const where: Prisma.PenaltyWhereInput = {
      ...(ALL_SCOPE_ROLES.includes(actor.role) ? {} : actor.role === "DEPT_STORE_HEAD"
        ? { user: { departmentId: actor.departmentId ?? "__none__" } }
        : { userId: actor.id }),
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

  /** Called only by the successful personal-return transaction. */
  static async assessReturnedPersonal(
    tx: Prisma.TransactionClient,
    requisition: { id: string; requestedById: string; neededTo: Date },
    returnedAt: Date,
    items: ReturnRequisitionRequest["items"],
  ) {
    const rates = new Map((await tx.penaltyRate.findMany()).map((rate) => [rate.type, rate]));
    const charge = async (type: PenaltyType, qty: number, componentId: string | null, unitCost: number | null) => {
      if (qty <= 0) return;
      const rate = rates.get(type);
      // A fresh installation has no rates. Returns must still be recordable;
      // an unset rate or absent component cost cannot produce a monetary charge.
      if (!rate || (type !== "LATE" && unitCost === null)) return;
      const amount = calculatePenaltyAmount(
        type, qty, unitCost,
        rate.ratePerDay?.toNumber() ?? null,
        rate.costFraction?.toNumber() ?? null,
        rate.capAmount?.toNumber() ?? null,
      );
      await tx.penalty.create({ data: {
        userId: requisition.requestedById,
        requisitionId: requisition.id,
        componentId,
        type,
        qty,
        amount,
      } });
    };

    const lateDays = Math.ceil((returnedAt.getTime() - requisition.neededTo.getTime()) / 86400000);
    await charge("LATE", lateDays, null, null);
    const ids = items.filter((item) => item.lostQty > 0 || item.damagedQty > 0).map((item) => item.componentId);
    const components = await tx.component.findMany({ where: { id: { in: ids } }, select: { id: true, unitCost: true } });
    const costs = new Map(components.map((component) => [component.id, component.unitCost?.toNumber() ?? null]));
    for (const item of items) {
      const cost = costs.get(item.componentId) ?? null;
      await charge("LOST", item.lostQty, item.componentId, cost);
      await charge("DAMAGED", item.damagedQty, item.componentId, cost);
    }
  }

  static async pay(id: string, actorId: string, receiptRef: string) {
    const result = await prisma.penalty.updateMany({
      where: { id, status: "OUTSTANDING" },
      data: { status: "PAID", paidAt: new Date(), paidRecordedById: actorId, receiptRef },
    });
    if (result.count !== 1) throw new Error("Outstanding penalty not found");
    return prisma.penalty.findUniqueOrThrow({ where: { id }, include });
  }

  static async waive(id: string, actor: { id: string; departmentId: string | null }, reason: string) {
    const penalty = await prisma.penalty.findUnique({
      where: { id }, select: { user: { select: { departmentId: true } } },
    });
    if (penalty && (!actor.departmentId || penalty.user.departmentId !== actor.departmentId)) {
      throw new Error("Penalty belongs to another department");
    }
    const result = await prisma.penalty.updateMany({
      where: { id, status: "OUTSTANDING", user: { departmentId: actor.departmentId ?? "__none__" } },
      data: { status: "WAIVED", waivedById: actor.id, waivedReason: reason },
    });
    if (result.count !== 1) throw new Error("Outstanding penalty not found");
    return prisma.penalty.findUniqueOrThrow({ where: { id }, include });
  }
}
