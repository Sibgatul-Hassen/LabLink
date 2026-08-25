import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import departmentRouter from "./department.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", departmentRouter);

const testEmails = ["dept-admin@test.com", "dept-central@test.com"];

const testDepartmentCodes = [
  "TEST-DEPT-AUTH",
  "TEST-DEPT-001",
  "TEST-DEPT-DENY",
];

async function cleanupTestData() {
  await prisma.user.deleteMany({
    where: {
      email: {
        in: testEmails,
      },
    },
  });

  await prisma.department.deleteMany({
    where: {
      code: {
        in: testDepartmentCodes,
      },
    },
  });
}

describe("Department CRUD API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;
  let departmentId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const authDepartment = await prisma.department.create({
      data: {
        code: "TEST-DEPT-AUTH",
        name: "Department Test Auth",
        isOffice: false,
      },
    });

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "dept-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Department Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "dept-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Department Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: authDepartment.id,
      },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "dept-admin@test.com",
      password: "test123",
    });

    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app).post("/api/auth/login").send({
      email: "dept-central@test.com",
      password: "test123",
    });

    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated department list requests", async () => {
      const res = await request(app).get("/api/departments");

      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/departments", () => {
    it("should create a department with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .post("/api/departments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          code: "TEST-DEPT-001",
          name: "Test Department",
          isOffice: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe("TEST-DEPT-001");
      expect(res.body.data.name).toBe("Test Department");
      expect(res.body.data.isOffice).toBe(false);
      expect(res.body.data.isActive).toBe(true);

      departmentId = res.body.data.id;
    });

    it("should return 409 for duplicate department code", async () => {
      const res = await request(app)
        .post("/api/departments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          code: "TEST-DEPT-001",
          name: "Duplicate Test Department",
          isOffice: false,
        });

      expect(res.status).toBe(409);
    });

    it("should deny create for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/departments")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          code: "TEST-DEPT-DENY",
          name: "Should Not Be Created",
          isOffice: false,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("READ - GET /api/departments", () => {
    it("should allow authenticated users to list departments", async () => {
      const res = await request(app)
        .get("/api/departments")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.page).toBe(1);
    });

    it("should search departments by code or name", async () => {
      const res = await request(app)
        .get("/api/departments?search=TEST-DEPT-001")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);

      expect(
        res.body.data.some(
          (department: { code: string }) => department.code === "TEST-DEPT-001",
        ),
      ).toBe(true);
    });

    it("should get a department by ID", async () => {
      const res = await request(app)
        .get(`/api/departments/${departmentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(departmentId);
      expect(res.body.data.code).toBe("TEST-DEPT-001");
    });

    it("should return 404 for a non-existent department", async () => {
      const res = await request(app)
        .get("/api/departments/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/departments/:id", () => {
    it("should update a department with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .patch(`/api/departments/${departmentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          name: "Updated Test Department",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Updated Test Department");
      expect(res.body.data.code).toBe("TEST-DEPT-001");
    });

    it("should deny update for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/departments/${departmentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          name: "Should Not Change",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE - DELETE /api/departments/:id", () => {
    it("should deny delete for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .delete(`/api/departments/${departmentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(403);
    });

    it("should soft delete a department with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .delete(`/api/departments/${departmentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const deletedDepartment = await prisma.department.findUnique({
        where: {
          id: departmentId,
        },
      });

      expect(deletedDepartment).not.toBeNull();
      expect(deletedDepartment?.isActive).toBe(false);
    });

    it("should return 404 for the soft-deleted department", async () => {
      const res = await request(app)
        .get(`/api/departments/${departmentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
