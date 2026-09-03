import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

export interface AvailabilityWindow {
  from: Date;
  to: Date;
}

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
  componentId: string,
  win: AvailabilityWindow,
  sourceDeptId?: string,
  ignoreRequisitionId?: string,
): Promise<number> {
  const where: Prisma.AllocationWhereInput = {
    status: "HELD",
    ...(sourceDeptId ? { sourceDeptId } : {}),
    requisitionLine: {
      componentId,
      requisition: {
        neededFrom: { lt: win.to },
        neededTo: { gt: win.from },
        ...(ignoreRequisitionId ? { id: { not: ignoreRequisitionId } } : {}),
      },
    },
  };

  const result = await prisma.allocation.aggregate({
    where,
    _sum: { qty: true },
  });

  return result._sum.qty ?? 0;
}

export class AvailabilityService {
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
  ): Promise<AvailabilityBreakdown> {
    const [quotaRow, stockRow] = await Promise.all([
      prisma.departmentQuota.findUnique({
        where: { departmentId_componentId: { departmentId, componentId } },
      }),
      prisma.stock.findUnique({ where: { componentId } }),
    ]);

    // No quota row means no entitlement, not unlimited entitlement.
    const quota = quotaRow?.qty ?? 0;
    const onHand = stockRow?.onHand ?? 0;

    const [ownClaims, allClaims] = await Promise.all([
      sumOverlappingClaims(componentId, win, departmentId, ignoreRequisitionId),
      sumOverlappingClaims(componentId, win, undefined, ignoreRequisitionId),
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
  ): Promise<number> {
    const result = await this.breakdown(
      departmentId,
      componentId,
      win,
      ignoreRequisitionId,
    );

    return result.available;
  }
}
