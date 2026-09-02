import { prisma } from "../lib/prisma";
import {
  CreateComponentSubstituteRequest,
  UpdateComponentSubstituteRequest,
} from "../schemas/component-substitute.schema";
import { Prisma } from "@prisma/client";

const substituteInclude = {
  substitute: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.ComponentSubstituteInclude;

export class ComponentSubstituteService {
  static async listSubstitutes(componentId: string) {
    return prisma.componentSubstitute.findMany({
      where: { originalId: componentId },
      include: substituteInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  static async addSubstitute(
    componentId: string,
    data: CreateComponentSubstituteRequest,
    approvedById?: string,
  ) {
    if (data.substituteId === componentId) {
      throw new Error("SELF_SUBSTITUTE");
    }

    const substituteComponent = await prisma.component.findUnique({
      where: { id: data.substituteId },
    });

    if (!substituteComponent || !substituteComponent.isActive) {
      throw new Error("SUBSTITUTE_NOT_FOUND");
    }

    try {
      await prisma.componentSubstitute.create({
        data: {
          originalId: componentId,
          substituteId: data.substituteId,
          ratio: data.ratio ?? 1,
          notes: data.notes ?? undefined,
          approvedById: approvedById ?? undefined,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new Error("DUPLICATE_PAIR");
      }
      throw err;
    }

    return this.listSubstitutes(componentId);
  }

  static async updateSubstitute(
    componentId: string,
    substituteRowId: string,
    data: UpdateComponentSubstituteRequest,
  ) {
    const row = await prisma.componentSubstitute.findUnique({
      where: { id: substituteRowId },
    });

    if (!row || row.originalId !== componentId) {
      throw new Error("PAIR_NOT_FOUND");
    }

    await prisma.componentSubstitute.update({
      where: { id: substituteRowId },
      data: {
        ratio: data.ratio,
        notes: data.notes,
      },
    });

    return this.listSubstitutes(componentId);
  }

  static async removeSubstitute(componentId: string, substituteRowId: string) {
    const row = await prisma.componentSubstitute.findUnique({
      where: { id: substituteRowId },
    });

    if (!row || row.originalId !== componentId) {
      throw new Error("PAIR_NOT_FOUND");
    }

    await prisma.componentSubstitute.delete({
      where: { id: substituteRowId },
    });

    return this.listSubstitutes(componentId);
  }
}
