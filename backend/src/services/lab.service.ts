import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import {
  CreateLabRequest,
  ListLabsQuery,
  UpdateLabRequest,
} from "../schemas/lab.schema";

const labInclude = {
  department: {
    select: { id: true, code: true, name: true },
  },
  labAssistant: {
    select: { id: true, fullName: true, email: true, role: true },
  },
} satisfies Prisma.LabInclude;

export type LabWithRelations = Prisma.LabGetPayload<{
  include: typeof labInclude;
}>;

export interface PaginatedLabsResponse {
  data: LabWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export class LabService {
  private static async ensureActiveDepartment(
    departmentId: string,
  ): Promise<void> {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }
  }

  private static async ensureValidLabAssistant(
    labAssistantId: string,
  ): Promise<void> {
    const labAssistant = await prisma.user.findUnique({
      where: { id: labAssistantId },
    });

    if (!labAssistant || !labAssistant.isActive) {
      throw new Error("Lab assistant not found");
    }

    if (labAssistant.role !== "LAB_ASSISTANT") {
      throw new Error("User must have LAB_ASSISTANT role");
    }
  }

  private static async ensureUniqueLab(
    departmentId: string,
    roomNo: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await prisma.lab.findFirst({
      where: {
        departmentId,
        roomNo,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new Error(
        "Lab with this room number already exists in this department",
      );
    }
  }

  static async createLab(data: CreateLabRequest): Promise<LabWithRelations> {
    await this.ensureActiveDepartment(data.departmentId);

    if (data.labAssistantId) {
      await this.ensureValidLabAssistant(data.labAssistantId);
    }

    await this.ensureUniqueLab(data.departmentId, data.roomNo);

    return prisma.lab.create({
      data: {
        name: data.name,
        roomNo: data.roomNo,
        groupSize: data.groupSize,
        departmentId: data.departmentId,
        labAssistantId: data.labAssistantId ?? null,
        isActive: true,
      },
      include: labInclude,
    });
  }

  static async listLabs(query: ListLabsQuery): Promise<PaginatedLabsResponse> {
    const { search, departmentId } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.LabWhereInput = { isActive: true };

    if (departmentId) {
      where.departmentId = departmentId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { roomNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [labs, total] = await Promise.all([
      prisma.lab.findMany({
        where,
        include: labInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.lab.count({ where }),
    ]);

    return { data: labs, total, page, limit };
  }

  static async getLabById(id: string): Promise<LabWithRelations> {
    const lab = await prisma.lab.findUnique({
      where: { id },
      include: labInclude,
    });

    if (!lab || !lab.isActive) {
      throw new Error("Lab not found");
    }

    return lab;
  }

  static async updateLab(
    id: string,
    data: UpdateLabRequest,
  ): Promise<LabWithRelations> {
    const lab = await prisma.lab.findUnique({ where: { id } });

    if (!lab || !lab.isActive) {
      throw new Error("Lab not found");
    }

    if (data.departmentId) {
      await this.ensureActiveDepartment(data.departmentId);
    }

    if (data.labAssistantId) {
      await this.ensureValidLabAssistant(data.labAssistantId);
    }

    if (data.departmentId || data.roomNo) {
      await this.ensureUniqueLab(
        data.departmentId ?? lab.departmentId,
        data.roomNo ?? lab.roomNo,
        id,
      );
    }

    return prisma.lab.update({
      where: { id },
      data: {
        name: data.name,
        roomNo: data.roomNo,
        groupSize: data.groupSize,
        departmentId: data.departmentId,
        labAssistantId:
          data.labAssistantId === undefined ? undefined : data.labAssistantId,
      },
      include: labInclude,
    });
  }

  static async deleteLab(id: string): Promise<void> {
    const lab = await prisma.lab.findUnique({ where: { id } });

    if (!lab || !lab.isActive) {
      throw new Error("Lab not found");
    }

    await prisma.lab.update({ where: { id }, data: { isActive: false } });
  }
}
