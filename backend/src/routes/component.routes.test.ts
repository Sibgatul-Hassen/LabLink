import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import componentRouter from "./component.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", componentRouter);

const testEmails = ["central@test.com", "admin@test.com", "student@test.com"];

const testComponentCodes = ["TEST-001", "TEST-DENY"];

async function cleanupTestData() {
  await prisma.stock.deleteMany({
    where: {
      component: {
        code: {
          in: testComponentCodes,
        },
      },
    },
  });

  await prisma.component.deleteMany({
    where: {
      code: {
        in: testComponentCodes,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        in: testEmails,
      },
    },
  });

  await prisma.department.deleteMany({
    where: {
      code: "TEST",
    },
  });
}

describe("Component CRUD API Integration Tests", () => {
  let authToken: string;
  let systemAdminToken: string;
  let componentId: string;

  beforeAll(async () => {
    // Remove only data created by this test suite.
    // Never clear the real development/seed data.
    await cleanupTestData();

    const dept = await prisma.department.create({
      data: {
        code: "TEST",
        name: "Test Dept",
        isOffice: false,
      },
    });

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "central@test.com",
        passwordHash: hashedPassword,
        fullName: "Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: dept.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "admin@test.com",
        passwordHash: hashedPassword,
        fullName: "System Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    const centralRes = await request(app).post("/api/auth/login").send({
      email: "central@test.com",
      password: "test123",
    });

    expect(centralRes.status).toBe(200);
    authToken = centralRes.body.token;

    const adminRes = await request(app).post("/api/auth/login").send({
      email: "admin@test.com",
      password: "test123",
    });

    expect(adminRes.status).toBe(200);
    systemAdminToken = adminRes.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("CREATE - POST /api/components", () => {
    it("should create component with CENTRAL_STORE_OFFICER role", async () => {
      const res = await request(app)
        .post("/api/components")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          code: "TEST-001",
          name: "Test Component",
          category: "Test",
          sizeClass: "SMALL",
          unitCost: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe("TEST-001");
      expect(res.body.data.name).toBe("Test Component");
      expect(res.body.data.stock).toBeTruthy();
      expect(res.body.data.stock.onHand).toBe(0);
      expect(res.body.data.stock.spareQty).toBe(0);
      expect(res.body.data.stock.reorderPoint).toBe(0);

      componentId = res.body.data.id;
    });

    it("should return 409 for duplicate component code", async () => {
      const res = await request(app)
        .post("/api/components")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          code: "TEST-001",
          name: "Another Component",
          category: "Test",
          sizeClass: "SMALL",
          unitCost: 10,
        });

      expect(res.status).toBe(409);
    });
  });

  describe("READ - GET /api/components", () => {
    it("should list components", async () => {
      const res = await request(app)
        .get("/api/components")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.page).toBe(1);
    });

    it("should search components", async () => {
      const res = await request(app)
        .get("/api/components?search=TEST")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].code).toContain("TEST");
    });

    it("should get component by ID", async () => {
      const res = await request(app)
        .get(`/api/components/${componentId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(componentId);
      expect(res.body.data.code).toBe("TEST-001");
    });

    it("should return 404 for non-existent component", async () => {
      const res = await request(app)
        .get("/api/components/nonexistent")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/components/:id", () => {
    it("should update component", async () => {
      const res = await request(app)
        .patch(`/api/components/${componentId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Updated Component",
          unitCost: 20,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Updated Component");
      expect(Number(res.body.data.unitCost)).toBe(20);
    });
  });

  describe("DELETE - DELETE /api/components/:id", () => {
    it("should soft delete component with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .delete(`/api/components/${componentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);
    });

    it("should return 404 for deleted component", async () => {
      const res = await request(app)
        .get(`/api/components/${componentId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("Authorization Tests", () => {
    it("should deny create without CENTRAL_STORE_OFFICER or SYSTEM_ADMIN", async () => {
      const dept = await prisma.department.findUnique({
        where: {
          code: "TEST",
        },
      });

      if (!dept) {
        throw new Error("TEST department not found");
      }

      const hashedPassword = await bcryptjs.hash("test123", 10);

      await prisma.user.create({
        data: {
          email: "student@test.com",
          passwordHash: hashedPassword,
          fullName: "Student",
          role: "STUDENT",
          departmentId: dept.id,
        },
      });

      const studentRes = await request(app).post("/api/auth/login").send({
        email: "student@test.com",
        password: "test123",
      });

      expect(studentRes.status).toBe(200);

      const res = await request(app)
        .post("/api/components")
        .set("Authorization", `Bearer ${studentRes.body.token}`)
        .send({
          code: "TEST-DENY",
          name: "Should Fail",
          category: "Test",
          sizeClass: "SMALL",
          unitCost: 10,
        });

      expect(res.status).toBe(403);
    });
  });
});
