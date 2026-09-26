import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  PeakClassesQuery,
  ShortageFrequencyQuery,
  LendingNetworkQuery,
  DamageLossQuery,
} from "../schemas/analytics.schema";

const peakSessionInclude = {
  routineSlot: {
    select: {
      startTime: true,
      endTime: true,
      lab: {
        select: { id: true, name: true, roomNo: true, groupSize: true },
      },
      section: {
        select: {
          id: true,
          name: true,
          studentCount: true,
          course: {
            select: {
              id: true,
              code: true,
              departmentId: true,
              department: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ClassSessionInclude;

type PeakSession = Prisma.ClassSessionGetPayload<{
  include: typeof peakSessionInclude;
}>;

export interface PeakSessionSummary {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  courseCode: string;
  sectionName: string;
  labName: string;
  roomNo: string;
  studentCount: number;
  groupSize: number;
  groups: number;
}

export interface DepartmentPeak {
  department: { id: string; code: string; name: string };
  totalSessions: number;
  peak: number;
  peakAt: string | null;
  peakSessions: PeakSessionSummary[];
  peakGroups: number;
  peakGroupsAt: string | null;
}

export interface PeakClassesResult {
  data: DepartmentPeak[];
  from: string | null;
  to: string | null;
}

export interface ShortageFrequencyItem {
  componentId: string;
  componentCode: string;
  componentName: string;
  category: string;
  unit: string;
  shortageCount: number;
  totalQtyShort: number;
  avgQtyShort: number;
}

export interface ShortageFrequencyResult {
  data: ShortageFrequencyItem[];
  total: number;
}

export interface LendingNetworkNode {
  id: string;
  code: string;
  name: string;
}

export interface LendingNetworkEdge {
  lenderDeptId: string;
  lenderCode: string;
  borrowerDeptId: string;
  borrowerCode: string;
  requestCount: number;
  totalQtyBorrowed: number;
}

export interface LendingNetworkResult {
  nodes: LendingNetworkNode[];
  edges: LendingNetworkEdge[];
}

export interface DamageLossItem {
  sectionId: string;
  sectionName: string;
  courseCode: string;
  instructorName: string | null;
  labAssistantName: string | null;
  totalQtyDamaged: number;
  totalQtyLost: number;
}

export interface DamageLossResult {
  data: DamageLossItem[];
}

interface SweepEvent {
  time: number;
  delta: 1 | -1;
  session: PeakSession;
}

/**
 * A class of 45 students in a lab that seats groups of 4 runs 12 groups.
 * This is the same arithmetic the Stage 3 auto-draft multiplies against, so it
 * has to match exactly.
 */
function groupsFor(session: PeakSession): number {
  const groupSize = session.routineSlot.lab.groupSize || 1;
  return Math.ceil(session.routineSlot.section.studentCount / groupSize);
}

function summarise(session: PeakSession): PeakSessionSummary {
  return {
    id: session.id,
    date: session.date.toISOString().slice(0, 10),
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    courseCode: session.routineSlot.section.course.code,
    sectionName: session.routineSlot.section.name,
    labName: session.routineSlot.lab.name,
    roomNo: session.routineSlot.lab.roomNo,
    studentCount: session.routineSlot.section.studentCount,
    groupSize: session.routineSlot.lab.groupSize,
    groups: groupsFor(session),
  };
}

export class AnalyticsService {
  /**
   * Feature 41. Answers "how many of this department's classes run at the same
   * moment, at the worst point?" — the number the quota formula in proposal
   * section 11.3 multiplies out.
   *
   * Works from dated sessions rather than routine slots on purpose: two slots
   * can both read "Tuesday 08:30" and still never collide if their effective
   * ranges do not overlap. Only real sessions know that.
   */
  static async peakClasses(
    query: PeakClassesQuery,
  ): Promise<PeakClassesResult> {
    const { departmentId, from, to } = query;

    const where: Prisma.ClassSessionWhereInput = {
      status: { not: "CANCELLED" },
    };

    if (departmentId) {
      where.routineSlot = { section: { course: { departmentId } } };
    }

    if (from || to) {
      where.date = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const sessions = await prisma.classSession.findMany({
      where,
      include: peakSessionInclude,
    });

    // Bucket by the department that owns the course. Quota belongs to whoever
    // runs the class, not to whoever owns the room.
    const byDepartment = new Map<string, PeakSession[]>();

    for (const session of sessions) {
      const key = session.routineSlot.section.course.departmentId;
      const bucket = byDepartment.get(key);

      if (bucket) {
        bucket.push(session);
      } else {
        byDepartment.set(key, [session]);
      }
    }

    const data: DepartmentPeak[] = [];

    for (const [, departmentSessions] of byDepartment) {
      const department =
        departmentSessions[0].routineSlot.section.course.department;

      const events: SweepEvent[] = [];

      for (const session of departmentSessions) {
        events.push({ time: session.startsAt.getTime(), delta: 1, session });
        events.push({ time: session.endsAt.getTime(), delta: -1, session });
      }

      // Sorting -1 ahead of +1 at an identical timestamp is what makes
      // back-to-back classes not count as simultaneous: the 11:30 finish is
      // processed before the 11:30 start. Same strict rule as proposal 11.1.
      events.sort((a, b) => a.time - b.time || a.delta - b.delta);

      const active = new Map<string, PeakSession>();
      let activeGroups = 0;

      let peak = 0;
      let peakAt: number | null = null;
      let peakSessions: PeakSession[] = [];

      let peakGroups = 0;
      let peakGroupsAt: number | null = null;

      for (const event of events) {
        if (event.delta === 1) {
          active.set(event.session.id, event.session);
          activeGroups += groupsFor(event.session);
        } else {
          active.delete(event.session.id);
          activeGroups -= groupsFor(event.session);
        }

        // The running count can only rise on a start event, so there is
        // nothing to check after a finish.
        if (event.delta !== 1) {
          continue;
        }

        if (active.size > peak) {
          peak = active.size;
          peakAt = event.time;
          peakSessions = [...active.values()];
        }

        if (activeGroups > peakGroups) {
          peakGroups = activeGroups;
          peakGroupsAt = event.time;
        }
      }

      data.push({
        department,
        totalSessions: departmentSessions.length,
        peak,
        peakAt: peakAt === null ? null : new Date(peakAt).toISOString(),
        peakSessions: peakSessions
          .map(summarise)
          .sort((a, b) => a.courseCode.localeCompare(b.courseCode)),
        peakGroups,
        peakGroupsAt:
          peakGroupsAt === null ? null : new Date(peakGroupsAt).toISOString(),
      });
    }

    data.sort((a, b) => a.department.code.localeCompare(b.department.code));

    return {
      data,
      from: from ? from.toISOString().slice(0, 10) : null,
      to: to ? to.toISOString().slice(0, 10) : null,
    };
  }

  static async shortageFrequency(
    query: ShortageFrequencyQuery,
  ): Promise<ShortageFrequencyResult> {
    const where: Prisma.RequisitionLineWhereInput = {
      qtyShort: { gt: 0 },
    };

    if (query.departmentId) {
      where.requisition = {
        departmentId: query.departmentId,
      };
    }

    const grouped = await prisma.requisitionLine.groupBy({
      by: ["componentId"],
      where,
      _count: { id: true },
      _sum: { qtyShort: true },
      _avg: { qtyShort: true },
      orderBy: [{ _count: { id: "desc" } }, { _sum: { qtyShort: "desc" } }],
      take: query.limit,
    });

    const totalGroups = await prisma.requisitionLine.groupBy({
      by: ["componentId"],
      where,
    });

    const total = totalGroups.length;

    const componentIds = grouped.map((g) => g.componentId);
    const components = await prisma.component.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, code: true, name: true, category: true, unit: true },
    });

    const componentMap = new Map(components.map((c) => [c.id, c]));

    const data: ShortageFrequencyItem[] = grouped.map((g) => {
      const comp = componentMap.get(g.componentId)!;
      return {
        componentId: g.componentId,
        componentCode: comp.code,
        componentName: comp.name,
        category: comp.category,
        unit: comp.unit,
        shortageCount: g._count.id,
        totalQtyShort: Number(g._sum.qtyShort ?? 0),
        avgQtyShort: Number(g._avg.qtyShort ?? 0),
      };
    });

    return { data, total };
  }
  static async lendingNetwork(
    query: LendingNetworkQuery,
  ): Promise<LendingNetworkResult> {
    const where: Prisma.BorrowRequestWhereInput = {
      status: { in: ["HANDED_OVER", "RETURNED"] },
    };

    if (query.departmentId) {
      where.OR = [
        { lenderDeptId: query.departmentId },
        { borrowerDeptId: query.departmentId },
      ];
    }

    const borrows = await prisma.borrowRequest.findMany({
      where,
      include: {
        lender: { select: { id: true, code: true, name: true } },
        borrower: { select: { id: true, code: true, name: true } },
        lines: { select: { qtyApproved: true } },
      },
    });

    const nodesMap = new Map<string, LendingNetworkNode>();
    const edgesMap = new Map<string, LendingNetworkEdge>();

    for (const borrow of borrows) {
      if (!nodesMap.has(borrow.lender.id)) {
        nodesMap.set(borrow.lender.id, {
          id: borrow.lender.id,
          code: borrow.lender.code,
          name: borrow.lender.name,
        });
      }
      if (!nodesMap.has(borrow.borrower.id)) {
        nodesMap.set(borrow.borrower.id, {
          id: borrow.borrower.id,
          code: borrow.borrower.code,
          name: borrow.borrower.name,
        });
      }

      const edgeKey = `${borrow.lender.id}-${borrow.borrower.id}`;
      const totalQty = borrow.lines.reduce(
        (sum, line) => sum + Number(line.qtyApproved ?? 0),
        0
      );

      let edge = edgesMap.get(edgeKey);
      if (!edge) {
        edge = {
          lenderDeptId: borrow.lender.id,
          lenderCode: borrow.lender.code,
          borrowerDeptId: borrow.borrower.id,
          borrowerCode: borrow.borrower.code,
          requestCount: 0,
          totalQtyBorrowed: 0,
        };
        edgesMap.set(edgeKey, edge);
      }
      edge.requestCount += 1;
      edge.totalQtyBorrowed += totalQty;
    }

    return {
      nodes: Array.from(nodesMap.values()).sort((a, b) =>
        a.code.localeCompare(b.code)
      ),
      edges: Array.from(edgesMap.values()).sort(
        (a, b) =>
          a.lenderCode.localeCompare(b.lenderCode) ||
          a.borrowerCode.localeCompare(b.borrowerCode)
      ),
    };
  }

  static async damageLossRates(
    query: DamageLossQuery,
  ): Promise<DamageLossResult> {
    const where: Prisma.RequisitionLineWhereInput = {
      OR: [
        { qtyDamaged: { gt: 0 } },
        { qtyLost: { gt: 0 } },
        { allocations: { some: { OR: [
          { damagedQty: { gt: 0 } },
          { lostQty: { gt: 0 } },
        ] } } },
      ],
      requisition: {
        classSessionId: { not: null },
      },
    };

    if (query.departmentId) {
      // Must use the Prisma object structure safely
      where.requisition = {
        classSessionId: { not: null },
        departmentId: query.departmentId,
      };
    }

    const lines = await prisma.requisitionLine.findMany({
      where,
      include: {
        allocations: { select: { damagedQty: true, lostQty: true } },
        requisition: {
          include: {
            classSession: {
              include: {
                routineSlot: {
                  include: {
                    section: {
                      include: {
                        course: true,
                        instructor: true,
                        labAssistant: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const itemsMap = new Map<string, DamageLossItem>();

    for (const line of lines) {
      const section = line.requisition.classSession?.routineSlot.section;
      if (!section) continue;

      let item = itemsMap.get(section.id);
      if (!item) {
        item = {
          sectionId: section.id,
          sectionName: section.name,
          courseCode: section.course.code,
          instructorName: section.instructor?.fullName ?? null,
          labAssistantName: section.labAssistant?.fullName ?? null,
          totalQtyDamaged: 0,
          totalQtyLost: 0,
        };
        itemsMap.set(section.id, item);
      }

      item.totalQtyDamaged += line.qtyDamaged + line.allocations.reduce(
        (sum, allocation) => sum + allocation.damagedQty, 0,
      );
      item.totalQtyLost += line.qtyLost + line.allocations.reduce(
        (sum, allocation) => sum + allocation.lostQty, 0,
      );
    }

    const data = Array.from(itemsMap.values()).sort(
      (a, b) =>
        b.totalQtyDamaged + b.totalQtyLost -
        (a.totalQtyDamaged + a.totalQtyLost)
    );

    return { data };
  }
}
