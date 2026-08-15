import request from "supertest";
import express from "express";
import cors from "cors";
import authRouter from "./auth.routes";
import componentRouter from "./component.routes";
import { prisma } from "../lib/prisma";
import bcryptjs from "bcryptjs";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", componentRouter);

describe("Component CRUD API Integration Tests", () => {
  let authToken: string;
  let systemAdminToken: string;
  let componentId: string;

  beforeAll(async () => {
    // Clear existing test data
    await prisma.component.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});

    // Create departments
    const dept = await prisma.department.create({
      data: { code: "TEST", name: "Test Dept", isOffice: false },
    });

    // Create test users
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

    // Get auth tokens
    const centralRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "central@test.com", password: "test123" });
    authToken = centralRes.body.token;

    const adminRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@test.com", password: "test123" });
    systemAdminToken = adminRes.body.token;
  });

  afterAll(async () => {
    await prisma.component.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.department.deleteMany({});
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
          unitCost: 10.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe("TEST-001");
      expect(res.body.data.name).toBe("Test Component");
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
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("should get component by ID", async () => {
      const res = await request(app)
        .get(`/api/components/${componentId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(componentId);
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
          unitCost: 20.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Updated Component");
      expect(res.body.data.unitCost).toBe("20.0");
    });
  });

  describe("DELETE - DELETE /api/components/:id", () => {
    it("should soft delete component (SYSTEM_ADMIN only)", async () => {
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
      // Create a student user
      const dept = await prisma.department.findFirst();
      const hashedPassword = await bcryptjs.hash("test123", 10);
      
      await prisma.user.create({
        data: {
          email: "student@test.com",
          passwordHash: hashedPassword,
          fullName: "Student",
          role: "STUDENT",
          departmentId: dept?.id,
        },
      });

      const studentRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "student@test.com", password: "test123" });

      const res = await request(app)
        .post("/api/components")
        .set("Authorization", `Bearer ${studentRes.body.token}`)
        .send({
          code: "TEST-DENY",
          name: "Should Fail",
          category: "Test",
          sizeClass: "SMALL",
        });

      expect(res.status).toBe(403);
    });
  });
});
