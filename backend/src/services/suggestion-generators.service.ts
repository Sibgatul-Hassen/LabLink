import { Prisma, Role, SuggestionType } from "@prisma/client";
import { prisma } from "../lib/prisma";

type Candidate = {
  type: SuggestionType;
  key: string;
  targetRole: Role;
  payload: Prisma.InputJsonObject;
  evidence: Prisma.InputJsonObject;
};

const DAY = 24 * 60 * 60 * 1000;

function payloadKey(value: Prisma.JsonValue): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return typeof value.key === "string" ? value.key : null;
}

function minutes(time: string): number {
  const [hours, minute] = time.split(":").map(Number);
  return hours * 60 + minute;
}

function clock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

async function persist(candidates: Candidate[], now: Date): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const byType = new Map<SuggestionType, Candidate[]>();
  for (const candidate of candidates) {
    const group = byType.get(candidate.type) ?? [];
    group.push(candidate);
    byType.set(candidate.type, group);
  }

  for (const [type, group] of byType) {
    const existing = await prisma.suggestion.findMany({
      where: {
        type,
        OR: [
          { status: "PENDING" },
          { createdAt: { gte: new Date(now.getTime() - 7 * DAY) } },
        ],
      },
      select: { payload: true },
    });
    const seen = new Set(existing.map((row) => payloadKey(row.payload)).filter((key): key is string => key !== null));
    for (const candidate of group) {
      if (seen.has(candidate.key)) continue;
      await prisma.suggestion.create({
        data: {
          type,
          targetRole: candidate.targetRole,
          payload: { ...candidate.payload, key: candidate.key },
          evidence: candidate.evidence,
        },
      });
      seen.add(candidate.key);
      counts[type] = (counts[type] ?? 0) + 1;
    }
  }
  return counts;
}

export class SuggestionGenerators {
  static async generateAll(now = new Date()): Promise<Record<string, number>> {
    const groups = await Promise.all([
      this.substitutes(),
      this.reorderPoints(now),
      this.quotas(),
      this.itemLists(now),
      this.collectionRisks(now),
      this.slots(now),
    ]);
    return persist(groups.flat(), now);
  }

  private static async substitutes(): Promise<Candidate[]> {
    const pairs = await prisma.componentSubstitute.findMany({
      where: { original: { isActive: true }, substitute: { isActive: true } },
      include: {
        original: { include: { stock: true } },
        substitute: { include: { stock: true } },
      },
    });
    return pairs.flatMap((pair) => {
      const original = pair.original.stock;
      const alternative = pair.substitute.stock;
      if (!original || original.reorderPoint <= 0 || original.onHand >= original.reorderPoint ||
          !alternative || pair.ratio <= 0 || alternative.onHand < pair.ratio) return [];
      return [{
        type: "SUBSTITUTE" as const,
        key: `${pair.originalId}:${pair.substituteId}`,
        targetRole: "CENTRAL_STORE_OFFICER" as const,
        payload: {
          originalId: pair.originalId, originalCode: pair.original.code,
          substituteId: pair.substituteId, substituteCode: pair.substitute.code,
          ratio: pair.ratio,
        },
        evidence: {
          originalOnHand: original.onHand,
          originalReorderPoint: original.reorderPoint,
          substituteOnHand: alternative.onHand,
          equivalentAvailable: Math.floor(alternative.onHand / pair.ratio),
        },
      }];
    });
  }

  private static async reorderPoints(now: Date): Promise<Candidate[]> {
    const since = new Date(now.getTime() - 28 * DAY);
    const [usage, stocks] = await Promise.all([
      prisma.stockMovement.groupBy({
        by: ["componentId"],
        where: { type: "ISSUE", createdAt: { gte: since, lt: now } },
        _sum: { qty: true },
      }),
      prisma.stock.findMany({
        where: { component: { isActive: true } },
        include: { component: { select: { code: true, name: true } } },
      }),
    ]);
    const stockById = new Map(stocks.map((stock) => [stock.componentId, stock]));
    return usage.flatMap((row) => {
      const stock = stockById.get(row.componentId);
      const issued = Math.max(0, -(row._sum.qty ?? 0));
      const suggested = Math.ceil((issued / 28) * 7 * 1.25);
      if (!stock || issued < 4 || suggested <= stock.reorderPoint) return [];
      return [{
        type: "REORDER_POINT" as const,
        key: row.componentId,
        targetRole: "CENTRAL_STORE_OFFICER" as const,
        payload: {
          componentId: row.componentId, componentCode: stock.component.code,
          componentName: stock.component.name, suggestedReorderPoint: suggested,
        },
        evidence: {
          issuedLast28Days: issued, currentReorderPoint: stock.reorderPoint,
          onHand: stock.onHand, coverageDays: 7, bufferMultiplier: 1.25,
        },
      }];
    });
  }

  private static async quotas(): Promise<Candidate[]> {
    const quotas = await prisma.departmentQuota.findMany({
      where: {
        suggestedQty: { gt: 0 },
        department: { isActive: true }, component: { isActive: true },
      },
      include: {
        department: { select: { code: true } },
        component: { select: { code: true, name: true } },
      },
    });
    return quotas.flatMap((quota) => quota.suggestedQty > quota.qty ? [{
      type: "QUOTA" as const,
      key: `${quota.departmentId}:${quota.componentId}`,
      targetRole: "CENTRAL_STORE_OFFICER" as const,
      payload: {
        departmentId: quota.departmentId, departmentCode: quota.department.code,
        componentId: quota.componentId, componentCode: quota.component.code,
        componentName: quota.component.name, suggestedQty: quota.suggestedQty,
      },
      evidence: { currentQty: quota.qty, calculatedQty: quota.suggestedQty },
    }] : []);
  }

  private static async itemLists(now: Date): Promise<Candidate[]> {
    const lines = await prisma.requisitionLine.findMany({
      where: {
        requisition: {
          type: "CLASS",
          status: { in: ["SUBMITTED", "READY", "ISSUED", "RETURNED"] },
          createdAt: { gte: new Date(now.getTime() - 90 * DAY) },
          classSession: { experimentId: { not: null } },
        },
      },
      include: {
        component: { select: { code: true, name: true, isActive: true } },
        requisition: { include: {
          classSession: { include: {
            experiment: { include: { items: { select: { componentId: true } } } },
            routineSlot: { include: {
              lab: { select: { groupSize: true } },
              section: { include: { course: { select: { departmentId: true } } } },
            } },
          } },
        } },
      },
    });
    const grouped = new Map<string, {
      experimentId: string; componentId: string; componentCode: string;
      componentName: string; departmentId: string; samples: number;
      totalQty: number; totalGroups: number;
    }>();
    for (const line of lines) {
      const session = line.requisition.classSession;
      const experiment = session?.experiment;
      if (!session || !experiment || !line.component.isActive ||
          experiment.items.some((item) => item.componentId === line.componentId)) continue;
      const key = `${experiment.id}:${line.componentId}`;
      const previous = grouped.get(key) ?? {
        experimentId: experiment.id, componentId: line.componentId,
        componentCode: line.component.code, componentName: line.component.name,
        departmentId: session.routineSlot.section.course.departmentId,
        samples: 0, totalQty: 0, totalGroups: 0,
      };
      previous.samples += 1;
      previous.totalQty += line.qtyNeeded;
      previous.totalGroups += Math.ceil(
        session.routineSlot.section.studentCount / Math.max(1, session.routineSlot.lab.groupSize),
      );
      grouped.set(key, previous);
    }
    return [...grouped.entries()].flatMap(([key, item]) => item.samples >= 2 ? [{
      type: "ITEM_LIST" as const,
      key,
      targetRole: "INSTRUCTOR" as const,
      payload: {
        departmentId: item.departmentId, experimentId: item.experimentId,
        componentId: item.componentId, componentCode: item.componentCode,
        componentName: item.componentName,
        suggestedQtyPerGroup: Math.ceil(item.totalQty / Math.max(1, item.totalGroups)),
      },
      evidence: {
        sampledOrders: item.samples, totalQty: item.totalQty,
        totalGroups: item.totalGroups, lookbackDays: 90,
      },
    }] : []);
  }

  private static async collectionRisks(now: Date): Promise<Candidate[]> {
    const requests = await prisma.requisition.findMany({
      where: { status: "ISSUED", neededTo: { lt: new Date(now.getTime() - DAY) } },
      include: {
        department: { select: { code: true } },
        requestedBy: { select: { fullName: true } },
        lines: { select: { qtyIssued: true } },
      },
    });
    return requests.map((request) => ({
      type: "COLLECTION_RISK" as const,
      key: request.id,
      targetRole: "CENTRAL_STORE_OFFICER" as const,
      payload: {
        requisitionId: request.id, departmentCode: request.department.code,
        requesterName: request.requestedBy.fullName,
      },
      evidence: {
        neededTo: request.neededTo.toISOString(),
        overdueHours: Math.floor((now.getTime() - request.neededTo.getTime()) / 3600000),
        originalUnitsIssued: request.lines.reduce((sum, line) => sum + line.qtyIssued, 0),
      },
    }));
  }

  private static async slots(now: Date): Promise<Candidate[]> {
    const slots = await prisma.routineSlot.findMany({
      where: {
        effectiveTo: { gte: now },
        lab: { isActive: true },
        section: { course: { isActive: true } },
      },
      include: {
        lab: { select: { name: true, departmentId: true } },
        section: { select: { name: true, course: { select: { code: true } } } },
      },
      orderBy: [{ labId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    const result: Candidate[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      const first = slots[index];
      for (let next = index + 1; next < slots.length; next += 1) {
        const second = slots[next];
        if (first.labId !== second.labId || first.dayOfWeek !== second.dayOfWeek) break;
        if (first.startTime >= second.endTime || second.startTime >= first.endTime ||
            first.effectiveFrom > second.effectiveTo || second.effectiveFrom > first.effectiveTo) continue;
        const duration = minutes(second.endTime) - minutes(second.startTime);
        if (duration <= 0) continue;
        const concurrent = slots.filter((slot) => slot.labId === second.labId &&
          slot.dayOfWeek === second.dayOfWeek &&
          slot.effectiveFrom <= second.effectiveTo && slot.effectiveTo >= second.effectiveFrom);
        let alternative: number | null = null;
        for (let candidate = 8 * 60; candidate + duration <= 18 * 60; candidate += 30) {
          if (concurrent.every((slot) => candidate + duration <= minutes(slot.startTime) ||
              candidate >= minutes(slot.endTime))) {
            alternative = candidate;
            break;
          }
        }
        if (alternative === null) continue;
        result.push({
          type: "SLOT", key: `${first.id}:${second.id}`,
          targetRole: "DEPT_STORE_HEAD",
          payload: {
            departmentId: second.lab.departmentId,
            labId: second.labId, labName: second.lab.name,
            conflictingSlotId: second.id,
            courseCode: second.section.course.code,
            sectionName: second.section.name,
            proposedStartTime: clock(alternative),
            proposedEndTime: clock(alternative + duration),
          },
          evidence: {
            dayOfWeek: second.dayOfWeek,
            currentStartTime: second.startTime, currentEndTime: second.endTime,
            overlapsSlotId: first.id,
            effectiveFrom: second.effectiveFrom.toISOString(),
            effectiveTo: second.effectiveTo.toISOString(),
          },
        });
      }
    }
    return result;
  }
}
