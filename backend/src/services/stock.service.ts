import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  AdjustStockRequest,
  ListStockMovementsQuery,
  ListStocksQuery,
  TransferStockRequest,
  UpdateReorderPointRequest,
} from "../schemas/stock.schema";

const stockInclude = {
  component: true,
} satisfies Prisma.StockInclude;

const movementInclude = {
  performedBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.StockMovementInclude;

export class StockService {
  static async listStocks(query: ListStocksQuery) {
    const { search, category, lowStockOnly } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const componentWhere: Prisma.ComponentWhereInput = {
      isActive: true,
    };

    if (search) {
      componentWhere.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) {
      componentWhere.category = {
        contains: category,
        mode: "insensitive",
      };
    }

    const where: Prisma.StockWhereInput = {
      component: componentWhere,
    };

    if (lowStockOnly) {
      const stocks = await prisma.stock.findMany({
        where,
        include: stockInclude,
        orderBy: {
          component: {
            code: "asc",
          },
        },
      });

      const lowStocks = stocks.filter(
        (stock) => stock.onHand <= stock.reorderPoint,
      );

      return {
        data: lowStocks.slice((page - 1) * limit, page * limit),
        total: lowStocks.length,
        page,
        limit,
      };
    }

    const [stocks, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        include: stockInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          component: {
            code: "asc",
          },
        },
      }),
      prisma.stock.count({ where }),
    ]);

    return {
      data: stocks,
      total,
      page,
      limit,
    };
  }

  static async getStockByComponentId(componentId: string) {
    const component = await prisma.component.findUnique({
      where: { id: componentId },
      include: {
        stock: true,
      },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    if (!component.stock) {
      throw new Error("Stock not initialized");
    }

    return {
      ...component.stock,
      component,
    };
  }

  static async updateReorderPoint(
    componentId: string,
    data: UpdateReorderPointRequest,
  ) {
    const component = await prisma.component.findUnique({
      where: { id: componentId },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    return prisma.stock.upsert({
      where: { componentId },
      update: {
        reorderPoint: data.reorderPoint,
      },
      create: {
        componentId,
        onHand: 0,
        spareQty: 0,
        reorderPoint: data.reorderPoint,
      },
      include: stockInclude,
    });
  }

  static async adjustStock(
    componentId: string,
    data: AdjustStockRequest,
    performedById: string,
  ) {
    const component = await prisma.component.findUnique({
      where: { id: componentId },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    return prisma.$transaction(async (tx) => {
      const currentStock = await tx.stock.findUnique({
        where: { componentId },
      });

      const currentOnHand = currentStock?.onHand ?? 0;
      const currentSpareQty = currentStock?.spareQty ?? 0;
      const newOnHand = currentOnHand + data.qty;

      if (newOnHand < 0) {
        throw new Error("Adjustment would make on-hand stock negative");
      }

      if (newOnHand < currentSpareQty) {
        throw new Error(
          "Adjustment would make on-hand stock lower than spare quantity",
        );
      }

      const stock = currentStock
        ? await tx.stock.update({
            where: { componentId },
            data: {
              onHand: newOnHand,
            },
            include: stockInclude,
          })
        : await tx.stock.create({
            data: {
              componentId,
              onHand: newOnHand,
              spareQty: 0,
              reorderPoint: 0,
            },
            include: stockInclude,
          });

      const movement = await tx.stockMovement.create({
        data: {
          componentId,
          qty: data.qty,
          type: "ADJUST",
          performedById,
          note: data.note,
        },
        include: movementInclude,
      });

      return {
        stock,
        movement,
      };
    });
  }

  static async listMovements(
    componentId: string,
    query: ListStockMovementsQuery,
  ) {
    const component = await prisma.component.findUnique({
      where: { id: componentId },
    });

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: Prisma.StockMovementWhereInput = {
      componentId,
    };

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return {
      data: movements,
      total,
      page,
      limit,
    };
  }

  /**
   * Task 4.10. There is no moveStock() in this codebase and no per-department
   * column on Stock to move between — Stock.onHand is one shared physical
   * pool; DepartmentQuota is what actually varies by department. So a
   * "transfer" here reassigns quota entitlement from one department to the
   * other (their combined claim on the shared pool is unchanged) and logs a
   * TRANSFER StockMovement plus a QuotaHistory row on each side, matching how
   * QuotaService.updateQuota already records a quota change.
   */
  static async transferStock(
    data: TransferStockRequest,
    performedById: string,
  ) {
    const [component, fromDept, toDept] = await Promise.all([
      prisma.component.findUnique({ where: { id: data.componentId } }),
      prisma.department.findUnique({ where: { id: data.fromDeptId } }),
      prisma.department.findUnique({ where: { id: data.toDeptId } }),
    ]);

    if (!component || !component.isActive) {
      throw new Error("Component not found");
    }

    if (!fromDept || !fromDept.isActive) {
      throw new Error("Source department not found");
    }

    if (!toDept || !toDept.isActive) {
      throw new Error("Destination department not found");
    }

    return prisma.$transaction(async (tx) => {
      const fromQuota = await tx.departmentQuota.findUnique({
        where: {
          departmentId_componentId: {
            departmentId: data.fromDeptId,
            componentId: data.componentId,
          },
        },
      });

      if (!fromQuota) {
        throw new Error(
          "Transfer would make the source department's quota negative",
        );
      }

      const newFromQty = fromQuota.qty - data.qty;

      if (newFromQty < 0) {
        throw new Error(
          "Transfer would make the source department's quota negative",
        );
      }

      const updatedFromQuota = await tx.departmentQuota.update({
        where: { id: fromQuota.id },
        data: { qty: newFromQty },
      });

      const toQuota = await tx.departmentQuota.findUnique({
        where: {
          departmentId_componentId: {
            departmentId: data.toDeptId,
            componentId: data.componentId,
          },
        },
      });

      const oldToQty = toQuota?.qty ?? 0;
      const newToQty = oldToQty + data.qty;

      const updatedToQuota = toQuota
        ? await tx.departmentQuota.update({
            where: { id: toQuota.id },
            data: { qty: newToQty },
          })
        : await tx.departmentQuota.create({
            data: {
              departmentId: data.toDeptId,
              componentId: data.componentId,
              qty: newToQty,
            },
          });

      const reason =
        data.note?.trim() || `Transfer from ${fromDept.code} to ${toDept.code}`;

      await tx.quotaHistory.createMany({
        data: [
          {
            departmentId: data.fromDeptId,
            componentId: data.componentId,
            oldQty: fromQuota.qty,
            newQty: newFromQty,
            reason,
            changedById: performedById,
          },
          {
            departmentId: data.toDeptId,
            componentId: data.componentId,
            oldQty: oldToQty,
            newQty: newToQty,
            reason,
            changedById: performedById,
          },
        ],
      });

      const movement = await tx.stockMovement.create({
        data: {
          componentId: data.componentId,
          qty: data.qty,
          type: "TRANSFER",
          fromDeptId: data.fromDeptId,
          toDeptId: data.toDeptId,
          performedById,
          note: data.note,
        },
        include: movementInclude,
      });

      return {
        fromQuota: updatedFromQuota,
        toQuota: updatedToQuota,
        movement,
      };
    });
  }
}
