import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  AdjustStockRequest,
  ListStockMovementsQuery,
  ListStocksQuery,
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
}
