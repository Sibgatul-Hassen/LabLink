import { Prisma, Role, Urgency } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AvailabilityQueryClient } from "./availability.service";
import { NotificationService } from "./notification.service";
import {
  CreatePurchaseRequestInput,
  DecidePurchaseRequestInput,
  ListPurchaseRequestsQuery,
} from "../schemas/purchase.schema";

/** Roles that see every purchase request, not just their own. */
const UNSCOPED_ROLES: Role[] = [
  "CENTRAL_STORE_OFFICER",
  "OFFICE_ADMIN",
  "SYSTEM_ADMIN",
];

/**
 * Task 5.11's queue endpoint. Deliberately narrower than UNSCOPED_ROLES:
 * CENTRAL_STORE_OFFICER sees every purchase request in scopeFilter (it
 * oversees purchasing broadly), but the whole point of the queue is
 * showing that role only the rung actually waiting on its own decision.
 * OFFICE_ADMIN and SYSTEM_ADMIN are administrative oversight roles here,
 * so they see every pending rung regardless of which role it's assigned to.
 */
const QUEUE_OVERSIGHT_ROLES: Role[] = ["OFFICE_ADMIN", "SYSTEM_ADMIN"];

/**
 * Task 5.11. The brief's four buckets are CRITICAL / HIGH / MEDIUM / LOW,
 * but schema.prisma's Urgency enum has no MEDIUM value — only LOW, NORMAL,
 * HIGH, CRITICAL (checked directly, per the brief's own instruction to
 * verify). Since urgencyFor()'s result is what responses report under the
 * existing `urgency` key, and every other part of this API (the stored
 * column's default, listPurchaseRequestsQuerySchema's filter) already
 * speaks LOW/NORMAL/HIGH/CRITICAL, the brief's "MEDIUM" tier is mapped to
 * NORMAL here rather than inventing a value the schema doesn't have.
 */
const URGENCY_RANK: Record<Urgency, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

/**
 * Task 5.12's 3-rung approval ladder, keyed by ApprovalStep.level:
 * rung 1 (CENTRAL_STORE_OFFICER) confirms the department is really out,
 * rung 2 (DEPT_STORE_HEAD) endorses the purchase, rung 3 (OFFICE_ADMIN)
 * approves and buys. No field anywhere derives this (ApprovalStep.
 * approverRole has no default) — it is this service's own policy.
 */
const RUNG_APPROVER_ROLES: Record<number, Role> = {
  1: "CENTRAL_STORE_OFFICER",
  2: "DEPT_STORE_HEAD",
  3: "OFFICE_ADMIN",
};

const FINAL_RUNG_LEVEL = 3;

/** Task 5.8's first-approver policy — now just rung 1 of the ladder. */
const FIRST_APPROVAL_ROLE: Role = RUNG_APPROVER_ROLES[1];

/** No SLA concept exists elsewhere in this codebase; a week is a simple,
 *  documented default for a first purchasing decision. */
const FIRST_APPROVAL_SLA_MS = 7 * 24 * 60 * 60 * 1000;

const purchaseRequestInclude = {
  component: {
    select: { id: true, code: true, name: true, unit: true },
  },
  requisition: {
    // neededTo added for Task 5.11 — urgencyFor()'s primary deadline signal.
    select: {
      id: true,
      type: true,
      status: true,
      departmentId: true,
      neededTo: true,
    },
  },
  steps: {
    orderBy: { level: "asc" },
  },
} satisfies Prisma.PurchaseRequestInclude;

export type PurchaseRequestWithRelations = Prisma.PurchaseRequestGetPayload<{
  include: typeof purchaseRequestInclude;
}>;

/**
 * Task 5.11. The minimal shape urgencyFor() actually needs — narrower than
 * PurchaseRequestWithRelations so it's easy to unit test with plain object
 * literals instead of a full Prisma payload.
 */
export interface UrgencyInput {
  currentLevel: number;
  createdAt: Date;
  requisition: { neededTo: Date } | null;
  steps: { level: number; dueAt: Date }[];
}

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
   * Task 5.19. reorderPoint lives only on Stock (checked schema.prisma
   * directly, per the brief's own instruction to verify) — not on
   * Component, and DepartmentQuota has no such field either. Stock itself
   * has no departmentId (componentId is @unique — the same single
   * office-wide pool every other stock-affecting method in this codebase
   * already treats it as), so there is no per-department reorder point to
   * check: this takes componentId alone, not componentId+departmentId as
   * the brief first proposed.
   *
   * Reuses createPurchaseRequest rather than re-implementing the ladder's
   * first-step creation — which means an already-PENDING request for this
   * component is folded into via Task 5.10's aggregatePurchaseRequests
   * automatically, not duplicated. Requests enough to bring onHand back up
   * to reorderPoint exactly (no schema field says how much to over-order).
   *
   * No-ops (returns null) when there's no Stock row yet for this component,
   * or onHand is still at or above reorderPoint — the common case, so every
   * caller can call this unconditionally without checking first.
   */
  static async checkReorderPoint(
    componentId: string,
    raisedById: string,
    client: AvailabilityQueryClient = prisma,
    context: { requisitionId?: string } = {},
  ): Promise<PurchaseRequestWithRelations | null> {
    const stock = await client.stock.findUnique({ where: { componentId } });

    if (!stock || stock.onHand >= stock.reorderPoint) {
      return null;
    }

    const qtyRequested = stock.reorderPoint - stock.onHand;

    return this.createPurchaseRequest(
      {
        componentId,
        qtyRequested,
        reason:
          `Auto-raised by the reorder-point check: on-hand stock ` +
          `(${stock.onHand}) has dropped below the configured reorder ` +
          `point (${stock.reorderPoint}).`,
        requisitionId: context.requisitionId,
      },
      raisedById,
      client,
    );
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

  /**
   * Task 5.11. PurchaseRequest carries no neededBy/dueAt of its own (checked
   * schema.prisma directly, per the brief). The closest "when is this
   * actually needed by" signal is the linked requisition's neededTo — but
   * requisitionId is optional, so a manually-raised purchase request (no
   * requisition) has none. Falls back to the current pending ApprovalStep's
   * own dueAt (the approval SLA deadline from Task 5.8) in that case, and
   * to the request's own createdAt if even that is somehow missing — which
   * always lands as CRITICAL, a safe default for an otherwise-undated
   * request that still needs someone's attention.
   */
  static urgencyFor(purchaseRequest: UrgencyInput): Urgency {
    const currentStep = purchaseRequest.steps.find(
      (step) => step.level === purchaseRequest.currentLevel,
    );

    const deadline =
      purchaseRequest.requisition?.neededTo ??
      currentStep?.dueAt ??
      purchaseRequest.createdAt;

    const daysUntilNeeded =
      (deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    if (daysUntilNeeded <= 3) {
      return "CRITICAL";
    }

    if (daysUntilNeeded <= 7) {
      return "HIGH";
    }

    if (daysUntilNeeded <= 14) {
      // The brief's "MEDIUM" — see URGENCY_RANK's comment for why this is
      // NORMAL instead.
      return "NORMAL";
    }

    return "LOW";
  }

  /** Overrides the stored `urgency` column in the response with the fresh
   *  computed value — the stored column is never written by this method. */
  private static withComputedUrgency<T extends UrgencyInput>(
    purchaseRequest: T,
  ): T {
    return { ...purchaseRequest, urgency: this.urgencyFor(purchaseRequest) };
  }

  private static sortByUrgency<T extends UrgencyInput>(
    purchaseRequests: T[],
  ): T[] {
    return [...purchaseRequests].sort((a, b) => {
      const rankDiff =
        URGENCY_RANK[this.urgencyFor(a)] - URGENCY_RANK[this.urgencyFor(b)];

      if (rankDiff !== 0) {
        return rankDiff;
      }

      // Oldest-waiting-first within the same urgency tier — natural queue
      // semantics, and shared with getQueue below.
      return a.createdAt.getTime() - b.createdAt.getTime();
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

    // Task 5.11: the requested sort (CRITICAL first, then createdAt) is by
    // the freshly computed urgency, not the stored column — which can only
    // be known after fetching. So this pulls every matching row, sorts in
    // memory, then paginates, rather than paginating at the DB level.
    // Matches this app's scale (lab inventory, not a high-volume queue).
    const allMatching = await prisma.purchaseRequest.findMany({
      where,
      include: purchaseRequestInclude,
    });

    const sorted = this.sortByUrgency(allMatching);
    const total = sorted.length;
    const data = sorted
      .slice((page - 1) * limit, (page - 1) * limit + limit)
      .map((pr) => this.withComputedUrgency(pr));

    return { data, total, page, limit };
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

    return this.withComputedUrgency(purchaseRequest);
  }

  /**
   * Task 5.11. "Current approval rung" means: PENDING requests whose
   * currentLevel step is itself still PENDING, and — for a role-scoped
   * approver — assigned to the caller's own role. currentLevel is a plain
   * Int column with no way to compare it against a related step's `level`
   * inside a Prisma `where` (that's a same-row cross-field comparison,
   * which Prisma can't express without raw SQL), so this fetches every
   * PENDING request with its steps and filters + sorts in memory.
   *
   * Only CENTRAL_STORE_OFFICER exists as an approverRole today —
   * createPurchaseRequest always names it as the level-1 approver, and
   * nothing in this codebase yet advances currentLevel past 1 to name any
   * other role — but the filter is written generically for when that
   * changes. See QUEUE_OVERSIGHT_ROLES for why OFFICE_ADMIN/SYSTEM_ADMIN
   * see every rung while CENTRAL_STORE_OFFICER sees only its own.
   */
  static async getQueue(
    actor: PurchaseActor,
  ): Promise<PurchaseRequestWithRelations[]> {
    const pending = await prisma.purchaseRequest.findMany({
      where: { status: "PENDING" },
      include: purchaseRequestInclude,
    });

    const atCurrentRung = pending.filter((purchaseRequest) => {
      const currentStep = purchaseRequest.steps.find(
        (step) => step.level === purchaseRequest.currentLevel,
      );

      if (!currentStep || currentStep.decision !== "PENDING") {
        return false;
      }

      return (
        QUEUE_OVERSIGHT_ROLES.includes(actor.role) ||
        currentStep.approverRole === actor.role
      );
    });

    return this.sortByUrgency(atCurrentRung).map((pr) =>
      this.withComputedUrgency(pr),
    );
  }

  /**
   * Task 5.13. The brief describes ApprovalStep's decision field as
   * `status`, with a `decidedById` column — schema.prisma has neither:
   * the real fields are `decision` (a Decision enum, not a plain status
   * string) and `approverId` (checked directly, per the brief's own
   * instruction to verify). Both are used here under their real names.
   *
   * "Role must match current rung's approverRole" is enforced literally —
   * there is no SYSTEM_ADMIN override, even though SYSTEM_ADMIN is one of
   * the route's allowed callers (see purchase.routes.ts): the brief states
   * "Only the correct role for that rung may act" with no stated exception,
   * and explicitly tests OFFICE_ADMIN being rejected for acting outside its
   * own rung. Since no rung is ever assigned to SYSTEM_ADMIN, that means
   * SYSTEM_ADMIN can never actually decide a purchase request today — flag
   * this to the user if a break-glass override was actually intended.
   */
  static async decidePurchaseRequest(
    purchaseRequestId: string,
    decision: DecidePurchaseRequestInput,
    actingUser: PurchaseActor,
  ): Promise<PurchaseRequestWithRelations> {
    return prisma.$transaction(async (tx) => {
      const purchaseRequest = await tx.purchaseRequest.findUnique({
        where: { id: purchaseRequestId },
        include: { steps: true },
      });

      if (!purchaseRequest) {
        throw new Error("Purchase request not found");
      }

      if (purchaseRequest.status !== "PENDING") {
        throw new Error("Purchase request is not pending a decision");
      }

      const currentStep = purchaseRequest.steps.find(
        (step) =>
          step.level === purchaseRequest.currentLevel &&
          step.decision === "PENDING",
      );

      if (!currentStep) {
        throw new Error(
          "No pending approval step found for this purchase request",
        );
      }

      if (currentStep.approverRole !== actingUser.role) {
        throw new Error(
          "Role does not match the approver for this purchase request's current rung",
        );
      }

      // Preserve whatever remarks the step already carried (the raiser's
      // original reason at rung 1, or an aggregation note) and append the
      // decider's own remarks rather than overwrite — same audit-trail
      // philosophy Task 5.10's aggregation already uses for this field.
      const remarks = decision.remarks
        ? currentStep.remarks
          ? `${currentStep.remarks}\n${decision.remarks}`
          : decision.remarks
        : currentStep.remarks;

      await tx.approvalStep.update({
        where: { id: currentStep.id },
        data: {
          decision: decision.action === "APPROVE" ? "APPROVED" : "REJECTED",
          approverId: actingUser.id,
          decidedAt: new Date(),
          remarks,
        },
      });

      if (decision.action === "REJECT") {
        await tx.purchaseRequest.update({
          where: { id: purchaseRequest.id },
          data: { status: "REJECTED" },
        });

        // Task 5.20. Whoever raised it, notified — the same raisedById a
        // rejection at any rung (1, 2, or 3) always has, regardless of how
        // far the request got before being turned down.
        await NotificationService.createNotification(
          {
            userId: purchaseRequest.raisedById,
            title: "Purchase request rejected",
            body: `Your purchase request was rejected at rung ${purchaseRequest.currentLevel}.`,
            refType: "PURCHASE",
            refId: purchaseRequest.id,
          },
          tx,
        );
      } else if (purchaseRequest.currentLevel < FINAL_RUNG_LEVEL) {
        const nextLevel = purchaseRequest.currentLevel + 1;
        const nextApproverRole = RUNG_APPROVER_ROLES[nextLevel];

        await tx.approvalStep.create({
          data: {
            purchaseRequestId: purchaseRequest.id,
            level: nextLevel,
            approverRole: nextApproverRole,
            decision: "PENDING",
            dueAt: new Date(Date.now() + FIRST_APPROVAL_SLA_MS),
          },
        });

        await tx.purchaseRequest.update({
          where: { id: purchaseRequest.id },
          data: { currentLevel: nextLevel },
        });

        // Task 5.20. The new step has no approverId yet — it's only ever
        // assigned once someone actually decides on it — so there is no
        // specific individual to notify, only the role that rung belongs
        // to. Every active user holding that role gets notified.
        await NotificationService.notifyRole(
          nextApproverRole,
          {
            title: "Purchase request awaiting your approval",
            body: `A purchase request has escalated to rung ${nextLevel} and needs your decision.`,
            refType: "PURCHASE",
            refId: purchaseRequest.id,
          },
          tx,
        );
      } else {
        await tx.purchaseRequest.update({
          where: { id: purchaseRequest.id },
          data: { status: "APPROVED" },
        });

        // Task 5.20. Fully approved — no rung is left to notify, so this
        // notifies whichever role actually goes on to receive the goods:
        // CENTRAL_STORE_OFFICER, the only role receiveGoods() (Task 5.15)
        // lets call it (besides SYSTEM_ADMIN, an override role rather than
        // the one that would routinely do this).
        await NotificationService.notifyRole(
          "CENTRAL_STORE_OFFICER",
          {
            title: "Purchase request fully approved",
            body: "A purchase request has been fully approved and is ready to be ordered/received.",
            refType: "PURCHASE",
            refId: purchaseRequest.id,
          },
          tx,
        );
      }

      const updated = await tx.purchaseRequest.findUniqueOrThrow({
        where: { id: purchaseRequest.id },
        include: purchaseRequestInclude,
      });

      return this.withComputedUrgency(updated);
    });
  }

  /**
   * Task 5.15. schema.prisma confirms PurchaseRequest.poNumber exists as
   * named, but there is no receivedAt or receivedById column anywhere on
   * it (checked directly, per the brief's own instruction to verify) —
   * only poNumber and receivedQty. This is the exact situation
   * handOverBorrow/returnBorrow already solved elsewhere in this codebase:
   * rather than invent columns, who received the goods and when is
   * recorded the same way every other stock-affecting action here does —
   * the StockMovement row's own performedById/createdAt is the audit trail,
   * not a field on PurchaseRequest itself.
   *
   * qtyReceived has no upper bound enforced against qtyNeeded — the brief
   * only asks for partial receipt (qtyReceived < qtyNeeded) to work, and a
   * supplier over-shipping is just as real a scenario, so this doesn't
   * reject qtyReceived > qtyNeeded either.
   */
  static async receiveGoods(
    purchaseRequestId: string,
    poNumber: string,
    qtyReceived: number,
    actingUser: PurchaseActor,
  ): Promise<PurchaseRequestWithRelations> {
    return prisma.$transaction(async (tx) => {
      const purchaseRequest = await tx.purchaseRequest.findUnique({
        where: { id: purchaseRequestId },
      });

      if (!purchaseRequest) {
        throw new Error("Purchase request not found");
      }

      if (purchaseRequest.status !== "APPROVED") {
        throw new Error(
          "Only an approved purchase request can receive goods",
        );
      }

      const office = await tx.department.findFirst({
        where: { isOffice: true },
      });

      if (!office) {
        throw new Error("Office department not found");
      }

      await tx.stock.upsert({
        where: { componentId: purchaseRequest.componentId },
        update: { onHand: { increment: qtyReceived } },
        create: {
          componentId: purchaseRequest.componentId,
          onHand: qtyReceived,
        },
      });

      await tx.stockMovement.create({
        data: {
          componentId: purchaseRequest.componentId,
          qty: qtyReceived,
          type: "PURCHASE",
          toDeptId: office.id,
          refType: "PURCHASE",
          refId: purchaseRequest.id,
          performedById: actingUser.id,
          note: `PO ${poNumber}`,
        },
      });

      const updated = await tx.purchaseRequest.update({
        where: { id: purchaseRequest.id },
        data: {
          poNumber,
          receivedQty: qtyReceived,
          status: "RECEIVED",
        },
        include: purchaseRequestInclude,
      });

      // Task 5.20. requisitionId is optional — a manually-raised or
      // reorder-point-triggered purchase request (Task 5.19) has none, and
      // there is no "original requisition's requester" to notify in that
      // case, so this only fires when one actually exists.
      if (updated.requisitionId) {
        const requisition = await tx.requisition.findUnique({
          where: { id: updated.requisitionId },
          select: { requestedById: true },
        });

        if (requisition) {
          await NotificationService.createNotification(
            {
              userId: requisition.requestedById,
              title: "Purchased goods received",
              body: `${qtyReceived} unit(s) of your requested component have been received (PO ${poNumber}).`,
              refType: "PURCHASE",
              refId: purchaseRequest.id,
            },
            tx,
          );
        }
      }

      return this.withComputedUrgency(updated);
    });
  }
}
