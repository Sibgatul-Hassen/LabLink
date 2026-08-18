import { Department } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  CreateDepartmentRequest,
  ListDepartmentsQuery,
  UpdateDepartmentRequest,
} from "../schemas/department.schema";

export interface PaginatedDepartmentsResponse {
  data: Department[];
  total: number;
  page: number;
  limit: number;
}

export class DepartmentService {
  static async createDepartment(
    data: CreateDepartmentRequest,
  ): Promise<Department> {
    const existing = await prisma.department.findUnique({
      where: { code: data.code },
    });

    if (existing && existing.isActive) {
      throw new Error("Department with this code already exists");
    }

    if (existing && !existing.isActive) {
      throw new Error("Department code already exists (soft-deleted)");
    }

    return prisma.department.create({
      data: {
        code: data.code,
        name: data.name,
        isOffice: data.isOffice,
        isActive: true,
      },
    });
  }

  static async listDepartments(
    query: ListDepartmentsQuery,
  ): Promise<PaginatedDepartmentsResponse> {
    const { search } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (search) {
      where.OR = [
        {
          code: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.department.count({ where }),
    ]);

    return {
      data: departments,
      total,
      page,
      limit,
    };
  }

  static async getDepartmentById(id: string): Promise<Department> {
    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }

    return department;
  }

  static async updateDepartment(
    id: string,
    data: UpdateDepartmentRequest,
  ): Promise<Department> {
    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }

    if (data.code && data.code !== department.code) {
      const existing = await prisma.department.findUnique({
        where: { code: data.code },
      });

      if (existing && existing.id !== id) {
        if (existing.isActive) {
          throw new Error("Department with this code already exists");
        }

        throw new Error("Department code already exists (soft-deleted)");
      }
    }

    return prisma.department.update({
      where: { id },
      data: {
        code: data.code,
        name: data.name,
        isOffice: data.isOffice,
      },
    });
  }

  static async deleteDepartment(id: string): Promise<void> {
    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }

    await prisma.department.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
