import {
  Allocation,
  AllocationSource,
  Prisma,
  RequisitionLine,
  Role,
} from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  AvailabilityQueryClient,
  AvailabilityService,
  AvailabilityWindow,
} from "./availability.service";
import { BorrowService } from "./borrow.service";
import { PenaltyService } from "./penalty.service";
import { PurchaseService } from "./purchase.service";
import {
  CreateRequisitionLineRequest,
  CreateRequisitionRequest,
  LiveOrderRequest,
  ListRequisitionsQuery,
  ReturnRequisitionRequest,
  UpdateRequisitionLineRequest,
  UpdateRequisitionRequest,
} from "../schemas/requisition.schema";

/**
 * Resolution uses own quota, approved substitutes, central spares, another
 * department's unused quota, and finally a purchase request. A pending
 * purchase leaves qtyShort positive until stock is received.
 */
export type ResolutionBreakdownLine = {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyNeeded: number;
  qtyFromOwn: number;
  qtyFromSubstitute: number;
  substitutes: {
    componentId: string;
    componentCode: string;
    componentName: string;
    physicalQty: number;
    ratio: number;
    equivalentQty: number;
  }[];
  qtyFromOffice: number;
  qtyFromBorrow: number;
  // qtyShort is the amount still awaiting purchase after allocation.
  qtyToPurchase: number;
  qtyShort: number;
};

export interface ResolutionBreakdown {
  requisitionId: string;
  status: string;
  lines: ResolutionBreakdownLine[];
}

/** Task 6.2 — what the store manager sees before handing a READY requisition over. */
export type IssuePreviewLine = {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyNeeded: number;
  currentStock: number;
  isSubstitute: boolean;
  originalComponentCode?: string;
};

export interface IssuePreview {
  requisitionId: string;
  status: string;
  lines: IssuePreviewLine[];
}

/** Task 6.3 — what the store manager sees before recording a return. */
export type ReturnPreviewLine = {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyIssued: number;
  isSubstitute: boolean;
  originalComponentCode?: string;
};

export interface ReturnPreview {
  requisitionId: string;
  status: string;
  lines: ReturnPreviewLine[];
}

type ReturnCounts = {
  goodQty: number;
  damagedQty: number;
  lostQty: number;
  usedUpQty: number;
};

/** Split a physical component's return across its direct line and substitutions. */
export function splitReturnCounts(counts: ReturnCounts, capacities: number[]): ReturnCounts[] {
  const remaining: ReturnCounts = {
    goodQty: counts.goodQty,
    damagedQty: counts.damagedQty,
    lostQty: counts.lostQty,
    usedUpQty: counts.usedUpQty,
  };
  const parts = capacities.map((capacity) => {
    let space = capacity;
    const goodQty = Math.min(space, remaining.goodQty);
    space -= goodQty;
    remaining.goodQty -= goodQty;
    const damagedQty = Math.min(space, remaining.damagedQty);
    space -= damagedQty;
    remaining.damagedQty -= damagedQty;
    const lostQty = Math.min(space, remaining.lostQty);
    space -= lostQty;
    remaining.lostQty -= lostQty;
    const usedUpQty = Math.min(space, remaining.usedUpQty);
    space -= usedUpQty;
    remaining.usedUpQty -= usedUpQty;
    return { goodQty, damagedQty, lostQty, usedUpQty };
  });
  if (Object.values(remaining).some((qty) => qty !== 0)) {
    throw new Error("Return quantities exceed issued units");
  }
  return parts;
}

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
      allocations: {
        include: {
          substituteComponent: {
            select: { id: true, code: true, name: true },
          },
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

  /** An instructor replaces an unsubmitted class draft with the items actually needed. */
  static async orderLiveForSession(
    sessionId: string,
    data: LiveOrderRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    if (actor.role !== "INSTRUCTOR" && actor.role !== "SYSTEM_ADMIN") {
      throw new Error("Only instructors can place a live class order");
    }

    const uniqueIds = new Set(data.lines.map((line) => line.componentId));
    if (uniqueIds.size !== data.lines.length) {
      throw new Error("This component is already on the requisition");
    }

    let requisitionId: string;
    try {
      requisitionId = await prisma.$transaction(async (tx) => {
        const session = await tx.classSession.findUnique({
          where: { id: sessionId },
          include: {
            requisition: { select: { id: true, status: true } },
            routineSlot: {
              select: {
                section: {
                  select: {
                    instructorId: true,
                    course: { select: { departmentId: true } },
                  },
                },
              },
            },
          },
        });

        if (!session) throw new Error("Class session not found");
        if (
          session.status === "CANCELLED" ||
          session.status === "COMPLETED" ||
          session.endsAt <= new Date()
        ) {
          throw new Error("This class session is no longer open for orders");
        }

        const section = session.routineSlot.section;
        if (
          actor.role === "INSTRUCTOR" &&
          (section.instructorId !== actor.id ||
            actor.departmentId !== section.course.departmentId)
        ) {
          throw new Error("You can only order for your own classes");
        }

        if (session.requisition && session.requisition.status !== "DRAFT") {
          throw new Error("Only an unsubmitted class draft can be replaced");
        }

        const activeComponents = await tx.component.count({
          where: { id: { in: [...uniqueIds] }, isActive: true },
        });
        if (activeComponents !== uniqueIds.size) {
          throw new Error("Component not found");
        }

        const lines = data.lines.map((line) => ({
          componentId: line.componentId,
          qtyNeeded: line.qtyNeeded,
        }));

        if (session.requisition) {
          const updated = await tx.requisition.update({
            where: { id: session.requisition.id },
            data: {
              origin: "INSTRUCTOR_LIVE",
              requestedById: actor.id,
              lines: { deleteMany: {}, create: lines },
            },
            select: { id: true },
          });
          return updated.id;
        }

        const created = await tx.requisition.create({
          data: {
            type: "CLASS",
            origin: "INSTRUCTOR_LIVE",
            classSessionId: sessionId,
            requestedById: actor.id,
            departmentId: section.course.departmentId,
            neededFrom: session.startsAt,
            neededTo: session.endsAt,
            lines: { create: lines },
          },
          select: { id: true },
        });
        return created.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        throw new Error("This class order changed concurrently - please try again");
      }
      throw error;
    }

    return this.submitRequisition(requisitionId, actor);
  }

  static async createRequisition(
    data: CreateRequisitionRequest,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    if (!this.canRaise(data.type, actor.role)) {
      throw new Error("You cannot raise this type of requisition");
    }
    if (data.type === "PERSONAL") {
      await PenaltyService.assertPersonalAllowed(actor.id);
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

  /** Cancel an unissued request and release all reservations atomically. */
  static async cancelRequisition(
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

    await prisma.$transaction(async (tx) => {
      const current = await tx.requisition.findUnique({
        where: { id },
        include: {
          borrowRequests: { select: { status: true } },
          purchaseRequests: { select: { status: true } },
        },
      });
      if (!current || !["SUBMITTED", "READY", "AWAITING_BORROW", "AWAITING_PURCHASE"].includes(current.status)) {
        throw new Error("Only an unissued requisition can be cancelled");
      }
      if (current.borrowRequests.some((borrow) =>
        ["HANDED_OVER", "RETURNED"].includes(borrow.status)
      ) || current.purchaseRequests.some((purchase) =>
        ["APPROVED", "RECEIVED"].includes(purchase.status)
      )) {
        throw new Error("This requisition has completed borrow or purchase activity");
      }

      await tx.allocation.updateMany({
        where: { requisitionLine: { requisitionId: id }, status: "HELD" },
        data: { status: "RELEASED" },
      });
      await tx.borrowRequest.updateMany({
        where: { requisitionId: id, status: { in: ["REQUESTED", "APPROVED"] } },
        data: { status: "CANCELLED" },
      });
      await tx.purchaseRequest.updateMany({
        where: { requisitionId: id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await tx.requisition.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.getRequisitionById(id, actor);
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
   * Task 6.2. A per-line breakdown for the store manager to review before
   * confirming issueRequisition — component identity, what the requisition
   * needs, and how much is currently on the shelf for it. Read-only: unlike
   * issueRequisition, this never touches stock or the requisition's status,
   * so it is safe to call at any status (not just READY) without side
   * effects — the caller decides when showing it makes sense.
   */
  static async getIssuePreview(
    id: string,
    actor: RequisitionActor,
  ): Promise<IssuePreview> {
    const requisition = await this.getRequisitionById(id, actor);
    const lines: IssuePreviewLine[] = [];

    for (const line of requisition.lines) {
      const originalQty = line.qtyNeeded - line.qtySubstitute;
      if (originalQty > 0) {
        lines.push({
          lineId: line.id,
          componentId: line.componentId,
          componentCode: line.component.code,
          componentName: line.component.name,
          qtyNeeded: originalQty,
          currentStock: 0,
          isSubstitute: false,
        });
      }

      for (const allocation of line.allocations) {
        if (
          allocation.source !== "SUBSTITUTE" ||
          allocation.status !== "HELD" ||
          !allocation.substituteComponent
        ) continue;
        lines.push({
          lineId: line.id,
          componentId: allocation.substituteComponent.id,
          componentCode: allocation.substituteComponent.code,
          componentName: allocation.substituteComponent.name,
          qtyNeeded: allocation.qty,
          currentStock: 0,
          isSubstitute: true,
          originalComponentCode: line.component.code,
        });
      }
    }

    const byComponent = new Map<string, IssuePreviewLine>();
    for (const line of lines) {
      const existing = byComponent.get(line.componentId);
      if (existing) {
        existing.qtyNeeded += line.qtyNeeded;
      } else {
        byComponent.set(line.componentId, { ...line });
      }
    }
    const physicalLines = [...byComponent.values()];
    const stocks = await prisma.stock.findMany({
      where: { componentId: { in: physicalLines.map((line) => line.componentId) } },
      select: { componentId: true, onHand: true },
    });
    const stockByComponent = new Map(
      stocks.map((stock) => [stock.componentId, stock.onHand]),
    );

    return {
      requisitionId: requisition.id,
      status: requisition.status,
      lines: physicalLines.map((line) => ({
        ...line,
        currentStock: stockByComponent.get(line.componentId) ?? 0,
      })),
    };
  }

  static async getReturnPreview(
    id: string,
    actor: RequisitionActor,
  ): Promise<ReturnPreview> {
    const requisition = await this.getRequisitionById(id, actor);
    const lines: ReturnPreviewLine[] = [];

    for (const line of requisition.lines) {
      if (line.qtyIssued > 0) {
        lines.push({
          lineId: line.id,
          componentId: line.componentId,
          componentCode: line.component.code,
          componentName: line.component.name,
          qtyIssued: line.qtyIssued,
          isSubstitute: false,
        });
      }

      for (const allocation of line.allocations) {
        if (
          allocation.source !== "SUBSTITUTE" ||
          allocation.status !== "ISSUED" ||
          !allocation.substituteComponent
        ) continue;
        lines.push({
          lineId: allocation.id,
          componentId: allocation.substituteComponent.id,
          componentCode: allocation.substituteComponent.code,
          componentName: allocation.substituteComponent.name,
          qtyIssued: allocation.qty,
          isSubstitute: true,
          originalComponentCode: line.component.code,
        });
      }
    }

    const byComponent = new Map<string, ReturnPreviewLine>();
    for (const line of lines) {
      const existing = byComponent.get(line.componentId);
      if (existing) {
        existing.qtyIssued += line.qtyIssued;
      } else {
        byComponent.set(line.componentId, { ...line });
      }
    }
    return {
      requisitionId: requisition.id,
      status: requisition.status,
      lines: [...byComponent.values()],
    };
  }

  /**
   * Issues the physical components selected by the resolver. A substitute
   * allocation stores physical units, while qtySubstitute stores how many
   * requested units those physical units replace.
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
      async function issuePhysical(
        componentId: string,
        code: string,
        qty: number,
        sparePortion: number,
        note?: string,
      ): Promise<void> {
        if (qty === 0) return;
        const stock = await tx.stock.findUnique({ where: { componentId } });
        const newOnHand = (stock?.onHand ?? 0) - qty;
        const newSpareQty = (stock?.spareQty ?? 0) - sparePortion;
        if (newOnHand < 0 || newSpareQty < 0 || newOnHand < newSpareQty) {
          throw new Error("Insufficient stock for " + code);
        }
        await tx.stock.update({
          where: { componentId },
          data: { onHand: newOnHand, spareQty: newSpareQty },
        });
        await tx.stockMovement.create({
          data: {
            componentId,
            qty: -qty,
            type: "ISSUE",
            refType: "REQUISITION",
            refId: id,
            performedById: actor.id,
            note,
          },
        });
      }

      for (const line of requisition.lines) {
        const substituteAllocations = line.allocations.filter(
          (allocation) =>
            allocation.source === "SUBSTITUTE" &&
            allocation.status === "HELD" &&
            allocation.substituteComponentId !== null &&
            allocation.substituteRatio !== null,
        );
        const equivalent = substituteAllocations.reduce(
          (sum, allocation) => sum + allocation.qty / (allocation.substituteRatio as number),
          0,
        );
        if (equivalent !== line.qtySubstitute) {
          throw new Error("Substitute allocation does not match the requisition");
        }

        const originalQty = line.qtyNeeded - line.qtySubstitute;
        if (originalQty < 0) {
          throw new Error("Substitute allocation does not match the requisition");
        }
        await issuePhysical(
          line.componentId,
          line.component.code,
          originalQty,
          line.qtySpare,
        );

        for (const allocation of substituteAllocations) {
          await issuePhysical(
            allocation.substituteComponentId as string,
            allocation.substituteComponent!.code,
            allocation.qty,
            0,
            "Substitute for " + line.component.code,
          );
        }

        await tx.requisitionLine.update({
          where: { id: line.id },
          data: { qtyIssued: originalQty },
        });
      }

      await tx.allocation.updateMany({
        where: {
          status: "HELD",
          requisitionLine: { requisitionId: id },
        },
        data: { status: "ISSUED" },
      });
      await tx.requisition.update({
        where: { id },
        data: {
          status: "ISSUED",
          issuedAt: new Date(),
          issuedById: actor.id,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.getRequisitionById(id, actor);
  }

  /** Records a complete physical return, including replacement components. */
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
    const substituteAllocations = new Map<
      string,
      RequisitionWithRelations["lines"][number]["allocations"]
    >();
    const expected = new Map<string, number>();

    for (const line of requisition.lines) {
      if (line.qtyIssued > 0) {
        expected.set(line.componentId, (expected.get(line.componentId) ?? 0) + line.qtyIssued);
      }
      for (const allocation of line.allocations) {
        if (
          allocation.source !== "SUBSTITUTE" ||
          allocation.status !== "ISSUED" ||
          !allocation.substituteComponentId
        ) continue;
        const componentId = allocation.substituteComponentId;
        const allocations = substituteAllocations.get(componentId) ?? [];
        allocations.push(allocation);
        substituteAllocations.set(componentId, allocations);
        expected.set(componentId, (expected.get(componentId) ?? 0) + allocation.qty);
      }
    }

    const returnedIds = new Set<string>();
    for (const item of data.items) {
      if (returnedIds.has(item.componentId)) {
        throw new Error("Return contains the same component twice");
      }
      returnedIds.add(item.componentId);
      const issuedQty = expected.get(item.componentId);
      if (issuedQty === undefined) {
        throw new Error("Component not on this requisition");
      }
      const totalReturning =
        item.goodQty + item.damagedQty + item.lostQty + item.usedUpQty;
      if (totalReturning !== issuedQty) {
        throw new Error(
          "Return quantity mismatch for component " + item.componentId +
          ": expected " + issuedQty + " (qtyIssued), received " + totalReturning,
        );
      }
    }
    if (returnedIds.size !== expected.size) {
      throw new Error("Return must include every issued component");
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.requisition.updateMany({
        where: { id, status: "ISSUED" },
        data: {
          status: "RETURNED",
          returnedAt: new Date(),
          returnedById: actor.id,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Requisition must be issued before it can be returned");
      }

      for (const item of data.items) {
        const line = linesByComponent.get(item.componentId);
        const allocations = substituteAllocations.get(item.componentId) ?? [];
        const parts = splitReturnCounts(item, [line?.qtyIssued ?? 0, ...allocations.map((allocation) => allocation.qty)]);

        if (line && line.qtyIssued > 0) {
          const counts = parts[0];
          await tx.requisitionLine.update({
            where: { id: line.id },
            data: {
              qtyReturnedGood: { increment: counts.goodQty },
              qtyDamaged: { increment: counts.damagedQty },
              qtyLost: { increment: counts.lostQty },
              qtyUsedUp: { increment: counts.usedUpQty },
            },
          });
        }
        for (const [index, allocation] of allocations.entries()) {
          const counts = parts[index + 1];
          await tx.allocation.update({
            where: { id: allocation.id },
            data: {
              returnedGoodQty: counts.goodQty,
              damagedQty: counts.damagedQty,
              lostQty: counts.lostQty,
              usedUpQty: counts.usedUpQty,
            },
          });
        }

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
          await tx.damageReport.create({
            data: {
              componentId: item.componentId,
              requisitionId: id,
              qty: item.damagedQty,
              reportedById: actor.id,
              notes: "Recorded during requisition return",
            },
          });
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

        // Task 5.19. damagedQty/lostQty are NOT deducted from stock.onHand
        // here — issueRequisition already took the line's full qtyNeeded
        // off the shelf when it was handed out, so a unit that comes back
        // damaged or lost was already gone from onHand and this method
        // never adds it back (only goodQty's increment above touches
        // onHand at all). What damagedQty+lostQty>0 does mean is that this
        // line just confirmed some units are gone for good, which is
        // exactly the moment worth checking whether the office's shared
        // onHand for this component has drifted below its reorder point —
        // so that's the trigger used here, per this component only (see
        // checkReorderPoint's own comment for why not per department).
        // Runs inside this same transaction, on the same `tx`, the same
        // way purchase tier's auto-raised request already does in
        // RequisitionService.resolveLine — createPurchaseRequest has no
        // side effect beyond DB writes (no notification, no external
        // call), so there's nothing here that needs to happen only after
        // commit, and keeping it in-transaction means a failure here rolls
        // back the whole return instead of leaving it half-applied.
        if (item.damagedQty + item.lostQty > 0) {
          await PurchaseService.checkReorderPoint(
            item.componentId,
            actor.id,
            tx,
            { requisitionId: id },
          );
        }
      }

    });

    return this.getRequisitionById(id, actor);
  }

  // ─────────────── auto-draft ───────────────

  /**
   * Drafts a CLASS requisition straight from a session's experiment: one line
   * per experiment item, sized for the session's group count with a 10%
   * buffer, rounded up. Mirrors createRequisition's CLASS handling (window
   * from the session, department from the section's course, lab-assistant
   * ownership check) rather than trusting the caller for any of it.
   */
  static async draftRequisitionForSession(
    sessionId: string,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        requisition: { select: { id: true } },
        experiment: { include: { items: true } },
        routineSlot: {
          include: {
            lab: { select: { groupSize: true } },
            section: {
              select: {
                studentCount: true,
                course: { select: { departmentId: true } },
              },
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

    if (!session.experiment) {
      throw new Error("This class session has no experiment assigned");
    }

    const departmentId = session.routineSlot.section.course.departmentId;

    if (actor.role !== "SYSTEM_ADMIN" && actor.departmentId !== departmentId) {
      throw new Error(
        "You can only raise requisitions for your own department",
      );
    }

    const groups = Math.ceil(
      session.routineSlot.section.studentCount /
        session.routineSlot.lab.groupSize,
    );

    return prisma.requisition.create({
      data: {
        type: "CLASS",
        origin: "AUTO_DRAFT",
        classSessionId: sessionId,
        requestedById: actor.id,
        departmentId,
        neededFrom: session.startsAt,
        neededTo: session.endsAt,
        status: "DRAFT",
        lines: {
          create: session.experiment.items.map((item) => ({
            componentId: item.componentId,
            // Integer arithmetic throughout: the float literal 1.1 cannot be
            // represented exactly in binary (20 * 1.1 === 22.000000000000004
            // in JS), which would round a clean 22 up to a wrong 23. Scaling
            // by 11 and dividing by 10 keeps every intermediate value exact.
            qtyNeeded: Math.ceil((item.qtyPerGroup * groups * 11) / 10),
          })),
        },
      },
      include: requisitionInclude,
    });
  }

  // ─────────────── allocations ───────────────

  static async createAllocation(
    requisitionLineId: string,
    qty: number,
    source: AllocationSource,
    departmentId: string | null,
    client: AvailabilityQueryClient = prisma,
    substitute?: { componentId: string; ratio: number },
  ): Promise<Allocation> {
    return client.allocation.create({
      data: {
        requisitionLineId,
        qty,
        source,
        sourceDeptId: departmentId,
        substituteComponentId: substitute?.componentId,
        substituteRatio: substitute?.ratio,
        status: "HELD",
      },
    });
  }

  /** Flips every HELD allocation on a requisition to RELEASED — the resolver
   *  runs this first so a re-resolve never double-counts a prior attempt's
   *  holds. */
  static async releaseAllocations(
    requisitionId: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<void> {
    await client.allocation.updateMany({
      where: {
        status: "HELD",
        requisitionLine: { requisitionId },
      },
      data: { status: "RELEASED" },
    });
  }

  // ─────────────── resolver ───────────────

  /**
   * Resolve one line in five tiers. A pending purchase does not count as
   * available stock, so it leaves qtyShort positive and status SUBMITTED.
   */
  private static async resolveLine(
    tx: Prisma.TransactionClient,
    requisitionId: string,
    departmentId: string,
    window: AvailabilityWindow,
    line: RequisitionLine,
    raisedById: string,
  ): Promise<number> {
    let remaining = line.qtyNeeded;
    let qtyOwnQuota = 0;
    let qtySubstitute = 0;
    let qtySpare = 0;
    let qtyBorrowed = 0;

    const ownAvailable = await AvailabilityService.availableToDept(
      departmentId,
      line.componentId,
      window,
      undefined,
      tx,
    );

    const fromOwn = Math.min(remaining, ownAvailable);

    if (fromOwn > 0) {
      await this.createAllocation(
        line.id,
        fromOwn,
        "OWN_QUOTA",
        departmentId,
        tx,
      );
      qtyOwnQuota = fromOwn;
      remaining -= fromOwn;
    }

    // Tier 2: use approved replacements from this department's available quota.
    if (remaining > 0) {
      const requestedComponents = await tx.requisitionLine.findMany({
        where: { requisitionId },
        select: { componentId: true },
      });
      const requestedIds = new Set(requestedComponents.map((item) => item.componentId));
      const substitutes = await tx.componentSubstitute.findMany({
        where: {
          originalId: line.componentId,
          substitute: { isActive: true },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      for (const substitute of substitutes) {
        if (remaining <= 0) break;
        // The same component cannot be both a requested line and its replacement.
        if (requestedIds.has(substitute.substituteId)) continue;

        const availablePhysical = await AvailabilityService.availableToDept(
          departmentId,
          substitute.substituteId,
          window,
          undefined,
          tx,
        );
        const equivalent = Math.min(
          remaining,
          Math.floor(availablePhysical / substitute.ratio),
        );
        if (equivalent <= 0) continue;

        await this.createAllocation(
          line.id,
          equivalent * substitute.ratio,
          "SUBSTITUTE",
          departmentId,
          tx,
          { componentId: substitute.substituteId, ratio: substitute.ratio },
        );
        qtySubstitute += equivalent;
        remaining -= equivalent;
      }
    }

    // Tier 3: use the central spare pool of the requested component.
    if (remaining > 0) {
      const [stock, heldSpareResult, heldAll] = await Promise.all([
        tx.stock.findUnique({ where: { componentId: line.componentId } }),
        tx.allocation.aggregate({
          where: {
            status: "HELD",
            source: "SPARE",
            sourceDeptId: null,
            requisitionLine: {
              componentId: line.componentId,
              requisition: {
                neededFrom: { lt: window.to },
                neededTo: { gt: window.from },
              },
            },
          },
          _sum: { qty: true },
        }),
        AvailabilityService.heldForComponent(
          line.componentId,
          window,
          undefined,
          tx,
        ),
      ]);

      const spareFree = Math.max(
        0,
        (stock?.spareQty ?? 0) - (heldSpareResult._sum.qty ?? 0),
      );
      const physicalFree = Math.max(0, (stock?.onHand ?? 0) - heldAll);
      const fromSpare = Math.min(remaining, spareFree, physicalFree);

      if (fromSpare > 0) {
        await this.createAllocation(
          line.id,
          fromSpare,
          "SPARE",
          null,
          tx,
        );
        qtySpare = fromSpare;
        remaining -= fromSpare;
      }
    }

    // Tier 4: borrow from whichever other academic departments have spare
    // capacity, most-available first, until the shortfall is covered or the
    // lenders run out. findLenders() already excludes the requesting
    // department and every office department (isOffice: false), so there is
    // no risk of "borrowing" from tier 1 or tier 2's own source.
    if (remaining > 0) {
      const lenders = await BorrowService.findLenders(
        line.componentId,
        remaining,
        window.from,
        window.to,
        departmentId,
        tx,
      );

      for (const lender of lenders) {
        if (remaining <= 0) {
          break;
        }

        const fromLender = Math.min(remaining, lender.availableQty);

        if (fromLender <= 0) {
          continue;
        }

        // One BorrowRequest per lending department — the schema ties each
        // request to exactly one lenderDeptId, so covering a shortfall from
        // several departments means several requests, not one with several
        // lines.
        await tx.borrowRequest.create({
          data: {
            requisitionId,
            lenderDeptId: lender.departmentId,
            borrowerDeptId: departmentId,
            status: "REQUESTED",
            // Not specified by the task; the requisition's own window end is
            // the only date this resolver has to offer, and matches how
            // everything else here derives dates from context rather than
            // inventing them.
            returnBy: window.to,
            lines: {
              create: [
                {
                  componentId: line.componentId,
                  qtyRequested: fromLender,
                },
              ],
            },
          },
        });

        await this.createAllocation(
          line.id,
          fromLender,
          "BORROW",
          lender.departmentId,
          tx,
        );

        qtyBorrowed += fromLender;
        remaining -= fromLender;
      }
    }

    // Tier 5: whatever tiers 1-4 could not source becomes a purchase
    // request, linked back to this requisition so its approval history is
    // traceable. Deliberately does not touch `remaining`: a pending
    // purchase is not stock in hand, so the shortfall this line reports
    // (qtyShort) must stay accurate, and the requisition must stay
    // SUBMITTED rather than READY until that purchase is actually fulfilled
    // — a later stage's concern, not this resolver's.
    if (remaining > 0) {
      await PurchaseService.createPurchaseRequest(
        {
          componentId: line.componentId,
          qtyRequested: remaining,
          reason:
            `Auto-raised by the resolver: requisition ${requisitionId} could ` +
            `not source ${remaining} unit(s) of this component from its own ` +
            "quota, the office, or another department.",
          requisitionId,
        },
        raisedById,
        tx,
      );
    }

    await tx.requisitionLine.update({
      where: { id: line.id },
      data: { qtyOwnQuota, qtySubstitute, qtySpare, qtyBorrowed, qtyShort: remaining },
    });

    return remaining;
  }

  /**
   * Submits a DRAFT for resolution. The whole read-decide-write cycle runs
   * inside one Serializable transaction: two submits racing for the same
   * last units — whether a department's own quota, the shared spare pool,
   * or another department's lendable stock — will see Postgres abort one of
   * them (P2034) rather than let both believe they got the stock, because
   * every tier's availability reads go through the same `tx` as the
   * allocations (and, for tier 4, BorrowRequests; for tier 5,
   * PurchaseRequests) they lead to.
   */
  static async submitRequisition(
    id: string,
    actor: RequisitionActor,
  ): Promise<RequisitionWithRelations> {
    // Fails fast, outside the transaction, on the common cases (not found,
    // not yours, already past draft) before paying for Serializable isolation.
    await this.loadEditable(id, actor);

    try {
      await prisma.$transaction(
        async (tx) => {
          const requisition = await tx.requisition.findUnique({
            where: { id },
            include: { lines: true },
          });

          if (!requisition) {
            throw new Error("Requisition not found");
          }

          if (requisition.status !== "DRAFT") {
            throw new Error("Only a draft requisition can be changed");
          }

          if (requisition.type === "PERSONAL") {
            await PenaltyService.assertPersonalAllowed(requisition.requestedById, tx);
          }

          await this.releaseAllocations(id, tx);

          const window: AvailabilityWindow = {
            from: requisition.neededFrom,
            to: requisition.neededTo,
          };

          let fullyResolved = true;

          for (const line of requisition.lines) {
            const remaining = await this.resolveLine(
              tx,
              id,
              requisition.departmentId,
              window,
              line,
              actor.id,
            );

            if (remaining > 0) {
              fullyResolved = false;
            }
          }

          await tx.requisition.update({
            where: { id },
            data: { status: fullyResolved ? "READY" : "SUBMITTED" },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new Error(
          "This requisition is being resolved concurrently — please try again",
        );
      }

      throw error;
    }

    return this.getRequisitionById(id, actor);
  }

  static async getResolutionBreakdown(
    id: string,
    actor: RequisitionActor,
  ): Promise<ResolutionBreakdown> {
    const requisition = await this.getRequisitionById(id, actor);

    return {
      requisitionId: requisition.id,
      status: requisition.status,
      lines: requisition.lines.map((line) => ({
        lineId: line.id,
        componentId: line.componentId,
        componentCode: line.component.code,
        componentName: line.component.name,
        qtyNeeded: line.qtyNeeded,
        qtyFromOwn: line.qtyOwnQuota,
        qtyFromSubstitute: line.qtySubstitute,
        substitutes: line.allocations
          .filter((allocation) =>
            allocation.source === "SUBSTITUTE" &&
            allocation.status !== "RELEASED" &&
            allocation.substituteComponent !== null &&
            allocation.substituteRatio !== null,
          )
          .map((allocation) => ({
            componentId: allocation.substituteComponentId as string,
            componentCode: allocation.substituteComponent!.code,
            componentName: allocation.substituteComponent!.name,
            physicalQty: allocation.qty,
            ratio: allocation.substituteRatio as number,
            equivalentQty: allocation.qty / (allocation.substituteRatio as number),
          })),
        qtyFromOffice: line.qtySpare,
        qtyFromBorrow: line.qtyBorrowed,
        qtyToPurchase: line.qtyShort,
        qtyShort: line.qtyShort,
      })),
    };
  }

}
