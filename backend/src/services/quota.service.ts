import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AnalyticsService } from "./analytics.service";
import {
  ListQuotaHistoryQuery,
  ListQuotasQuery,
  UpdateQuotaRequest,
  GenerateQuotaSuggestionsRequest,
} from "../schemas/quota.schema";

const quotaInclude = {
  department: true,
  component: {
    include: {
      stock: true,
    },
  },
} satisfies Prisma.DepartmentQuotaInclude;

type ScopedDepartmentId = string | null | undefined;

function assertDepartmentAccess(
  requestedDepartmentId: string,
  scopedDepartmentId: ScopedDepartmentId,
): void {
  if (scopedDepartmentId === undefined) {
    return;
  }

  if (scopedDepartmentId === null) {
    throw new Error("No department assigned");
  }

  if (requestedDepartmentId !== scopedDepartmentId) {
    throw new Error("Forbidden department access");
  }
}

export class QuotaService {
  static async listQuotas(
    query: ListQuotasQuery,
    scopedDepartmentId: ScopedDepartmentId,
  ) {
    const { search, componentId, category } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    if (
      scopedDepartmentId !== undefined &&
      scopedDepartmentId !== null &&
      query.departmentId &&
      query.departmentId !== scopedDepartmentId
    ) {
      throw new Error("Forbidden department access");
    }

    if (scopedDepartmentId === null) {
      throw new Error("No department assigned");
    }

    const effectiveDepartmentId =
      scopedDepartmentId !== undefined
        ? scopedDepartmentId
        : query.departmentId;

    const where: Prisma.DepartmentQuotaWhereInput = {
      department: {
        is: {
          isActive: true,
        },
      },
      component: {
        is: {
          isActive: true,
          ...(category
            ? {
                category: {
                  contains: category,
                  mode: "insensitive",
                },
              }
            : {}),
        },
      },
    };

    if (effectiveDepartmentId) {
      where.departmentId = effectiveDepartmentId;
    }

    if (componentId) {
      where.componentId = componentId;
    }

    if (search) {
      where.OR = [
        {
          department: {
            is: {
              code: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
        {
          department: {
            is: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
        {
          component: {
            is: {
              code: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
        {
          component: {
            is: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        },
      ];
    }

    const [quotas, total] = await Promise.all([
      prisma.departmentQuota.findMany({
        where,
        include: quotaInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          {
            department: {
              code: "asc",
            },
          },
          {
            component: {
              code: "asc",
            },
          },
        ],
      }),
      prisma.departmentQuota.count({ where }),
    ]);

    return {
      data: quotas,
      total,
      page,
      limit,
    };
  }

  static async getQuota(
    departmentId: string,
    componentId: string,
    scopedDepartmentId: ScopedDepartmentId,
  ) {
    assertDepartmentAccess(departmentId, scopedDepartmentId);

    const quota = await prisma.departmentQuota.findUnique({
      where: {
        departmentId_componentId: {
          departmentId,
          componentId,
        },
      },
      include: quotaInclude,
    });

    if (
      !quota ||
      !quota.department.isActive ||
      !quota.component.isActive
    ) {
      throw new Error("Quota not found");
    }

    return quota;
  }

  static async updateQuota(
    departmentId: string,
    componentId: string,
    data: UpdateQuotaRequest,
    changedById: string,
  ) {
    const [department, component] = await Promise.all([
      prisma.department.findUnique({
        where: { id: departmentId },
      }),
      prisma.component.findUnique({
        where: { id: componentId },
      }),
    ]);

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    return prisma.$transaction(async (tx) => {
      const current = await tx.departmentQuota.findUnique({
        where: {
          departmentId_componentId: {
            departmentId,
            componentId,
          },
        },
      });

      const oldQty = current?.qty ?? 0;
      const newQty = data.qty ?? oldQty;
      const newSuggestedQty =
        data.suggestedQty ?? current?.suggestedQty ?? 0;

      const qtyChanged = newQty !== oldQty;

      if (qtyChanged && !data.reason?.trim()) {
        throw new Error(
          "Reason is required when quota quantity changes",
        );
      }

      const quota = await tx.departmentQuota.upsert({
        where: {
          departmentId_componentId: {
            departmentId,
            componentId,
          },
        },
        update: {
          qty: newQty,
          suggestedQty: newSuggestedQty,
          ...(qtyChanged
            ? {
                confirmedAt: new Date(),
              }
            : {}),
        },
        create: {
          departmentId,
          componentId,
          qty: newQty,
          suggestedQty: newSuggestedQty,
          confirmedAt: qtyChanged ? new Date() : null,
        },
        include: quotaInclude,
      });

      if (qtyChanged) {
        await tx.quotaHistory.create({
          data: {
            departmentId,
            componentId,
            oldQty,
            newQty,
            reason: data.reason!.trim(),
            changedById,
          },
        });
      }

      return quota;
    });
  }

  static async generateSuggestions(
    data: GenerateQuotaSuggestionsRequest,
  ) {
    const department = await prisma.department.findUnique({
      where: { id: data.departmentId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!department || !department.isActive) {
      throw new Error("Department not found");
    }

    const peakResult = await AnalyticsService.peakClasses({
      departmentId: data.departmentId,
      from: data.from,
      to: data.to,
    });

    const peakGroups = peakResult.data[0]?.peakGroups ?? 0;

    const experimentItems = await prisma.experimentItem.findMany({
      where: {
        experiment: {
          course: {
            departmentId: data.departmentId,
            isActive: true,
          },
        },
        component: {
          isActive: true,
        },
      },
      select: {
        componentId: true,
        qtyPerGroup: true,
      },
    });

    const maxQtyPerGroupByComponent = new Map<string, number>();

    for (const item of experimentItems) {
      const current =
        maxQtyPerGroupByComponent.get(item.componentId) ?? 0;

      if (item.qtyPerGroup > current) {
        maxQtyPerGroupByComponent.set(
          item.componentId,
          item.qtyPerGroup,
        );
      }
    }

    const suggestions = [...maxQtyPerGroupByComponent.entries()]
      .map(([componentId, maxQtyPerGroup]) => ({
        componentId,
        maxQtyPerGroup,
        suggestedQty: peakGroups * maxQtyPerGroup,
      }))
      .sort((a, b) => a.componentId.localeCompare(b.componentId));

    await prisma.$transaction(async (tx) => {
      for (const suggestion of suggestions) {
        await tx.departmentQuota.upsert({
          where: {
            departmentId_componentId: {
              departmentId: data.departmentId,
              componentId: suggestion.componentId,
            },
          },
          update: {
            suggestedQty: suggestion.suggestedQty,
          },
          create: {
            departmentId: data.departmentId,
            componentId: suggestion.componentId,
            qty: 0,
            suggestedQty: suggestion.suggestedQty,
            confirmedAt: null,
          },
        });
      }
    });

    return {
      department: {
        id: department.id,
        code: department.code,
        name: department.name,
      },
      peakGroups,
      from: peakResult.from,
      to: peakResult.to,
      suggestions,
    };
  }

  static async listHistory(
    departmentId: string,
    componentId: string,
    query: ListQuotaHistoryQuery,
    scopedDepartmentId: ScopedDepartmentId,
  ) {
    assertDepartmentAccess(departmentId, scopedDepartmentId);

    const quota = await prisma.departmentQuota.findUnique({
      where: {
        departmentId_componentId: {
          departmentId,
          componentId,
        },
      },
      include: {
        department: true,
        component: true,
      },
    });

    if (
      !quota ||
      !quota.department.isActive ||
      !quota.component.isActive
    ) {
      throw new Error("Quota not found");
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.QuotaHistoryWhereInput = {
      departmentId,
      componentId,
    };

    const [history, total] = await Promise.all([
      prisma.quotaHistory.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.quotaHistory.count({ where }),
    ]);

    const changedByIds = [
      ...new Set(history.map((entry) => entry.changedById)),
    ];

    const users =
      changedByIds.length > 0
        ? await prisma.user.findMany({
            where: {
              id: {
                in: changedByIds,
              },
            },
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          })
        : [];

    const usersById = new Map(
      users.map((user) => [user.id, user]),
    );

    return {
      data: history.map((entry) => ({
        ...entry,
        changedBy: usersById.get(entry.changedById) ?? null,
      })),
      total,
      page,
      limit,
    };
  }
}
