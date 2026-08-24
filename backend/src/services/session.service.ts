import { Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  AssignExperimentRequest,
  ListSessionsQuery,
} from "../schemas/session.schema";

const sessionInclude = {
  routineSlot: {
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      lab: {
        select: { id: true, name: true, roomNo: true },
      },
      section: {
        select: {
          id: true,
          name: true,
          semester: true,
          studentCount: true,
          instructorId: true,
          course: {
            select: { id: true, code: true, title: true },
          },
        },
      },
    },
  },
  experiment: {
    select: { id: true, number: true, title: true },
  },
} satisfies Prisma.ClassSessionInclude;

export type SessionWithRelations = Prisma.ClassSessionGetPayload<{
  include: typeof sessionInclude;
}>;

export interface PaginatedSessionsResponse {
  data: SessionWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export interface GenerateSessionsResult {
  created: number;
  horizonDays: number;
  from: string;
  to: string;
}

/**
 * Everything here is built in UTC on purpose. `date` is a bare calendar date
 * while `startsAt`/`endsAt` are full timestamps; deriving them from local
 * server time would shift every session depending on where the container runs.
 */
function utcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function combineDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hours,
      minutes,
      0,
      0,
    ),
  );
}

export class SessionService {
  /**
   * Turns recurring routine slots into dated class sessions across a rolling
   * horizon. Safe to re-run: the unique constraint on
   * [routineSlotId, date] means already-generated sessions are skipped rather
   * than duplicated, which is what lets the nightly job call this blindly.
   */
  static async generateSessions(
    horizonDays: number,
  ): Promise<GenerateSessionsResult> {
    const from = utcDateOnly(new Date());
    const to = addUtcDays(from, horizonDays - 1);

    const slots = await prisma.routineSlot.findMany({
      where: {
        effectiveFrom: { lte: to },
        effectiveTo: { gte: from },
      },
    });

    const rows: Prisma.ClassSessionCreateManyInput[] = [];

    for (let offset = 0; offset < horizonDays; offset += 1) {
      const date = addUtcDays(from, offset);
      const dayOfWeek = date.getUTCDay();

      for (const slot of slots) {
        if (slot.dayOfWeek !== dayOfWeek) {
          continue;
        }

        if (
          date < utcDateOnly(slot.effectiveFrom) ||
          date > utcDateOnly(slot.effectiveTo)
        ) {
          continue;
        }

        rows.push({
          routineSlotId: slot.id,
          date,
          startsAt: combineDateAndTime(date, slot.startTime),
          endsAt: combineDateAndTime(date, slot.endTime),
        });
      }
    }

    const result = await prisma.classSession.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return {
      created: result.count,
      horizonDays,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  static async listSessions(
    query: ListSessionsQuery,
  ): Promise<PaginatedSessionsResponse> {
    const { labId, sectionId, courseId, status, from, to } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.ClassSessionWhereInput = {};
    const routineSlotFilter: Prisma.RoutineSlotWhereInput = {};

    if (labId) {
      routineSlotFilter.labId = labId;
    }

    if (sectionId) {
      routineSlotFilter.sectionId = sectionId;
    }

    if (courseId) {
      routineSlotFilter.section = { courseId };
    }

    if (Object.keys(routineSlotFilter).length > 0) {
      where.routineSlot = routineSlotFilter;
    }

    if (status) {
      where.status = status;
    }

    if (from || to) {
      where.date = {
        ...(from ? { gte: utcDateOnly(from) } : {}),
        ...(to ? { lte: utcDateOnly(to) } : {}),
      };
    }

    const [sessions, total] = await Promise.all([
      prisma.classSession.findMany({
        where,
        include: sessionInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { startsAt: "asc" },
      }),
      prisma.classSession.count({ where }),
    ]);

    return { data: sessions, total, page, limit };
  }

  static async getSessionById(id: string): Promise<SessionWithRelations> {
    const session = await prisma.classSession.findUnique({
      where: { id },
      include: sessionInclude,
    });

    if (!session) {
      throw new Error("Class session not found");
    }

    return session;
  }

  /**
   * Feature 40. Takes the caller's identity as plain arguments rather than a
   * request object, so the service stays free of Express.
   */
  static async assignExperiment(
    sessionId: string,
    data: AssignExperimentRequest,
    actor: { id: string; role: Role },
  ): Promise<SessionWithRelations> {
    const session = await prisma.classSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });

    if (!session) {
      throw new Error("Class session not found");
    }

    // An instructor owns only their own sections; a system admin is unscoped.
    if (
      actor.role === "INSTRUCTOR" &&
      session.routineSlot.section.instructorId !== actor.id
    ) {
      throw new Error("You can only assign experiments to your own sections");
    }

    if (data.experimentId) {
      const experiment = await prisma.experiment.findUnique({
        where: { id: data.experimentId },
      });

      if (!experiment) {
        throw new Error("Experiment not found");
      }

      if (experiment.courseId !== session.routineSlot.section.course.id) {
        throw new Error("Experiment does not belong to this session's course");
      }
    }

    await prisma.classSession.update({
      where: { id: sessionId },
      data: { experimentId: data.experimentId },
    });

    return this.getSessionById(sessionId);
  }
}
