import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import quotaRouter from "./quota.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", quotaRouter);

const testEmails = [
  "quota-central@test.com",
  "quota-admin@test.com",
  "quota-office@test.com",
  "quota-student@test.com",
];

const testDepartmentCodes = [
  "QUOTA-A",
  "QUOTA-B",
  "QUOTA-INACTIVE",
];

const testComponentCodes = [
  "QUOTA-COMP-001",
  "QUOTA-COMP-002",
  "QUOTA-COMP-INACTIVE",
];

async function cleanupTestData() {
  const departments = await prisma.department.findMany({
    where: {
      code: {
        in: testDepartmentCodes,
      },
    },
    select: {
      id: true,
    },
  });

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

  const departmentIds = departments.map((department) => department.id);
  const componentIds = components.map((component) => component.id);

  if (departmentIds.length > 0 || componentIds.length > 0) {
    await prisma.quotaHistory.deleteMany({
      where: {
        OR: [
          ...(departmentIds.length > 0
            ? [{ departmentId: { in: departmentIds } }]
            : []),
          ...(componentIds.length > 0
            ? [{ componentId: { in: componentIds } }]
            : []),
        ],
      },
    });

    await prisma.departmentQuota.deleteMany({
      where: {
        OR: [
          ...(departmentIds.length > 0
            ? [{ departmentId: { in: departmentIds } }]
            : []),
          ...(componentIds.length > 0
            ? [{ componentId: { in: componentIds } }]
            : []),
        ],
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

  if (componentIds.length > 0) {
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

  if (departmentIds.length > 0) {
    await prisma.department.deleteMany({
      where: {
        id: {
          in: departmentIds,
        },
      },
    });
  }
}

describe("Department Quota API Integration Tests", () => {
  let centralToken: string;
  let adminToken: string;
  let officeToken: string;
  let studentToken: string;

  let departmentAId: string;
  let departmentBId: string;
  let inactiveDepartmentId: string;

  let componentAId: string;
  let componentBId: string;
  let inactiveComponentId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const departmentA = await prisma.department.create({
      data: {
        code: "QUOTA-A",
        name: "Quota Department A",
        isOffice: false,
        isActive: true,
      },
    });

    departmentAId = departmentA.id;

    const departmentB = await prisma.department.create({
      data: {
        code: "QUOTA-B",
        name: "Quota Department B",
        isOffice: false,
        isActive: true,
      },
    });

    departmentBId = departmentB.id;

    const inactiveDepartment = await prisma.department.create({
      data: {
        code: "QUOTA-INACTIVE",
        name: "Inactive Quota Department",
        isOffice: false,
        isActive: false,
      },
    });

    inactiveDepartmentId = inactiveDepartment.id;

    const passwordHash = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "quota-central@test.com",
        passwordHash,
        fullName: "Quota Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: departmentAId,
      },
    });

    await prisma.user.create({
      data: {
        email: "quota-admin@test.com",
        passwordHash,
        fullName: "Quota System Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "quota-office@test.com",
        passwordHash,
        fullName: "Quota Office Admin",
        role: "OFFICE_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "quota-student@test.com",
        passwordHash,
        fullName: "Quota Student",
        role: "STUDENT",
        departmentId: departmentAId,
      },
    });

    const componentA = await prisma.component.create({
      data: {
        code: "QUOTA-COMP-001",
        name: "Quota Component One",
        category: "Quota Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: true,
      },
    });

    componentAId = componentA.id;

    const componentB = await prisma.component.create({
      data: {
        code: "QUOTA-COMP-002",
        name: "Quota Component Two",
        category: "Quota Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: true,
      },
    });

    componentBId = componentB.id;

    const inactiveComponent = await prisma.component.create({
      data: {
        code: "QUOTA-COMP-INACTIVE",
        name: "Inactive Quota Component",
        category: "Quota Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: false,
      },
    });

    inactiveComponentId = inactiveComponent.id;

    await prisma.stock.createMany({
      data: [
        {
          componentId: componentAId,
          onHand: 20,
          spareQty: 2,
          reorderPoint: 5,
        },
        {
          componentId: componentBId,
          onHand: 15,
          spareQty: 1,
          reorderPoint: 4,
        },
      ],
    });

    await prisma.departmentQuota.createMany({
      data: [
        {
          departmentId: departmentAId,
          componentId: componentAId,
          qty: 5,
          suggestedQty: 6,
          confirmedAt: new Date(),
        },
        {
          departmentId: departmentBId,
          componentId: componentAId,
          qty: 4,
          suggestedQty: 4,
          confirmedAt: new Date(),
        },
        {
          departmentId: departmentAId,
          componentId: componentBId,
          qty: 3,
          suggestedQty: 3,
          confirmedAt: new Date(),
        },
      ],
    });

    const centralRes = await request(app).post("/api/auth/login").send({
      email: "quota-central@test.com",
      password: "test123",
    });

    expect(centralRes.status).toBe(200);
    centralToken = centralRes.body.token;

    const adminRes = await request(app).post("/api/auth/login").send({
      email: "quota-admin@test.com",
      password: "test123",
    });

    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.token;

    const officeRes = await request(app).post("/api/auth/login").send({
      email: "quota-office@test.com",
      password: "test123",
    });

    expect(officeRes.status).toBe(200);
    officeToken = officeRes.body.token;

    const studentRes = await request(app).post("/api/auth/login").send({
      email: "quota-student@test.com",
      password: "test123",
    });

    expect(studentRes.status).toBe(200);
    studentToken = studentRes.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("READ - GET /api/quotas", () => {
    it("should reject unauthenticated requests", async () => {
      const res = await request(app).get("/api/quotas");

      expect(res.status).toBe(401);
    });

    it("should restrict STUDENT list to own department", async () => {
      const res = await request(app)
        .get("/api/quotas?category=Quota%20Test")
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);

      for (const quota of res.body.data) {
        expect(quota.departmentId).toBe(departmentAId);
      }
    });

    it("should block STUDENT from requesting another department", async () => {
      const res = await request(app)
        .get(`/api/quotas?departmentId=${departmentBId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("should allow CENTRAL_STORE_OFFICER to view all departments", async () => {
      const res = await request(app)
        .get("/api/quotas?category=Quota%20Test")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });

    it("should allow OFFICE_ADMIN to view all departments", async () => {
      const res = await request(app)
        .get("/api/quotas?category=Quota%20Test")
        .set("Authorization", `Bearer ${officeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });
  });

  describe("READ ONE - GET /api/quotas/:departmentId/:componentId", () => {
    it("should allow STUDENT to read own department quota", async () => {
      const res = await request(app)
        .get(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.departmentId).toBe(departmentAId);
      expect(res.body.data.componentId).toBe(componentAId);
      expect(res.body.data.qty).toBe(5);
    });

    it("should block STUDENT from another department quota", async () => {
      const res = await request(app)
        .get(`/api/quotas/${departmentBId}/${componentAId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("should return 404 for a missing quota", async () => {
      const res = await request(app)
        .get(`/api/quotas/${departmentBId}/${componentBId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/quotas/:departmentId/:componentId", () => {
    it("should allow CENTRAL_STORE_OFFICER to change confirmed quota", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 7,
          reason: "Peak class requirement increased",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.qty).toBe(7);
      expect(res.body.data.suggestedQty).toBe(6);
      expect(res.body.data.confirmedAt).not.toBeNull();
    });

    it("should require reason when confirmed qty changes", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 8,
        });

      expect(res.status).toBe(400);

      const quota = await prisma.departmentQuota.findUnique({
        where: {
          departmentId_componentId: {
            departmentId: departmentAId,
            componentId: componentAId,
          },
        },
      });

      expect(quota?.qty).toBe(7);
    });

    it("should allow suggestedQty update without creating quota history", async () => {
      const beforeCount = await prisma.quotaHistory.count({
        where: {
          departmentId: departmentAId,
          componentId: componentAId,
        },
      });

      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          suggestedQty: 9,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.qty).toBe(7);
      expect(res.body.data.suggestedQty).toBe(9);

      const afterCount = await prisma.quotaHistory.count({
        where: {
          departmentId: departmentAId,
          componentId: componentAId,
        },
      });

      expect(afterCount).toBe(beforeCount);
    });

    it("should allow the same confirmed qty without reason and not create history", async () => {
      const beforeCount = await prisma.quotaHistory.count({
        where: {
          departmentId: departmentAId,
          componentId: componentAId,
        },
      });

      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 7,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.qty).toBe(7);

      const afterCount = await prisma.quotaHistory.count({
        where: {
          departmentId: departmentAId,
          componentId: componentAId,
        },
      });

      expect(afterCount).toBe(beforeCount);
    });

    it("should allow SYSTEM_ADMIN to change quota and create another history entry", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          qty: 8,
          reason: "Administrative quota confirmation",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.qty).toBe(8);
    });

    it("should deny OFFICE_ADMIN from updating quota", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${officeToken}`)
        .send({
          qty: 10,
          reason: "Should not be allowed",
        });

      expect(res.status).toBe(403);
    });

    it("should deny STUDENT from updating quota", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          qty: 10,
          reason: "Should not be allowed",
        });

      expect(res.status).toBe(403);
    });

    it("should create a suggested-only quota with zero confirmed qty and no history", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentBId}/${componentBId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          suggestedQty: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.qty).toBe(0);
      expect(res.body.data.suggestedQty).toBe(5);
      expect(res.body.data.confirmedAt).toBeNull();

      const historyCount = await prisma.quotaHistory.count({
        where: {
          departmentId: departmentBId,
          componentId: componentBId,
        },
      });

      expect(historyCount).toBe(0);

      await prisma.departmentQuota.delete({
        where: {
          departmentId_componentId: {
            departmentId: departmentBId,
            componentId: componentBId,
          },
        },
      });
    });

    it("should create a new quota when none exists", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentBId}/${componentBId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 2,
          suggestedQty: 3,
          reason: "Initial quota confirmation",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.departmentId).toBe(departmentBId);
      expect(res.body.data.componentId).toBe(componentBId);
      expect(res.body.data.qty).toBe(2);
      expect(res.body.data.suggestedQty).toBe(3);
    });

    it("should allow confirmed quota to exceed current physical on-hand stock", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentBId}/${componentBId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 50,
          reason: "Quota cap may exceed current physical stock",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.qty).toBe(50);
      expect(res.body.data.component.stock.onHand).toBe(15);
    });

    it("should reject negative quota quantity", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${componentAId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: -1,
          reason: "Invalid",
        });

      expect(res.status).toBe(400);
    });

    it("should reject inactive department", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${inactiveDepartmentId}/${componentAId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 1,
          reason: "Inactive department",
        });

      expect(res.status).toBe(404);
    });

    it("should reject inactive component", async () => {
      const res = await request(app)
        .patch(`/api/quotas/${departmentAId}/${inactiveComponentId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          qty: 1,
          reason: "Inactive component",
        });

      expect(res.status).toBe(404);
    });
  });

  describe("HISTORY - GET /api/quotas/:departmentId/:componentId/history", () => {
    it("should return quota history newest first", async () => {
      const res = await request(app)
        .get(`/api/quotas/${departmentAId}/${componentAId}/history`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.data.length).toBe(2);

      expect(res.body.data[0].oldQty).toBe(7);
      expect(res.body.data[0].newQty).toBe(8);
      expect(res.body.data[0].changedBy.email).toBe(
        "quota-admin@test.com",
      );

      expect(res.body.data[1].oldQty).toBe(5);
      expect(res.body.data[1].newQty).toBe(7);
      expect(res.body.data[1].changedBy.email).toBe(
        "quota-central@test.com",
      );
    });

    it("should block STUDENT from another department history", async () => {
      const res = await request(app)
        .get(`/api/quotas/${departmentBId}/${componentBId}/history`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("should allow OFFICE_ADMIN to view history", async () => {
      const res = await request(app)
        .get(`/api/quotas/${departmentAId}/${componentAId}/history`)
        .set("Authorization", `Bearer ${officeToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    });
  });
});
