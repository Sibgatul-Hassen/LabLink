import { prisma } from "../lib/prisma";
import { CreateComponentRequest, UpdateComponentRequest, ListComponentsQuery } from "../schemas/component.schema";
import { Component } from "@prisma/client";

export interface ComponentWithStock extends Component {
  stock?: { onHand: number; spareQty: number; reorderPoint: number } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export class ComponentService {
  static async createComponent(data: CreateComponentRequest): Promise<ComponentWithStock> {
    const existing = await prisma.component.findUnique({
      where: { code: data.code },
    });

    if (existing && existing.isActive) {
      throw new Error("Component with this code already exists");
    }

    if (existing && !existing.isActive) {
      throw new Error("Component code already exists (soft-deleted)");
    }

    return prisma.component.create({
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        sizeClass: data.sizeClass,
        unit: data.unit || "pcs",
        unitCost: data.unitCost,
        description: data.description,
        isReturnable: data.isReturnable,
        isActive: true,
        stock: {
          create: {
            onHand: 0,
            spareQty: 0,
            reorderPoint: 0,
          },
        },
      },
      include: { stock: true },
    });
  }

  static async listComponents(query: ListComponentsQuery): Promise<PaginatedResponse<ComponentWithStock>> {
    const { search, category } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Record<string, unknown> = { isActive: true };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = { contains: category, mode: "insensitive" };
    }

    const [components, total] = await Promise.all([
      prisma.component.findMany({
        where,
        include: { stock: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.component.count({ where }),
    ]);

    return {
      data: components,
      total,
      page,
      limit,
    };
  }

  static async getComponentById(id: string): Promise<ComponentWithStock> {
    const component = await prisma.component.findUnique({
      where: { id },
      include: { stock: true },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    return component;
  }

  static async updateComponent(id: string, data: UpdateComponentRequest): Promise<ComponentWithStock> {
    const component = await prisma.component.findUnique({ where: { id } });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    if (data.code && data.code !== component.code) {
      const existing = await prisma.component.findUnique({
        where: { code: data.code },
      });

      if (existing && existing.isActive) {
        throw new Error("Component with this code already exists");
      }
    }

    return prisma.component.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        sizeClass: data.sizeClass,
        unit: data.unit,
        unitCost: data.unitCost,
        description: data.description,
        isReturnable: data.isReturnable,
      },
      include: { stock: true },
    });
  }

  static async deleteComponent(id: string): Promise<void> {
    const component = await prisma.component.findUnique({ where: { id } });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    await prisma.component.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
