import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

export interface AvailabilityWindow {
  from: Date;
  to: Date;
}

/**
 * Either the top-level client or a `prisma.$transaction` callback's `tx`.
 * Every query below takes one of these instead of importing `prisma`
 * directly, so a caller running inside a transaction — the resolver in
 * requisition.service.ts, under Serializable isolation — gets availability
 * reads that are part of that same transaction. Without this, the read and
 * the allocation write would run on separate connections and Postgres would
 * have no way to detect two submits racing for the same units.
 */
export type AvailabilityQueryClient = typeof prisma | Prisma.TransactionClient;

export interface AvailabilityBreakdown {
  departmentId: string;
  componentId: string;
  window: { from: string; to: string };
  quota: number;
  ownClaims: number;
  quotaFree: number;
  onHand: number;
  allClaims: number;
  physicalFree: number;
  available: number;
  bindingConstraint: "QUOTA" | "PHYSICAL" | "EQUAL";
}

/**
 * Two windows overlap when each begins before the other ends.
 *
 * Proposal section 11.1: "The comparison is strict so that back-to-back
 * classes at 11:30 do not block one another." Loosening either operator to
 * <= would make a class that ends at 11:30 conflict with one that starts at
 * 11:30, and the same units could never be reused on the same morning.
 */
export function overlaps(
  a: AvailabilityWindow,
  b: AvailabilityWindow,
): boolean {
  return a.from < b.to && b.from < a.to;
}

/**
 * Sums HELD allocations of one component whose requisition window overlaps the
 * given window.
 *
 * Only HELD counts. Proposal section 11.1: "Once a requisition is ISSUED the
 * components have left the office and onHand has already fallen; counting the
 * allocation as well would subtract the same units twice."
 *
 * An Allocation carries no window of its own — it inherits one from its
 * requisition through RequisitionLine, which is why this reaches two levels up.
 * The date filter below is the same strict rule as overlaps(), expressed as a
 * Prisma predicate.
 */
async function sumOverlappingClaims(
  client: AvailabilityQueryClient,
  componentId: string,
  win: AvailabilityWindow,
  sourceDeptId?: string,
  ignoreRequisitionId?: string,
): Promise<number> {
  const where: Prisma.AllocationWhereInput = {
    status: "HELD",
    ...(sourceDeptId ? { sourceDeptId } : {}),
    OR: [
      { source: "SUBSTITUTE", substituteComponentId: componentId },
      { source: { not: "SUBSTITUTE" }, requisitionLine: { componentId } },
    ],
    requisitionLine: {
      requisition: {
        neededFrom: { lt: win.to },
        neededTo: { gt: win.from },
        ...(ignoreRequisitionId ? { id: { not: ignoreRequisitionId } } : {}),
      },
    },
  };

  const result = await client.allocation.aggregate({
    where,
    _sum: { qty: true },
  });

  return result._sum.qty ?? 0;
}

export class AvailabilityService {
  static async personalSpareBreakdown(componentId: string, win: AvailabilityWindow, client: AvailabilityQueryClient = prisma) {
    const [stock, spareClaims, allClaims] = await Promise.all([
      client.stock.findUnique({ where: { componentId } }),
      client.allocation.aggregate({
        where: {
          source: "SPARE", status: "HELD", sourceDeptId: null,
          requisitionLine: { componentId, requisition: { neededFrom: { lt: win.to }, neededTo: { gt: win.from } } },
        },
        _sum: { qty: true },
      }),
      this.heldForComponent(componentId, win, undefined, client),
    ]);
    const spareQty = stock?.spareQty ?? 0;
    const heldSpare = spareClaims._sum.qty ?? 0;
    const physicalFree = Math.max(0, (stock?.onHand ?? 0) - allClaims);
    return {
      componentId,
      source: "SPARE" as const,
      window: { from: win.from.toISOString(), to: win.to.toISOString() },
      spareQty,
      heldSpare,
      physicalFree,
      available: Math.max(0, Math.min(spareQty - heldSpare, physicalFree)),
    };
  }

  static async heldForComponent(
    componentId: string,
    win: AvailabilityWindow,
    ignoreRequisitionId?: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<number> {
    return sumOverlappingClaims(
      client,
      componentId,
      win,
      undefined,
      ignoreRequisitionId,
    );
  }

  /**
   * Feature 53. Answers: how many units of this component can this department
   * claim over this window?
   *
   * Two constraints, and the answer is the smaller of them:
   *
   *   quotaFree    = the department's cap  − its own overlapping claims
   *   physicalFree = units that exist      − everyone's overlapping claims
   *
   * The minimum is load-bearing. Proposal section 11.1: "Quotas are computed
   * per component as an upper bound, so their sum may legitimately exceed
   * physical stock once units are lost or written off. Without it the system
   * would promise components that no longer exist."
   */
  static async breakdown(
    departmentId: string,
    componentId: string,
    win: AvailabilityWindow,
    ignoreRequisitionId?: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<AvailabilityBreakdown> {
    const [quotaRow, stockRow] = await Promise.all([
      client.departmentQuota.findUnique({
        where: { departmentId_componentId: { departmentId, componentId } },
      }),
      client.stock.findUnique({ where: { componentId } }),
    ]);

    // No quota row means no entitlement, not unlimited entitlement.
    const quota = quotaRow?.qty ?? 0;
    const onHand = stockRow?.onHand ?? 0;

    const [ownClaims, allClaims] = await Promise.all([
      sumOverlappingClaims(client, componentId, win, departmentId, ignoreRequisitionId),
      sumOverlappingClaims(client, componentId, win, undefined, ignoreRequisitionId),
    ]);

    const quotaFree = quota - ownClaims;
    const physicalFree = onHand - allClaims;

    // Clamped at zero: over-allocation should read as "none available", never
    // as a negative that would silently flip a later subtraction.
    const available = Math.max(0, Math.min(quotaFree, physicalFree));

    let bindingConstraint: AvailabilityBreakdown["bindingConstraint"] = "EQUAL";

    if (quotaFree < physicalFree) {
      bindingConstraint = "QUOTA";
    } else if (physicalFree < quotaFree) {
      bindingConstraint = "PHYSICAL";
    }

    return {
      departmentId,
      componentId,
      window: { from: win.from.toISOString(), to: win.to.toISOString() },
      quota,
      ownClaims,
      quotaFree,
      onHand,
      allClaims,
      physicalFree,
      available,
      bindingConstraint,
    };
  }

  /**
   * The signature proposal section 11.1 specifies, returning just the number.
   * The resolver in Stage 3 calls this; the API route uses breakdown() so a
   * caller can see how the figure was reached.
   */
  static async availableToDept(
    departmentId: string,
    componentId: string,
    win: AvailabilityWindow,
    ignoreRequisitionId?: string,
    client: AvailabilityQueryClient = prisma,
  ): Promise<number> {
    const result = await this.breakdown(
      departmentId,
      componentId,
      win,
      ignoreRequisitionId,
      client,
    );

    return result.available;
  }
}
