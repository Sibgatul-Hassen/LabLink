import { Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  CreateRequisitionLineRequest,
  CreateRequisitionRequest,
  ListRequisitionsQuery,
  ReturnRequisitionRequest,
  UpdateRequisitionLineRequest,
  UpdateRequisitionRequest,
} from "../schemas/requisition.schema";

/** Roles that see every department's requisitions. */
const UNSCOPED_ROLES: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
];

const requisitionInclude = {
  requestedBy: {
    select: { id: true, fullName: true, email: true, role: true },
  },
  department: {
    select: { id: true, code: true, name: true },
  },
  classSession: {
    select: {
      id: true,
      date: true,
      startsAt: true,
      endsAt: true,
      routineSlot: {
        select: {
          lab: {
            select: { id: true, name: true, roomNo: true, groupSize: true },
          },
          section: {
            select: {
              id: true,
              name: true,
              studentCount: true,
              course: { select: { id: true, code: true, title: true } },
            },
          },
        },
      },
      experiment: { select: { id: true, number: true, title: true } },
    },
  },
  lines: {
    include: {
      component: {
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          sizeClass: true,
        },
      },
    },
    orderBy: { component: { code: "asc" } },
  },
} satisfies Prisma.RequisitionInclude;

export type RequisitionWithRelations = Prisma.RequisitionGetPayload<{
  include: typeof requisitionInclude;
}>;

export interface PaginatedRequisitionsResponse {
  data: RequisitionWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export interface RequisitionActor {
  id: string;
  role: Role;
  departmentId: string | null;
}

export class RequisitionService {
  /**
   * Three read tiers, from the scope column of proposal section 6:
   * a student sees "own records", roles 2-4 see their own department, and the
   * office-level roles see everything.
   */
  private static scopeFilter(
    actor: RequisitionActor,
  ): Prisma.RequisitionWhereInput {
    if (UNSCOPED_ROLES.includes(actor.role)) {
      return {};
    }

    if (actor.role === "STUDENT") {
      return { requestedById: actor.id };
    }

    // A scoped role with no department can see nothing, rather than everything.
    return { departmentId: actor.departmentId ?? "__none__" };
  }

  private static canRaise(type: string, role: Role): boolean {
    if (role === "SYSTEM_ADMIN") {
      return true;
    }

    if (type === "PERSONAL") {
      return role === "STUDENT";
    }

    // CLASS and MAINTENANCE — proposal section 6: the lab assistant "raises and
    // adjusts class requisitions".
    return role === "LAB_ASSISTANT";
  }

  private static async assertComponentsExist(
    componentIds: string[],
  ): Promise<void> {
    if (componentIds.length === 0) {
      return;
    }

    const unique = new Set(componentIds);

    if (unique.size !== componentIds.length) {
      throw new Error("This component is already on the requisition");
    }

    const found = await prisma.component.findMany({
      where: { id: { in: [...unique] }, isActive: true },
      select: { id: true },
    });

    if (found.length !== unique.size) {
      throw new Error("Component not found");
    }
  }

  static async createRequisition(
    data: CreateRequisitionRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    if (!this.canRaise(data.type, actor.role)) {
      throw new Error("You cannot raise this type of requisition");
    }

    let departmentId: string;
    let neededFrom: Date;
    let neededTo: Date;

    if (data.type === "CLASS") {
      const session = await prisma.classSession.findUnique({
        where: { id: data.classSessionId as string },
        include: {
          requisition: { select: { id: true } },
          routineSlot: {
            select: {
              section: {
                select: { course: { select: { departmentId: true } } },
              },
            },
          },
        },
      });

      if (!session) {
        throw new Error("Class session not found");
      }

      if (session.requisition) {
        throw new Error("This class session already has a requisition");
      }

      departmentId = session.routineSlot.section.course.departmentId;

      // A lab assistant may only requisition for their own department.
      if (
        actor.role !== "SYSTEM_ADMIN" &&
        actor.departmentId !== departmentId
      ) {
        throw new Error(
          "You can only raise requisitions for your own department",
        );
      }

      // Taken from the session, never from the client. Otherwise a three-hour
      // class could claim a three-day hold on the department's quota.
      neededFrom = session.startsAt;
      neededTo = session.endsAt;
    } else {
      if (!actor.departmentId) {
        throw new Error("Your account has no department");
      }

      departmentId = actor.departmentId;
      neededFrom = data.neededFrom as Date;
      neededTo = data.neededTo as Date;
    }

    const lines = data.lines ?? [];
    await this.assertComponentsExist(lines.map((line) => line.componentId));

    return prisma.requisition.create({
      data: {
        type: data.type,
        // The enum offers no STUDENT value; LAB_ASSISTANT is its "raised by
        // hand" case, as opposed to auto-drafted or ordered live mid-class.
        origin: "LAB_ASSISTANT",
        classSessionId: data.type === "CLASS" ? data.classSessionId : null,
        requestedById: actor.id,
        departmentId,
        neededFrom,
        neededTo,
        status: "DRAFT",
        lines: {
          create: lines.map((line) => ({
            componentId: line.componentId,
            qtyNeeded: line.qtyNeeded,
          })),
        },
      },
      include: requisitionInclude,
    });
  }

  static async listRequisitions(
    query: ListRequisitionsQuery,
    actor: RequisitionActor,
  ): Promise<PaginatedRequisitionsResponse> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.RequisitionWhereInput = { ...this.scopeFilter(actor) };

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    // Ignored for scoped roles — their own filter has already been applied and
    // must not be widened by a query string.
    if (query.departmentId && UNSCOPED_ROLES.includes(actor.role)) {
      where.departmentId = query.departmentId;
    }

    if (query.from || query.to) {
      where.neededFrom = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }

    const [requisitions, total] = await Promise.all([
      prisma.requisition.findMany({
        where,
        include: requisitionInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { neededFrom: "desc" },
      }),
      prisma.requisition.count({ where }),
    ]);

    return { data: requisitions, total, page, limit };
  }

  static async getRequisitionById(
    id: string,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    const requisition = await prisma.requisition.findFirst({
      // Scope is part of the lookup, so an out-of-scope record reads as absent
      // rather than forbidden — no probing for ids that exist.
      where: { id, ...this.scopeFilter(actor) },
      include: requisitionInclude,
    });

    if (!requisition) {
      throw new Error("Requisition not found");
    }

    return requisition;
  }

  /** Editing needs ownership and a DRAFT status, both checked here. */
  private static async loadEditable(
    id: string,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    const requisition = await this.getRequisitionById(id, actor);

    if (
      actor.role !== "SYSTEM_ADMIN" &&
      requisition.requestedById !== actor.id
    ) {
      throw new Error("You can only change your own requisitions");
    }

    // Past DRAFT the resolver has made allocation decisions against these
    // lines; editing them would silently invalidate its work.
    if (requisition.status !== "DRAFT") {
      throw new Error("Only a draft requisition can be changed");
    }

    return requisition;
  }

  static async updateRequisition(
    id: string,
    data: UpdateRequisitionRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    const requisition = await this.loadEditable(id, actor);

    if (requisition.type === "CLASS") {
      throw new Error(
        "The window of a class requisition follows its class session",
      );
    }

    const neededFrom = data.neededFrom ?? requisition.neededFrom;
    const neededTo = data.neededTo ?? requisition.neededTo;

    if (neededFrom >= neededTo) {
      throw new Error("The window's start must be before its end");
    }

    await prisma.requisition.update({
      where: { id },
      data: { neededFrom, neededTo },
    });

    return this.getRequisitionById(id, actor);
  }

  static async deleteRequisition(
    id: string,
    actor: RequisitionActor,
  ): Promise<void> {
    await this.loadEditable(id, actor);

    // Hard delete, drafts only. Anything past DRAFT is cancelled instead —
    // that is task 3.14, and RequisitionStatus already has CANCELLED for it.
    await prisma.requisition.delete({ where: { id } });
  }

  static async addLine(
    requisitionId: string,
    data: CreateRequisitionLineRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    await this.loadEditable(requisitionId, actor);
    await this.assertComponentsExist([data.componentId]);

    const existing = await prisma.requisitionLine.findFirst({
      where: { requisitionId, componentId: data.componentId },
    });

    if (existing) {
      throw new Error("This component is already on the requisition");
    }

    await prisma.requisitionLine.create({
      data: {
        requisitionId,
        componentId: data.componentId,
        qtyNeeded: data.qtyNeeded,
      },
    });

    return this.getRequisitionById(requisitionId, actor);
  }

  static async updateLine(
    requisitionId: string,
    lineId: string,
    data: UpdateRequisitionLineRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    await this.loadEditable(requisitionId, actor);

    const line = await prisma.requisitionLine.findUnique({
      where: { id: lineId },
    });

    // Guards the parent as well, so a line cannot be reached through another
    // requisition's URL.
    if (!line || line.requisitionId !== requisitionId) {
      throw new Error("Requisition line not found");
    }

    await prisma.requisitionLine.update({
      where: { id: lineId },
      data: { qtyNeeded: data.qtyNeeded },
    });

    return this.getRequisitionById(requisitionId, actor);
  }

  static async removeLine(
    requisitionId: string,
    lineId: string,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    await this.loadEditable(requisitionId, actor);

    const line = await prisma.requisitionLine.findUnique({
      where: { id: lineId },
    });

    if (!line || line.requisitionId !== requisitionId) {
      throw new Error("Requisition line not found");
    }

    await prisma.requisitionLine.delete({ where: { id: lineId } });

    return this.getRequisitionById(requisitionId, actor);
  }

  // ─────────────── issue & return ───────────────

  /**
   * Issues a READY requisition: every line is handed out in full, deducted
   * from stock.onHand except for the portion the resolver already marked as
   * coming from the spare pool (line.qtySpare), which is deducted from
   * stock.spareQty instead.
   */
  static async issueRequisition(
    id: string,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    const requisition = await this.getRequisitionById(id, actor);

    if (requisition.status !== "READY") {
      throw new Error("Requisition must be ready before it can be issued");
    }

    await prisma.$transaction(async (tx) => {
      for (const line of requisition.lines) {
        const stock = await tx.stock.findUnique({
          where: { componentId: line.componentId },
        });

        const currentOnHand = stock?.onHand ?? 0;
        const currentSpareQty = stock?.spareQty ?? 0;

        const sparePortion = Math.min(line.qtySpare, line.qtyNeeded);
        const onHandPortion = line.qtyNeeded - sparePortion;

        const newOnHand = currentOnHand - onHandPortion;
        const newSpareQty = currentSpareQty - sparePortion;

        if (newOnHand < 0 || newSpareQty < 0) {
          throw new Error(`Insufficient stock for ${line.component.code}`);
        }

        if (stock) {
          await tx.stock.update({
            where: { componentId: line.componentId },
            data: { onHand: newOnHand, spareQty: newSpareQty },
          });
        } else {
          await tx.stock.create({
            data: {
              componentId: line.componentId,
              onHand: newOnHand,
              spareQty: 0,
              reorderPoint: 0,
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            componentId: line.componentId,
            qty: -line.qtyNeeded,
            type: "ISSUE",
            refType: "REQUISITION",
            refId: id,
            performedById: actor.id,
          },
        });

        await tx.requisitionLine.update({
          where: { id: line.id },
          data: { qtyIssued: line.qtyNeeded },
        });
      }

      await tx.requisition.update({
        where: { id },
        data: {
          status: "ISSUED",
          issuedAt: new Date(),
          issuedById: actor.id,
        },
      });
    });

    return this.getRequisitionById(id, actor);
  }

  /**
   * Records a return against an ISSUED requisition. Good units go back onto
   * stock.onHand; damaged, lost, and used-up units stay off the shelf but
   * are still logged as movements for the audit trail.
   */
  static async returnRequisition(
    id: string,
    data: ReturnRequisitionRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    const requisition = await this.getRequisitionById(id, actor);

    if (requisition.status !== "ISSUED") {
      throw new Error("Requisition must be issued before it can be returned");
    }

    const linesByComponent = new Map(
      requisition.lines.map((line) => [line.componentId, line]),
    );

    await prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const line = linesByComponent.get(item.componentId);

        if (!line) {
          throw new Error("Component not on this requisition");
        }

        const totalReturning =
          item.goodQty + item.damagedQty + item.lostQty + item.usedUpQty;

        const alreadyProcessed =
          line.qtyReturnedGood +
          line.qtyDamaged +
          line.qtyLost +
          line.qtyUsedUp;

        const outstanding = line.qtyIssued - alreadyProcessed;

        if (totalReturning > outstanding) {
          throw new Error("Return quantity exceeds issued quantity");
        }

        await tx.requisitionLine.update({
          where: { id: line.id },
          data: {
            qtyReturnedGood: { increment: item.goodQty },
            qtyDamaged: { increment: item.damagedQty },
            qtyLost: { increment: item.lostQty },
            qtyUsedUp: { increment: item.usedUpQty },
          },
        });

        if (item.goodQty > 0) {
          const stock = await tx.stock.findUnique({
            where: { componentId: item.componentId },
          });

          if (stock) {
            await tx.stock.update({
              where: { componentId: item.componentId },
              data: { onHand: { increment: item.goodQty } },
            });
          } else {
            await tx.stock.create({
              data: {
                componentId: item.componentId,
                onHand: item.goodQty,
                spareQty: 0,
                reorderPoint: 0,
              },
            });
          }

          await tx.stockMovement.create({
            data: {
              componentId: item.componentId,
              qty: item.goodQty,
              type: "RETURN",
              refType: "REQUISITION",
              refId: id,
              performedById: actor.id,
            },
          });
        }

        if (item.damagedQty > 0) {
          await tx.stockMovement.create({
            data: {
              componentId: item.componentId,
              qty: item.damagedQty,
              type: "DAMAGED",
              refType: "REQUISITION",
              refId: id,
              performedById: actor.id,
            },
          });
        }

        if (item.lostQty > 0) {
          await tx.stockMovement.create({
            data: {
              componentId: item.componentId,
              qty: item.lostQty,
              type: "LOST",
              refType: "REQUISITION",
              refId: id,
              performedById: actor.id,
            },
          });
        }

        if (item.usedUpQty > 0) {
          await tx.stockMovement.create({
            data: {
              componentId: item.componentId,
              qty: item.usedUpQty,
              type: "USED_UP",
              refType: "REQUISITION",
              refId: id,
              performedById: actor.id,
            },
          });
        }
      }

      await tx.requisition.update({
        where: { id },
        data: {
          status: "RETURNED",
          returnedAt: new Date(),
          returnedById: actor.id,
        },
      });
    });

    return this.getRequisitionById(id, actor);
  }
}
