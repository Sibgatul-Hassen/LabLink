import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import stockRouter from "./stock.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", stockRouter);

const testEmails = [
  "stock-central@test.com",
  "stock-admin@test.com",
  "stock-student@test.com",
];

const testComponentCodes = ["STOCK-TEST-001", "STOCK-TEST-LOW"];

async function cleanupTestData() {
  const components = await prisma.component.findMany({
    where: {
      code: {
        in: testComponentCodes,
      },
    },
    select: {
      id: true,
    },
  });

  const componentIds = components.map((component) => component.id);

  if (componentIds.length > 0) {
    await prisma.stockMovement.deleteMany({
      where: {
        componentId: {
          in: componentIds,
        },
      },
    });

    await prisma.stock.deleteMany({
      where: {
        componentId: {
          in: componentIds,
        },
      },
    });

    await prisma.component.deleteMany({
      where: {
        id: {
          in: componentIds,
        },
      },
    });
  }

  await prisma.user.deleteMany({
    where: {
      email: {
        in: testEmails,
      },
    },
  });

  await prisma.department.deleteMany({
    where: {
      code: "STOCKTEST",
    },
  });
}

describe("Stock Management API Integration Tests", () => {
  let centralToken: string;
  let adminToken: string;
  let studentToken: string;
  let componentId: string;
  let lowComponentId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: "STOCKTEST",
        name: "Stock Test Department",
        isOffice: false,
      },
    });

    const passwordHash = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "stock-central@test.com",
        passwordHash,
        fullName: "Stock Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: department.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "stock-admin@test.com",
        passwordHash,
        fullName: "Stock System Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "stock-student@test.com",
        passwordHash,
        fullName: "Stock Student",
        role: "STUDENT",
        departmentId: department.id,
      },
    });

    const component = await prisma.component.create({
      data: {
        code: "STOCK-TEST-001",
        name: "Stock Test Component",
        category: "Stock Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: true,
      },
    });

    componentId = component.id;

    await prisma.stock.create({
      data: {
        componentId,
        onHand: 10,
        spareQty: 2,
        reorderPoint: 5,
      },
    });

    const lowComponent = await prisma.component.create({
      data: {
        code: "STOCK-TEST-LOW",
        name: "Low Stock Test Component",
        category: "Stock Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: true,
      },
    });

    lowComponentId = lowComponent.id;

    await prisma.stock.create({
      data: {
        componentId: lowComponentId,
        onHand: 2,
        spareQty: 1,
        reorderPoint: 3,
      },
    });

    const centralRes = await request(app).post("/api/auth/login").send({
      email: "stock-central@test.com",
      password: "test123",
    });

    expect(centralRes.status).toBe(200);
    centralToken = centralRes.body.token;

    const adminRes = await request(app).post("/api/auth/login").send({
      email: "stock-admin@test.com",
      password: "test123",
    });

    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.token;

    const studentRes = await request(app).post("/api/auth/login").send({
      email: "stock-student@test.com",
      password: "test123",
    });

    expect(studentRes.status).toBe(200);
    studentToken = studentRes.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("READ - GET /api/stocks", () => {
    it("should reject unauthenticated requests", async () => {
      const res = await request(app).get("/api/stocks");

      expect(res.status).toBe(401);
    });

    it("should list stock for an authenticated user", async () => {
      const res = await request(app)
        .get("/api/stocks?search=STOCK-TEST")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.total).toBe(2);
    });

    it("should filter low stock records", async () => {
      const res = await request(app)
        .get("/api/stocks?search=STOCK-TEST&lowStockOnly=true")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].componentId).toBe(lowComponentId);
    });

    it("should get stock by component ID", async () => {
      const res = await request(app)
        .get(`/api/stocks/${componentId}`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.componentId).toBe(componentId);
      expect(res.body.data.onHand).toBe(10);
      expect(res.body.data.spareQty).toBe(2);
      expect(res.body.data.reorderPoint).toBe(5);
    });

    it("should return 404 for a non-existent component", async () => {
      const res = await request(app)
        .get("/api/stocks/nonexistent")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("REORDER POINT - PATCH /api/stocks/:componentId/reorder-point", () => {
    it("should allow CENTRAL_STORE_OFFICER to update reorder point", async () => {
      const res = await request(app)
        .patch(`/api/stocks/${componentId}/reorder-point`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          reorderPoint: 6,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.reorderPoint).toBe(6);
    });

    it("should deny SYSTEM_ADMIN from updating reorder point", async () => {
      const res = await request(app)
        .patch(`/api/stocks/${componentId}/reorder-point`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          reorderPoint: 5,
        });

      expect(res.status).toBe(403);
    });

    it("should reject a negative reorder point", async () => {
      const res = await request(app)
        .patch(`/api/stocks/${componentId}/reorder-point`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          reorderPoint: -1,
        });

      expect(res.status).toBe(400);
    });

    it("should deny STUDENT from updating reorder point", async () => {
      const res = await request(app)
        .patch(`/api/stocks/${componentId}/reorder-point`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          reorderPoint: 8,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("ADJUST - POST /api/stocks/:componentId/adjust", () => {
    it("should increase stock and create an ADJUST movement", async () => {
      const res = await request(app)
        .post(`/api/stocks/${componentId}/adjust`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 5,
          note: "Integration test increase",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.stock.onHand).toBe(15);
      expect(res.body.data.movement.qty).toBe(5);
      expect(res.body.data.movement.type).toBe("ADJUST");
      expect(res.body.data.movement.note).toBe("Integration test increase");
      expect(res.body.data.movement.performedBy.email).toBe(
        "stock-central@test.com",
      );
    });

    it("should decrease stock and create an ADJUST movement", async () => {
      const res = await request(app)
        .post(`/api/stocks/${componentId}/adjust`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: -5,
          note: "Integration test decrease",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.stock.onHand).toBe(10);
      expect(res.body.data.movement.qty).toBe(-5);
      expect(res.body.data.movement.type).toBe("ADJUST");
    });

    it("should reject zero quantity", async () => {
      const res = await request(app)
        .post(`/api/stocks/${componentId}/adjust`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 0,
        });

      expect(res.status).toBe(400);
    });

    it("should reject adjustment that makes on-hand negative", async () => {
      const res = await request(app)
        .post(`/api/stocks/${componentId}/adjust`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: -20,
        });

      expect(res.status).toBe(409);

      const stock = await prisma.stock.findUnique({
        where: {
          componentId,
        },
      });

      expect(stock?.onHand).toBe(10);
    });

    it("should reject adjustment below spare quantity", async () => {
      const res = await request(app)
        .post(`/api/stocks/${componentId}/adjust`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: -9,
        });

      expect(res.status).toBe(409);

      const stock = await prisma.stock.findUnique({
        where: {
          componentId,
        },
      });

      expect(stock?.onHand).toBe(10);
    });

    it("should deny STUDENT from adjusting stock", async () => {
      const res = await request(app)
        .post(`/api/stocks/${componentId}/adjust`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          qty: 1,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("MOVEMENTS - GET /api/stocks/:componentId/movements", () => {
    it("should return adjustment history newest first", async () => {
      const res = await request(app)
        .get(`/api/stocks/${componentId}/movements`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].qty).toBe(-5);
      expect(res.body.data[1].qty).toBe(5);
    });
  });

  describe("TRANSFER - POST /api/stocks/transfer", () => {
    const transferDeptCodes = ["STOCKTEST-XFER-A", "STOCKTEST-XFER-B"];

    let transferDeptAId: string;
    let transferDeptBId: string;

    beforeAll(async () => {
      const deptA = await prisma.department.create({
        data: {
          code: transferDeptCodes[0],
          name: "Stock Transfer Test Dept A",
          isOffice: false,
        },
      });
      transferDeptAId = deptA.id;

      const deptB = await prisma.department.create({
        data: {
          code: transferDeptCodes[1],
          name: "Stock Transfer Test Dept B",
          isOffice: false,
        },
      });
      transferDeptBId = deptB.id;

      await prisma.departmentQuota.create({
        data: { departmentId: transferDeptAId, componentId, qty: 10 },
      });
    });

    afterAll(async () => {
      await prisma.quotaHistory.deleteMany({
        where: { departmentId: { in: [transferDeptAId, transferDeptBId] } },
      });
      await prisma.departmentQuota.deleteMany({
        where: { departmentId: { in: [transferDeptAId, transferDeptBId] } },
      });
      await prisma.department.deleteMany({
        where: { code: { in: transferDeptCodes } },
      });
    });

    it("should deny STUDENT from transferring stock", async () => {
      const res = await request(app)
        .post("/api/stocks/transfer")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          fromDeptId: transferDeptAId,
          toDeptId: transferDeptBId,
          componentId,
          qty: 3,
        });

      expect(res.status).toBe(403);
    });

    it("should reject transferring to the same department", async () => {
      const res = await request(app)
        .post("/api/stocks/transfer")
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          fromDeptId: transferDeptAId,
          toDeptId: transferDeptAId,
          componentId,
          qty: 1,
        });

      expect(res.status).toBe(400);
    });

    it("should reject a transfer that exceeds the source department's quota", async () => {
      const res = await request(app)
        .post("/api/stocks/transfer")
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          fromDeptId: transferDeptAId,
          toDeptId: transferDeptBId,
          componentId,
          qty: 100,
        });

      expect(res.status).toBe(409);
    });

    it("should move quota entitlement from one department to another", async () => {
      const res = await request(app)
        .post("/api/stocks/transfer")
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          fromDeptId: transferDeptAId,
          toDeptId: transferDeptBId,
          componentId,
          qty: 4,
          note: "Integration test transfer",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.fromQuota.qty).toBe(6);
      expect(res.body.data.toQuota.qty).toBe(4);
      expect(res.body.data.movement.type).toBe("TRANSFER");
      expect(res.body.data.movement.fromDeptId).toBe(transferDeptAId);
      expect(res.body.data.movement.toDeptId).toBe(transferDeptBId);

      const history = await prisma.quotaHistory.findMany({
        where: {
          componentId,
          departmentId: { in: [transferDeptAId, transferDeptBId] },
        },
      });

      expect(history).toHaveLength(2);
    });
  });
});
