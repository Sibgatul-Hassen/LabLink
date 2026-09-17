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
import { PurchaseService } from "./purchase.service";
import {
  CreateRequisitionLineRequest,
  CreateRequisitionRequest,
  ListRequisitionsQuery,
  ReturnRequisitionRequest,
  UpdateRequisitionLineRequest,
  UpdateRequisitionRequest,
} from "../schemas/requisition.schema";

/**
 * Stage 4 resolves a requisition in tiers, each backed by a real RequisitionLine
 * column and a real AllocationSource value — except a few the task briefs named
 * that don't exist on this schema, so here is the mapping actually implemented:
 *
 *   - RequisitionStatus has no PARTIALLY_READY. A requisition that is submitted
 *     but not fully covered lands on SUBMITTED (the enum's own "awaiting
 *     further resolution" state) instead.
 *   - AllocationSource has no OFFICE. The office department's stock *is* the
 *     schema's "spare" pool (Stock.spareQty's own comment: "held outside every
 *     department quota"), so tier 2 allocations use AllocationSource.SPARE,
 *     with sourceDeptId set to the office department actually drawn from.
 *   - RequisitionLine has no qtyFromBorrow column — the real field is
 *     qtyBorrowed. Tier 3 writes there.
 */
export type ResolutionBreakdownLine = {
  lineId: string;
  componentId: string;
  componentCode: string;
  componentName: string;
  qtyNeeded: number;
  qtyFromOwn: number;
  qtyFromOffice: number;
  qtyFromBorrow: number;
  // RequisitionLine has no "to purchase" column, even now that tier 4 exists
  // (task 5.9) — qtyShort already means exactly this ("what tiers 1-3 could
  // not source"), and tier 4 acts on that same number rather than needing a
  // second one. The two fields below are intentionally identical.
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
};

export interface IssuePreview {
  requisitionId: string;
  status: string;
  lines: IssuePreviewLine[];
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

    const stocks = await prisma.stock.findMany({
      where: {
        componentId: { in: requisition.lines.map((line) => line.componentId) },
      },
      select: { componentId: true, onHand: true },
    });

    const stockByComponent = new Map(
      stocks.map((stock) => [stock.componentId, stock.onHand]),
    );

    return {
      requisitionId: requisition.id,
      status: requisition.status,
      lines: requisition.lines.map((line) => ({
        lineId: line.id,
        componentId: line.componentId,
        componentCode: line.component.code,
        componentName: line.component.name,
        qtyNeeded: line.qtyNeeded,
        currentStock: stockByComponent.get(line.componentId) ?? 0,
      })),
    };
  }

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
   *
   * Task 5.19: after a line's own mutations, checks whether the component's
   * shared stock has fallen below its reorder point whenever that line
   * confirmed a permanent loss (damagedQty/lostQty), auto-raising a
   * purchase request if so.
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
      // Task 5.18. qtyIssued lives on RequisitionLine (set once, to
      // qtyNeeded, by issueRequisition — never touched again by this
      // method) rather than in the request body, so the Zod schema alone
      // can't catch a return whose counts don't add up to what was
      // actually issued. Checked for every item, before any mutation
      // below, so one bad line rejects the whole request with nothing
      // partially applied — not even for the other, otherwise-valid lines.
      for (const item of data.items) {
        const line = linesByComponent.get(item.componentId);

        if (!line) {
          throw new Error("Component not on this requisition");
        }

        const totalReturning =
          item.goodQty + item.damagedQty + item.lostQty + item.usedUpQty;

        if (totalReturning !== line.qtyIssued) {
          throw new Error(
            `Return quantity mismatch for component ${item.componentId}: ` +
              `expected ${line.qtyIssued} (qtyIssued), received ${totalReturning}`,
          );
        }
      }

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
        // way tier 4's auto-raised purchase request already does in
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
  ): Promise<Allocation> {
    return client.allocation.create({
      data: {
        requisitionLineId,
        qty,
        source,
        sourceDeptId: departmentId,
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
   * Tier 1 (own quota), tier 2 (the office department's quota, standing in
   * for the shared spare pool), tier 3 (borrowing from other academic
   * departments), then tier 4 (auto-raising a purchase request for whatever
   * is still short) for a single line. Tier 4 does not reduce the shortfall
   * the way tiers 1-3 do — a pending purchase is not units in hand — so the
   * qty this returns (and stores as qtyShort) stays exactly what tier 3 left
   * it at. That is by design: the caller uses this to decide READY vs.
   * SUBMITTED, and a line still waiting on a purchase to be approved is not
   * ready.
   */
  private static async resolveLine(
    tx: Prisma.TransactionClient,
    requisitionId: string,
    departmentId: string,
    window: AvailabilityWindow,
    officeDept: { id: string } | null,
    line: RequisitionLine,
    raisedById: string,
  ): Promise<number> {
    let remaining = line.qtyNeeded;
    let qtyOwnQuota = 0;
    let qtySpare = 0;
    let qtyBorrowed = 0;

    const ownAvailable = await AvailabilityService.availableToDept(
      departmentId,
      line.componentId,
      window,
      requisitionId,
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

    // Tier 2 only makes sense as a distinct source when the office is not the
    // requesting department itself — otherwise it is the same quota twice.
    if (remaining > 0 && officeDept && officeDept.id !== departmentId) {
      const officeAvailable = await AvailabilityService.availableToDept(
        officeDept.id,
        line.componentId,
        window,
        requisitionId,
        tx,
      );

      const fromOffice = Math.min(remaining, officeAvailable);

      if (fromOffice > 0) {
        await this.createAllocation(
          line.id,
          fromOffice,
          "SPARE",
          officeDept.id,
          tx,
        );
        qtySpare = fromOffice;
        remaining -= fromOffice;
      }
    }

    // Tier 3 — borrow from whichever other academic departments have spare
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

    // Tier 4 — whatever tiers 1-3 could not source becomes a purchase
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
      data: { qtyOwnQuota, qtySpare, qtyBorrowed, qtyShort: remaining },
    });

    return remaining;
  }

  /**
   * Submits a DRAFT for resolution. The whole read-decide-write cycle runs
   * inside one Serializable transaction: two submits racing for the same
   * last units — whether a department's own quota, the office's spare pool,
   * or another department's lendable stock — will see Postgres abort one of
   * them (P2034) rather than let both believe they got the stock, because
   * every tier's availability reads go through the same `tx` as the
   * allocations (and, for tier 3, BorrowRequests; for tier 4,
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

          await this.releaseAllocations(id, tx);

          const window: AvailabilityWindow = {
            from: requisition.neededFrom,
            to: requisition.neededTo,
          };

          const officeDept = await tx.department.findFirst({
            where: { isOffice: true, isActive: true },
            orderBy: { createdAt: "asc" },
          });

          let fullyResolved = true;

          for (const line of requisition.lines) {
            const remaining = await this.resolveLine(
              tx,
              id,
              requisition.departmentId,
              window,
              officeDept,
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
        qtyFromOffice: line.qtySpare,
        qtyFromBorrow: line.qtyBorrowed,
        qtyToPurchase: line.qtyShort,
        qtyShort: line.qtyShort,
      })),
    };
  }
}
