import { Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  AvailabilityQueryClient,
  AvailabilityService,
  AvailabilityWindow,
} from "./availability.service";
import { NotificationService } from "./notification.service";
import {
  CreateBorrowRequest,
  ListBorrowRequestsQuery,
} from "../schemas/borrow.schema";

/** Roles that see every department's borrow requests. */
const UNSCOPED_ROLES: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
];

const borrowRequestInclude = {
  requisition: {
    select: {
      id: true,
      type: true,
      status: true,
      neededFrom: true,
      neededTo: true,
    },
  },
  lender: {
    select: { id: true, code: true, name: true },
  },
  borrower: {
    select: { id: true, code: true, name: true },
  },
  lines: {
    include: {
      component: {
        select: { id: true, code: true, name: true, unit: true },
      },
    },
  },
} satisfies Prisma.BorrowRequestInclude;

export type BorrowRequestWithRelations = Prisma.BorrowRequestGetPayload<{
  include: typeof borrowRequestInclude;
}>;

export interface PaginatedBorrowRequestsResponse {
  data: BorrowRequestWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export interface BorrowActor {
  id: string;
  role: Role;
  departmentId: string | null;
}

export interface PotentialLender {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  availableQty: number;
}

export class BorrowService {
  /**
   * A department-scoped actor sees requests where their department is on
   * either side of the loan; unscoped (office-level) roles see everything —
   * the same two-tier scope RequisitionService uses.
   */
  private static scopeFilter(
    actor: BorrowActor,
  ): Prisma.BorrowRequestWhereInput {
    if (UNSCOPED_ROLES.includes(actor.role)) {
      return {};
    }

    // A scoped role with no department can see nothing, rather than everything.
    const departmentId = actor.departmentId ?? "__none__";

    return {
      OR: [{ lenderDeptId: departmentId }, { borrowerDeptId: departmentId }],
    };
  }

  static async createBorrowRequest(
    data: CreateBorrowRequest,
    actor: BorrowActor,
  ): Promise<BorrowRequestWithRelations> {
    const requisition = await prisma.requisition.findUnique({
      where: { id: data.requisitionId },
    });

    if (!requisition) {
      throw new Error("Requisition not found");
    }

    // Never taken from the client — the loan is always on behalf of whichever
    // department the requisition itself belongs to.
    const borrowerDeptId = requisition.departmentId;

    if (data.lenderDeptId === borrowerDeptId) {
      throw new Error("A department cannot borrow from itself");
    }

    const lenderDept = await prisma.department.findUnique({
      where: { id: data.lenderDeptId },
    });

    if (!lenderDept || !lenderDept.isActive) {
      throw new Error("Lending department not found");
    }

    // The schema already rejects a duplicate componentId, so this list is
    // guaranteed unique going in.
    const componentIds = data.lines.map((line) => line.componentId);

    const foundComponents = await prisma.component.findMany({
      where: { id: { in: componentIds }, isActive: true },
      select: { id: true },
    });

    if (foundComponents.length !== componentIds.length) {
      throw new Error("Component not found");
    }

    if (
      actor.role !== "DEPT_STORE_HEAD" || actor.departmentId !== borrowerDeptId
    ) {
      throw new Error(
        "You can only raise borrow requests for your own department",
      );
    }

    return prisma.borrowRequest.create({
      data: {
        requisitionId: data.requisitionId,
        lenderDeptId: data.lenderDeptId,
        borrowerDeptId,
        returnBy: data.returnBy,
        remarks: data.remarks,
        status: "REQUESTED",
        lines: {
          create: data.lines.map((line) => ({
            componentId: line.componentId,
            qtyRequested: line.qtyRequested,
          })),
        },
      },
      include: borrowRequestInclude,
    });
  }

  static async listBorrowRequests(
    query: ListBorrowRequestsQuery,
    actor: BorrowActor,
  ): Promise<PaginatedBorrowRequestsResponse> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.BorrowRequestWhereInput = {
      ...this.scopeFilter(actor),
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.direction) {
      const departmentId = actor.departmentId ?? "__none__";

      if (query.direction === "LENDING") {
        where.lenderDeptId = departmentId;
      } else {
        where.borrowerDeptId = departmentId;
      }
    }

    const [borrowRequests, total] = await Promise.all([
      prisma.borrowRequest.findMany({
        where,
        include: borrowRequestInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.borrowRequest.count({ where }),
    ]);

    return { data: borrowRequests, total, page, limit };
  }

  static async getBorrowRequestById(
    id: string,
    actor: BorrowActor,
  ): Promise<BorrowRequestWithRelations> {
    const borrowRequest = await prisma.borrowRequest.findFirst({
      // Scope is part of the lookup, so an out-of-scope record reads as absent
      // rather than forbidden — no probing for ids that exist.
      where: { id, ...this.scopeFilter(actor) },
      include: borrowRequestInclude,
    });

    if (!borrowRequest) {
      throw new Error("Borrow request not found");
    }

    return borrowRequest;
  }

  // ─────────────── find lenders ───────────────

  /**
   * Task 5.2. Ranks every other academic department by how much of a
   * component it can actually spare over a window, using the same
   * availableToDept() the resolver's own tiers rely on — so "can lend" here
   * means exactly what "available" means everywhere else in this codebase.
   *
   * qtyNeeded is accepted (and will matter once a later task picks how much
   * to request from which lender) but does not filter today: a department
   * offering less than the full amount is still a partial lender, not a
   * non-lender, so the cutoff is availability > 0, not availability >=
   * qtyNeeded.
   *
   * Takes the same optional transaction client AvailabilityService itself
   * does. Tier 3 of the resolver (requisition.service.ts) calls this from
   * inside its Serializable transaction — without threading `client` through
   * here too, this method's availability reads would run on a separate
   * connection from the BorrowRequest/Allocation writes they lead to, and
   * Postgres would have no way to catch two submits racing for the same
   * lender's units.
   */
  static async findLenders(
    componentId: string,
    qtyNeeded: number,
    windowStart: Date,
    windowEnd: Date,
    excludeDeptId: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<PotentialLender[]> {
    const departments = await client.department.findMany({
      where: {
        isOffice: false,
        isActive: true,
        id: { not: excludeDeptId },
      },
    });

    const window: AvailabilityWindow = { from: windowStart, to: windowEnd };

    const candidates = await Promise.all(
      departments.map(async (department) => ({
        departmentId: department.id,
        departmentCode: department.code,
        departmentName: department.name,
        availableQty: await AvailabilityService.availableToDept(
          department.id,
          componentId,
          window,
          undefined,
          client,
        ),
      })),
    );

    return candidates
      .filter((candidate) => candidate.availableQty > 0)
      .sort((a, b) => b.availableQty - a.availableQty);
  }

  // ─────────────── incoming / outgoing inbox ───────────────

  /**
   * Task 5.4. A department's incoming inbox: loans it has been asked to make
   * that it has not yet decided on. Scoped to REQUESTED only — once a lender
   * approves or rejects, the request has left the inbox and belongs in its
   * history instead.
   *
   * deptId ?? "__none__" mirrors scopeFilter()'s own handling of an actor
   * with no department: it matches nothing, so the inbox reads as empty
   * rather than (incorrectly) matching every lenderDeptId-less row.
   */
  static async listIncoming(
    deptId: string | null,
  ): Promise<BorrowRequestWithRelations[]> {
    return prisma.borrowRequest.findMany({
      where: {
        lenderDeptId: deptId ?? "__none__",
        status: "REQUESTED",
      },
      include: borrowRequestInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * The mirror image: everything this department has asked to borrow,
   * whatever its current status — a department tracking its own outgoing
   * requests needs to see approvals and rejections too, not just the ones
   * still pending.
   */
  static async listOutgoing(
    deptId: string | null,
  ): Promise<BorrowRequestWithRelations[]> {
    return prisma.borrowRequest.findMany({
      where: { borrowerDeptId: deptId ?? "__none__" },
      include: borrowRequestInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  // ─────────────── notifications ───────────────

  /**
   * Task 5.20. BorrowRequest has no "requester" of its own — only
   * lenderDeptId/borrowerDeptId — so "the requesting department's relevant
   * user" means whoever raised the underlying Requisition this borrow
   * exists to help fulfil: Requisition.requestedById. Looked up inside the
   * same transaction (tx) as the status change that triggers it, so it
   * commits or rolls back together with that change rather than as a
   * separate write.
   */
  private static async notifyRequisitionRequester(
    tx: Prisma.TransactionClient,
    requisitionId: string,
    content: { title: string; body: string; refType: string; refId: string },
  ): Promise<void> {
    const requisition = await tx.requisition.findUnique({
      where: { id: requisitionId },
      select: { requestedById: true },
    });

    if (!requisition) {
      return;
    }

    await NotificationService.createNotification(
      { userId: requisition.requestedById, ...content },
      tx,
    );
  }

  // ─────────────── approve / reject ───────────────

  /**
   * Finds the HELD, source-BORROW Allocation this borrow request's tier-3
   * resolution created, if any. There is no direct FK from BorrowRequest to
   * Allocation — the link is (requisitionId, componentId) -> RequisitionLine
   * -> Allocation — so this walks it. A manually-created borrow request
   * (POST /borrow-requests, not the resolver) has no such allocation, and
   * that is expected: this returns null rather than throwing.
   */
  private static async findBorrowAllocation(
    tx: Prisma.TransactionClient,
    requisitionId: string,
    componentId: string,
    lenderDeptId: string,
  ) {
    const requisitionLine = await tx.requisitionLine.findFirst({
      where: { requisitionId, componentId },
    });

    if (!requisitionLine) {
      return null;
    }

    return tx.allocation.findFirst({
      where: {
        requisitionLineId: requisitionLine.id,
        source: "BORROW",
        sourceDeptId: lenderDeptId,
        status: "HELD",
      },
    });
  }

  /**
   * Task 5.5. BorrowRequest has no approvedQty/approvedById/approvedAt
   * columns — the brief named fields that don't exist on this schema.
   * The per-line approved amount is BorrowLine.qtyApproved (the real
   * column for exactly this), and the request itself records who decided
   * and when via the generic decidedById/decidedAt pair it already has for
   * both approval and rejection.
   *
   * A borrow request created through this codebase always has exactly one
   * line (the manual create endpoint's tests and the resolver's tier 3 both
   * only ever produce one), and approvedQty is a single flat number, so this
   * operates on that one line.
   */
  static async approveBorrow(
    borrowRequestId: string,
    approvedQty: number,
    actor: BorrowActor,
  ): Promise<BorrowRequestWithRelations> {
    const borrowRequest = await prisma.borrowRequest.findUnique({
      where: { id: borrowRequestId },
      include: { lines: true },
    });

    if (!borrowRequest) {
      throw new Error("Borrow request not found");
    }

    if (borrowRequest.status !== "REQUESTED") {
      throw new Error("Only a requested borrow can be approved");
    }

    if (
      actor.role !== "DEPT_STORE_HEAD" ||
      actor.departmentId !== borrowRequest.lenderDeptId
    ) {
      throw new Error("Only the lending department can approve this request");
    }

    const [line] = borrowRequest.lines;

    if (!line) {
      throw new Error("Borrow request has no lines");
    }

    if (approvedQty <= 0 || approvedQty > line.qtyRequested) {
      throw new Error(
        "Approved quantity must be at least 1 and no more than the requested quantity",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.borrowRequest.update({
        where: { id: borrowRequestId },
        data: {
          status: "APPROVED",
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });

      await tx.borrowLine.update({
        where: { id: line.id },
        data: { qtyApproved: approvedQty },
      });

      const allocation = await this.findBorrowAllocation(
        tx,
        borrowRequest.requisitionId,
        line.componentId,
        borrowRequest.lenderDeptId,
      );

      if (allocation) {
        await tx.allocation.update({
          where: { id: allocation.id },
          data: { qty: approvedQty },
        });
      }

      await this.notifyRequisitionRequester(tx, borrowRequest.requisitionId, {
        title: "Borrow request approved",
        body: `Your borrow request for ${approvedQty} unit(s) has been approved.`,
        refType: "BORROW",
        refId: borrowRequestId,
      });
    });

    return this.getBorrowRequestById(borrowRequestId, actor);
  }

  /**
   * Rejects a REQUESTED borrow and releases whatever tier-3 allocations it
   * was holding — the department that would have lent has said no, so
   * those units are free for the resolver to try elsewhere on the next
   * submit. The rejection reason goes in BorrowRequest.remarks; there is no
   * separate rejectedReason/rejectedById/rejectedAt on this schema, so the
   * same decidedById/decidedAt pair approveBorrow uses covers rejection too.
   */
  static async rejectBorrow(
    borrowRequestId: string,
    reason: string,
    actor: BorrowActor,
  ): Promise<BorrowRequestWithRelations> {
    const borrowRequest = await prisma.borrowRequest.findUnique({
      where: { id: borrowRequestId },
      include: { lines: true },
    });

    if (!borrowRequest) {
      throw new Error("Borrow request not found");
    }

    if (borrowRequest.status !== "REQUESTED") {
      throw new Error("Only a requested borrow can be rejected");
    }

    if (
      actor.role !== "DEPT_STORE_HEAD" ||
      actor.departmentId !== borrowRequest.lenderDeptId
    ) {
      throw new Error("Only the lending department can reject this request");
    }

    if (!reason.trim()) {
      throw new Error("A reason is required to reject a borrow request");
    }

    await prisma.$transaction(async (tx) => {
      await tx.borrowRequest.update({
        where: { id: borrowRequestId },
        data: {
          status: "REJECTED",
          decidedById: actor.id,
          decidedAt: new Date(),
          remarks: reason,
        },
      });

      for (const line of borrowRequest.lines) {
        const allocation = await this.findBorrowAllocation(
          tx,
          borrowRequest.requisitionId,
          line.componentId,
          borrowRequest.lenderDeptId,
        );

        if (allocation) {
          await tx.allocation.update({
            where: { id: allocation.id },
            data: { status: "RELEASED" },
          });
        }
      }

      await this.notifyRequisitionRequester(tx, borrowRequest.requisitionId, {
        title: "Borrow request rejected",
        body: `Your borrow request was rejected: ${reason}`,
        refType: "BORROW",
        refId: borrowRequestId,
      });
    });

    return this.getBorrowRequestById(borrowRequestId, actor);
  }

  // ─────────────── hand-over ───────────────

  /**
   * Task 5.6. Two schema realities the brief's field names didn't match:
   *
   *   - No handedOverAt/handedOverById columns exist. approveBorrow already
   *     stamped decidedById/decidedAt for the approval; overwriting them here
   *     would destroy that record with no replacement, since there is no
   *     second decided-pair for a second decision. So this leaves them alone
   *     and records who performed the hand-over the way every other
   *     stock-affecting action in this codebase does: StockMovement.
   *     performedById on the two movements below.
   *
   *   - Stock.onHand has no department column — it is one shared "physically
   *     at the office" pool (Stock's own comment), not a per-department
   *     ledger. A tier-3 borrow allocation is drawn from the *lender's
   *     quota headroom*, not from stock the lender already had issued to
   *     it — the units were always still sitting in this same shared pool.
   *     RequisitionService.issueRequisition (unchanged by this task) already
   *     deducts a line's full qtyNeeded — borrowed portion included — from
   *     this same onHand when the borrowing department's own requisition is
   *     issued. If hand-over *also* deducted onHand for the lender and added
   *     it for the borrower, that qty would be removed from the shared pool
   *     twice for a single physical movement of goods. Since "deduct from
   *     lender" and "add to borrower" land on the exact same Stock row here,
   *     they mathematically net to zero regardless of what the row currently
   *     holds — so rather than write two calls whose only job is to cancel
   *     out (and which would throw on a component with no Stock row yet, a
   *     real possibility for a manually-created borrow request), onHand is
   *     left untouched entirely. The two StockMovement rows below still
   *     record the transfer for audit purposes.
   */
  static async handOverBorrow(
    borrowRequestId: string,
    actor: BorrowActor,
  ): Promise<BorrowRequestWithRelations> {
    const borrowRequest = await prisma.borrowRequest.findUnique({
      where: { id: borrowRequestId },
      include: { lines: true },
    });

    if (!borrowRequest) {
      throw new Error("Borrow request not found");
    }

    if (borrowRequest.status !== "APPROVED") {
      throw new Error("Only an approved borrow can be handed over");
    }

    if (
      actor.role !== "DEPT_STORE_HEAD" ||
      actor.departmentId !== borrowRequest.lenderDeptId
    ) {
      throw new Error("Only the lending department can hand over this request");
    }

    const [line] = borrowRequest.lines;

    if (!line || line.qtyApproved <= 0) {
      throw new Error(
        "This borrow request has no approved quantity to hand over",
      );
    }

    const qty = line.qtyApproved;

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          componentId: line.componentId,
          qty: -qty,
          type: "TRANSFER",
          fromDeptId: borrowRequest.lenderDeptId,
          toDeptId: borrowRequest.borrowerDeptId,
          refType: "BORROW",
          refId: borrowRequestId,
          performedById: actor.id,
          note: "Hand-over: released by lending department",
        },
      });

      await tx.stockMovement.create({
        data: {
          componentId: line.componentId,
          qty,
          type: "TRANSFER",
          fromDeptId: borrowRequest.lenderDeptId,
          toDeptId: borrowRequest.borrowerDeptId,
          refType: "BORROW",
          refId: borrowRequestId,
          performedById: actor.id,
          note: "Hand-over: received by borrowing department",
        },
      });

      await tx.borrowRequest.update({
        where: { id: borrowRequestId },
        data: { status: "HANDED_OVER" },
      });

      const allocation = await this.findBorrowAllocation(
        tx,
        borrowRequest.requisitionId,
        line.componentId,
        borrowRequest.lenderDeptId,
      );

      if (allocation) {
        await tx.allocation.update({
          where: { id: allocation.id },
          data: { status: "ISSUED" },
        });
      }
    });

    return this.getBorrowRequestById(borrowRequestId, actor);
  }

  // ─────────────── return ───────────────

  /**
   * Task 5.7. BorrowRequest has no returnedAt/returnedById columns — only
   * returnBy (the deadline set at creation, not an actual return timestamp)
   * and the same decidedById/decidedAt pair approveBorrow already stamped.
   * As with handOverBorrow, overwriting that pair here would erase the
   * approval record for no replacement, so it is left alone; who returned it
   * and when is recorded the same way hand-over is, via the StockMovement
   * rows' own performedById/createdAt. BorrowLine.qtyReturned — the real
   * per-line counterpart to qtyApproved — records the returned quantity.
   *
   * Same shared-pool reasoning as handOverBorrow: Stock.onHand has no
   * per-department column, so "borrower dept -> lender dept" cannot be two
   * separate physical counters. issueRequisition already accounted for this
   * qty against the shared pool when the borrower's requisition was issued,
   * so onHand is left untouched here too — the two StockMovement rows are
   * the audit trail, not a real balance change.
   */
  static async returnBorrow(
    borrowRequestId: string,
    actor: BorrowActor,
  ): Promise<BorrowRequestWithRelations> {
    const borrowRequest = await prisma.borrowRequest.findUnique({
      where: { id: borrowRequestId },
      include: { lines: true },
    });

    if (!borrowRequest) {
      throw new Error("Borrow request not found");
    }

    if (borrowRequest.status !== "HANDED_OVER") {
      throw new Error("Only a handed-over borrow can be returned");
    }

    if (
      actor.role !== "DEPT_STORE_HEAD" ||
      actor.departmentId !== borrowRequest.borrowerDeptId
    ) {
      throw new Error("Only the borrowing department can return this request");
    }

    const [line] = borrowRequest.lines;

    if (!line || line.qtyApproved <= 0) {
      throw new Error("This borrow request has no approved quantity to return");
    }

    const qty = line.qtyApproved;

    await prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          componentId: line.componentId,
          qty: -qty,
          type: "RETURN",
          fromDeptId: borrowRequest.borrowerDeptId,
          toDeptId: borrowRequest.lenderDeptId,
          refType: "BORROW",
          refId: borrowRequestId,
          performedById: actor.id,
          note: "Return: released by borrowing department",
        },
      });

      await tx.stockMovement.create({
        data: {
          componentId: line.componentId,
          qty,
          type: "RETURN",
          fromDeptId: borrowRequest.borrowerDeptId,
          toDeptId: borrowRequest.lenderDeptId,
          refType: "BORROW",
          refId: borrowRequestId,
          performedById: actor.id,
          note: "Return: received by lending department",
        },
      });

      await tx.borrowLine.update({
        where: { id: line.id },
        data: { qtyReturned: qty },
      });

      await tx.borrowRequest.update({
        where: { id: borrowRequestId },
        data: { status: "RETURNED" },
      });
    });

    return this.getBorrowRequestById(borrowRequestId, actor);
  }
}
