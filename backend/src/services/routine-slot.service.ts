import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  CreateRoutineSlotRequest,
  ListRoutineSlotsQuery,
  UpdateRoutineSlotRequest,
} from "../schemas/routine-slot.schema";

const routineSlotInclude = {
  section: {
    select: {
      id: true,
      name: true,
      semester: true,
      course: {
        select: { id: true, code: true, title: true },
      },
    },
  },
  lab: {
    select: {
      id: true,
      name: true,
      roomNo: true,
      department: {
        select: { id: true, code: true, name: true },
      },
    },
  },
} satisfies Prisma.RoutineSlotInclude;

export type RoutineSlotWithRelations = Prisma.RoutineSlotGetPayload<{
  include: typeof routineSlotInclude;
}>;

export interface PaginatedRoutineSlotsResponse {
  data: RoutineSlotWithRelations[];
  total: number;
  page: number;
  limit: number;
}

interface SlotWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: Date;
  effectiveTo: Date;
}

export class RoutineSlotService {
  private static async ensureSectionExists(sectionId: string): Promise<void> {
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
    });

    if (!section) {
      throw new Error("Section not found");
    }
  }

  private static async ensureActiveLab(labId: string): Promise<void> {
    const lab = await prisma.lab.findUnique({ where: { id: labId } });

    if (!lab || !lab.isActive) {
      throw new Error("Lab not found");
    }
  }

  /**
   * Two slots collide when they fall on the same weekday, their times overlap,
   * and their effective date ranges overlap.
   *
   * The time comparison is strict (`<` / `>`) so back-to-back classes — one
   * ending at 11:30 and the next starting at 11:30 — do not block each other.
   * These are HH:MM strings, which order correctly only because the schema
   * enforces zero-padded 24-hour format.
   */
  private static async ensureNoConflict(
    sectionId: string,
    labId: string,
    win: SlotWindow,
    excludeId?: string,
  ): Promise<void> {
    const overlapping = {
      dayOfWeek: win.dayOfWeek,
      startTime: { lt: win.endTime },
      endTime: { gt: win.startTime },
      effectiveFrom: { lte: win.effectiveTo },
      effectiveTo: { gte: win.effectiveFrom },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };

    const labClash = await prisma.routineSlot.findFirst({
      where: { ...overlapping, labId },
    });

    if (labClash) {
      throw new Error(
        "This lab is already booked for an overlapping time slot",
      );
    }

    const sectionClash = await prisma.routineSlot.findFirst({
      where: { ...overlapping, sectionId },
    });

    if (sectionClash) {
      throw new Error(
        "This section already has a class at an overlapping time slot",
      );
    }
  }

  static async createRoutineSlot(
    data: CreateRoutineSlotRequest,
  ): Promise<RoutineSlotWithRelations> {
    await this.ensureSectionExists(data.sectionId);
    await this.ensureActiveLab(data.labId);

    await this.ensureNoConflict(data.sectionId, data.labId, {
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      effectiveFrom: data.effectiveFrom,
      effectiveTo: data.effectiveTo,
    });

    return prisma.routineSlot.create({
      data: {
        sectionId: data.sectionId,
        labId: data.labId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
      },
      include: routineSlotInclude,
    });
  }

  static async listRoutineSlots(
    query: ListRoutineSlotsQuery,
  ): Promise<PaginatedRoutineSlotsResponse> {
    const { sectionId, labId, dayOfWeek } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.RoutineSlotWhereInput = {};

    if (sectionId) {
      where.sectionId = sectionId;
    }

    if (labId) {
      where.labId = labId;
    }

    if (dayOfWeek !== undefined) {
      where.dayOfWeek = dayOfWeek;
    }

    const [routineSlots, total] = await Promise.all([
      prisma.routineSlot.findMany({
        where,
        include: routineSlotInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      }),
      prisma.routineSlot.count({ where }),
    ]);

    return { data: routineSlots, total, page, limit };
  }

  static async getRoutineSlotById(
    id: string,
  ): Promise<RoutineSlotWithRelations> {
    const routineSlot = await prisma.routineSlot.findUnique({
      where: { id },
      include: routineSlotInclude,
    });

    if (!routineSlot) {
      throw new Error("Routine slot not found");
    }

    return routineSlot;
  }

  static async updateRoutineSlot(
    id: string,
    data: UpdateRoutineSlotRequest,
  ): Promise<RoutineSlotWithRelations> {
    const routineSlot = await prisma.routineSlot.findUnique({ where: { id } });

    if (!routineSlot) {
      throw new Error("Routine slot not found");
    }

    if (data.sectionId) {
      await this.ensureSectionExists(data.sectionId);
    }

    if (data.labId) {
      await this.ensureActiveLab(data.labId);
    }

    // A PATCH may change only part of the window, so merge against the stored
    // row before re-checking conflicts and the start/end ordering.
    const merged: SlotWindow = {
      dayOfWeek: data.dayOfWeek ?? routineSlot.dayOfWeek,
      startTime: data.startTime ?? routineSlot.startTime,
      endTime: data.endTime ?? routineSlot.endTime,
      effectiveFrom: data.effectiveFrom ?? routineSlot.effectiveFrom,
      effectiveTo: data.effectiveTo ?? routineSlot.effectiveTo,
    };

    if (merged.startTime >= merged.endTime) {
      throw new Error("Start time must be before end time");
    }

    if (merged.effectiveFrom > merged.effectiveTo) {
      throw new Error(
        "Effective from date must be on or before the effective to date",
      );
    }

    await this.ensureNoConflict(
      data.sectionId ?? routineSlot.sectionId,
      data.labId ?? routineSlot.labId,
      merged,
      id,
    );

    return prisma.routineSlot.update({
      where: { id },
      data: {
        sectionId: data.sectionId,
        labId: data.labId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
      },
      include: routineSlotInclude,
    });
  }

  static async deleteRoutineSlot(id: string): Promise<void> {
    const routineSlot = await prisma.routineSlot.findUnique({
      where: { id },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    });

    if (!routineSlot) {
      throw new Error("Routine slot not found");
    }

    if (routineSlot._count.sessions > 0) {
      throw new Error("Routine slot has class sessions and cannot be deleted");
    }

    await prisma.routineSlot.delete({ where: { id } });
  }
}
