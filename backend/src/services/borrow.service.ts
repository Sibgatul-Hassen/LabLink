import { Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AvailabilityService, AvailabilityWindow } from "./availability.service";
import {
  CreateBorrowRequest,
  ListBorrowRequestsQuery,
} from "../schemas/borrow.schema";

/** Roles that see every department's borrow requests. */
const UNSCOPED_ROLES: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
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
      !UNSCOPED_ROLES.includes(actor.role) &&
      actor.departmentId !== borrowerDeptId
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
   */
  static async findLenders(
    componentId: string,
    qtyNeeded: number,
    windowStart: Date,
    windowEnd: Date,
    excludeDeptId: string,
  ): Promise<PotentialLender[]> {
    const departments = await prisma.department.findMany({
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
        ),
      })),
    );

    return candidates
      .filter((candidate) => candidate.availableQty > 0)
      .sort((a, b) => b.availableQty - a.availableQty);
  }
}
