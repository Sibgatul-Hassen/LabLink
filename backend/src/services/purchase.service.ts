import { Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AvailabilityQueryClient } from "./availability.service";
import {
  CreatePurchaseRequestInput,
  ListPurchaseRequestsQuery,
} from "../schemas/purchase.schema";

/** Roles that see every purchase request, not just their own. */
const UNSCOPED_ROLES: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
];

/**
 * Task 5.9's tier 4 always names this role as the first approver — there is
 * no field anywhere that derives it (ApprovalStep.approverRole has no
 * default), so this is this service's own policy: the central store is the
 * first line of purchasing authority, matching how it already gates every
 * other stock-funding action in this codebase (stock adjust/transfer,
 * component create).
 */
const FIRST_APPROVAL_ROLE: Role = "CENTRAL_STORE_OFFICER";

/** No SLA concept exists elsewhere in this codebase; a week is a simple,
 *  documented default for a first purchasing decision. */
const FIRST_APPROVAL_SLA_MS = 7 * 24 * 60 * 60 * 1000;

const purchaseRequestInclude = {
  component: {
    select: { id: true, code: true, name: true, unit: true },
  },
  requisition: {
    select: { id: true, type: true, status: true, departmentId: true },
  },
  steps: {
    orderBy: { level: "asc" },
  },
} satisfies Prisma.PurchaseRequestInclude;

export type PurchaseRequestWithRelations = Prisma.PurchaseRequestGetPayload<{
  include: typeof purchaseRequestInclude;
}>;

export interface PaginatedPurchaseRequestsResponse {
  data: PurchaseRequestWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export interface PurchaseActor {
  id: string;
  role: Role;
  departmentId: string | null;
}

export class PurchaseService {
  /**
   * PurchaseRequest carries no departmentId of its own — only raisedById and
   * an optional requisitionId. So a department-scoped actor sees what they
   * personally raised, plus anything raised against a requisition belonging
   * to their own department (e.g. a tier-4 purchase request the resolver
   * auto-raised on a colleague's requisition). Unscoped roles see everything.
   */
  private static scopeFilter(
    actor: PurchaseActor,
  ): Prisma.PurchaseRequestWhereInput {
    if (UNSCOPED_ROLES.includes(actor.role)) {
      return {};
    }

    return {
      OR: [
        { raisedById: actor.id },
        { requisition: { departmentId: actor.departmentId ?? "__none__" } },
      ],
    };
  }

  /**
   * Task 5.8. Creates the PurchaseRequest and its first ApprovalStep
   * together as one nested write, the same way createBorrowRequest creates
   * a BorrowRequest and its lines. Accepts the same optional transaction
   * client every other multi-tier-aware method in this codebase does, so
   * tier 4 (task 5.9) can call this from inside the resolver's own
   * Serializable transaction and have it become part of that same
   * transaction rather than a separate one.
   *
   * Task 5.10: after creating, always calls aggregatePurchaseRequests() for
   * the same component — see that method for why, and why the return value
   * here may therefore be an older request, not the one just created.
   */
  static async createPurchaseRequest(
    data: CreatePurchaseRequestInput,
    raisedById: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<PurchaseRequestWithRelations> {
    const component = await client.component.findUnique({
      where: { id: data.componentId },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    if (data.requisitionId) {
      const requisition = await client.requisition.findUnique({
        where: { id: data.requisitionId },
      });

      if (!requisition) {
        throw new Error("Requisition not found");
      }
    }

    await client.purchaseRequest.create({
      data: {
        requisitionId: data.requisitionId ?? null,
        componentId: data.componentId,
        qtyNeeded: data.qtyRequested,
        raisedById,
        status: "PENDING",
        currentLevel: 1,
        steps: {
          create: [
            {
              level: 1,
              approverRole: FIRST_APPROVAL_ROLE,
              decision: "PENDING",
              dueAt: new Date(Date.now() + FIRST_APPROVAL_SLA_MS),
              remarks: data.reason,
            },
          ],
        },
      },
    });

    // Task 5.10 — fold this into any other still-PENDING request for the
    // same component rather than leaving duplicates lying around. Always
    // safe to call: with nothing else pending, it just returns what was
    // created above unchanged.
    return this.aggregatePurchaseRequests(data.componentId, client);
  }

  /**
   * Task 5.10. PurchaseRequest has neither a cancelledReason nor a
   * mergedIntoId column — the brief asked me to check, and neither exists.
   * So a merged-away duplicate is marked CANCELLED (preserving the audit
   * trail this codebase always keeps for a status change, rather than a
   * hard delete) and gets "merged into <survivor id>" appended to its own
   * first ApprovalStep's remarks — the only free-text field either model
   * has, the same repurposing createPurchaseRequest already relies on for
   * the create-time `reason`.
   *
   * The oldest PENDING request for the component survives and absorbs
   * every other PENDING request's qtyNeeded; its own first-step remarks
   * gets a matching note about the aggregation. Safe to call at any time,
   * including when there is only one (or zero) PENDING request — it either
   * no-ops and returns that one, or throws "not found" for zero.
   */
  static async aggregatePurchaseRequests(
    componentId: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<PurchaseRequestWithRelations> {
    const pending = await client.purchaseRequest.findMany({
      where: { componentId, status: "PENDING" },
      include: { steps: true },
      orderBy: { createdAt: "asc" },
    });

    if (pending.length === 0) {
      throw new Error("No pending purchase requests found for this component");
    }

    const [survivor, ...duplicates] = pending;

    if (duplicates.length > 0) {
      const totalQty = pending.reduce((sum, pr) => sum + pr.qtyNeeded, 0);

      await client.purchaseRequest.update({
        where: { id: survivor.id },
        data: { qtyNeeded: totalQty },
      });

      const survivorStep = survivor.steps.find((step) => step.level === 1);

      if (survivorStep) {
        const note =
          `Aggregated ${duplicates.length} other pending request(s) for ` +
          `this component; qtyNeeded combined from ${survivor.qtyNeeded} ` +
          `to ${totalQty}.`;

        await client.approvalStep.update({
          where: { id: survivorStep.id },
          data: {
            remarks: survivorStep.remarks
              ? `${survivorStep.remarks}\n${note}`
              : note,
          },
        });
      }

      for (const duplicate of duplicates) {
        await client.purchaseRequest.update({
          where: { id: duplicate.id },
          data: { status: "CANCELLED" },
        });

        const duplicateStep = duplicate.steps.find(
          (step) => step.level === 1,
        );

        if (duplicateStep) {
          const note = `Merged into purchase request ${survivor.id}.`;

          await client.approvalStep.update({
            where: { id: duplicateStep.id },
            data: {
              remarks: duplicateStep.remarks
                ? `${duplicateStep.remarks}\n${note}`
                : note,
            },
          });
        }
      }
    }

    return client.purchaseRequest.findUniqueOrThrow({
      where: { id: survivor.id },
      include: purchaseRequestInclude,
    });
  }

  static async listPurchaseRequests(
    query: ListPurchaseRequestsQuery,
    actor: PurchaseActor,
  ): Promise<PaginatedPurchaseRequestsResponse> {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.PurchaseRequestWhereInput = {
      ...this.scopeFilter(actor),
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.urgency) {
      where.urgency = query.urgency;
    }

    const [purchaseRequests, total] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where,
        include: purchaseRequestInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.purchaseRequest.count({ where }),
    ]);

    return { data: purchaseRequests, total, page, limit };
  }

  static async getPurchaseRequest(
    id: string,
    actor: PurchaseActor,
  ): Promise<PurchaseRequestWithRelations> {
    const purchaseRequest = await prisma.purchaseRequest.findFirst({
      // Scope is part of the lookup, so an out-of-scope record reads as
      // absent rather than forbidden — matches every other getById in this
      // codebase.
      where: { id, ...this.scopeFilter(actor) },
      include: purchaseRequestInclude,
    });

    if (!purchaseRequest) {
      throw new Error("Purchase request not found");
    }

    return purchaseRequest;
  }
}
