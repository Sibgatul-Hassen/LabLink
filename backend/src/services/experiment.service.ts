import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AcademicActor, experimentReadScope } from "./academic-read-scope";
import {
  CreateExperimentItemRequest,
  CreateExperimentRequest,
  ListExperimentsQuery,
  UpdateExperimentItemRequest,
  UpdateExperimentRequest,
} from "../schemas/experiment.schema";

const experimentInclude = {
  course: {
    select: { id: true, code: true, title: true },
  },
  items: {
    include: {
      component: {
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          sizeClass: true,
        },
      },
    },
    orderBy: { component: { code: "asc" } },
  },
} satisfies Prisma.ExperimentInclude;

export type ExperimentWithRelations = Prisma.ExperimentGetPayload<{
  include: typeof experimentInclude;
}>;

export interface PaginatedExperimentsResponse {
  data: ExperimentWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export class ExperimentService {
  private static async ensureActiveCourse(courseId: string): Promise<void> {
    const course = await prisma.course.findUnique({ where: { id: courseId } });

    if (!course || !course.isActive) {
      throw new Error("Course not found");
    }
  }

  private static async ensureActiveComponent(
    componentId: string,
  ): Promise<void> {
    const component = await prisma.component.findUnique({
      where: { id: componentId },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }
  }

  private static async ensureUniqueNumber(
    courseId: string,
    number: number,
    excludeId?: string,
  ): Promise<void> {
    const existing = await prisma.experiment.findFirst({
      where: {
        courseId,
        number,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new Error(
        "Experiment with this number already exists for the course",
      );
    }
  }

  static async createExperiment(
    data: CreateExperimentRequest,
  ): Promise<ExperimentWithRelations> {
    await this.ensureActiveCourse(data.courseId);
    await this.ensureUniqueNumber(data.courseId, data.number);

    return prisma.experiment.create({
      data: {
        courseId: data.courseId,
        number: data.number,
        title: data.title,
      },
      include: experimentInclude,
    });
  }

  static async listExperiments(
    query: ListExperimentsQuery,
    actor?: AcademicActor,
  ): Promise<PaginatedExperimentsResponse> {
    const { search, courseId } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.ExperimentWhereInput = actor ? { AND: [experimentReadScope(actor)] } : {};

    if (courseId) {
      where.courseId = courseId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { course: { code: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [experiments, total] = await Promise.all([
      prisma.experiment.findMany({
        where,
        include: experimentInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ course: { code: "asc" } }, { number: "asc" }],
      }),
      prisma.experiment.count({ where }),
    ]);

    return { data: experiments, total, page, limit };
  }

  static async getExperimentById(id: string, actor?: AcademicActor): Promise<ExperimentWithRelations> {
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: experimentInclude,
    });

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    if (actor && !(await prisma.experiment.count({ where: { id, AND: [experimentReadScope(actor)] } }))) throw new Error("Forbidden");
    return experiment;
  }

  static async updateExperiment(
    id: string,
    data: UpdateExperimentRequest,
  ): Promise<ExperimentWithRelations> {
    const experiment = await prisma.experiment.findUnique({ where: { id } });

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    if (data.courseId) {
      await this.ensureActiveCourse(data.courseId);
    }

    if (data.courseId || data.number !== undefined) {
      await this.ensureUniqueNumber(
        data.courseId ?? experiment.courseId,
        data.number ?? experiment.number,
        id,
      );
    }

    return prisma.experiment.update({
      where: { id },
      data: {
        courseId: data.courseId,
        number: data.number,
        title: data.title,
      },
      include: experimentInclude,
    });
  }

  static async deleteExperiment(id: string): Promise<void> {
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    });

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    if (experiment._count.sessions > 0) {
      throw new Error(
        "Experiment is assigned to class sessions and cannot be deleted",
      );
    }

    // ExperimentItem declares onDelete: Cascade, so the item list goes with it.
    await prisma.experiment.delete({ where: { id } });
  }

  static async addItem(
    experimentId: string,
    data: CreateExperimentItemRequest,
  ): Promise<ExperimentWithRelations> {
    const experiment = await prisma.experiment.findUnique({
      where: { id: experimentId },
    });

    if (!experiment) {
      throw new Error("Experiment not found");
    }

    await this.ensureActiveComponent(data.componentId);

    const existing = await prisma.experimentItem.findFirst({
      where: { experimentId, componentId: data.componentId },
    });

    if (existing) {
      throw new Error("This component is already on the experiment item list");
    }

    await prisma.experimentItem.create({
      data: {
        experimentId,
        componentId: data.componentId,
        qtyPerGroup: data.qtyPerGroup,
      },
    });

    return this.getExperimentById(experimentId);
  }

  static async updateItem(
    experimentId: string,
    itemId: string,
    data: UpdateExperimentItemRequest,
  ): Promise<ExperimentWithRelations> {
    const item = await prisma.experimentItem.findUnique({
      where: { id: itemId },
    });

    // Guard the parent as well, so an item cannot be reached through the wrong
    // experiment's URL.
    if (!item || item.experimentId !== experimentId) {
      throw new Error("Experiment item not found");
    }

    if (data.componentId && data.componentId !== item.componentId) {
      await this.ensureActiveComponent(data.componentId);

      const duplicate = await prisma.experimentItem.findFirst({
        where: {
          experimentId,
          componentId: data.componentId,
          id: { not: itemId },
        },
      });

      if (duplicate) {
        throw new Error(
          "This component is already on the experiment item list",
        );
      }
    }

    await prisma.experimentItem.update({
      where: { id: itemId },
      data: {
        componentId: data.componentId,
        qtyPerGroup: data.qtyPerGroup,
      },
    });

    return this.getExperimentById(experimentId);
  }

  static async deleteItem(experimentId: string, itemId: string): Promise<void> {
    const item = await prisma.experimentItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.experimentId !== experimentId) {
      throw new Error("Experiment item not found");
    }

    await prisma.experimentItem.delete({ where: { id: itemId } });
  }
}
