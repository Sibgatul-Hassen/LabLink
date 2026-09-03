import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import userRouter from "./user.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", userRouter);

const testEmails = [
  "user-admin@test.com",
  "user-student@test.com",
  "user-target@test.com",
  "user-new@test.com",
  "user-dup@test.com",
  "user-scoped-fail@test.com",
];

const testDepartmentCode = "TEST-USR";

async function cleanupTestData() {
  await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  });

  await prisma.department.deleteMany({
    where: { code: testDepartmentCode },
  });
}

describe("User Management CRUD API Integration Tests", () => {
  let adminToken: string;
  let adminId: string;
  let studentToken: string;
  let departmentId: string;
  let targetUserId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const dept = await prisma.department.create({
      data: {
        code: testDepartmentCode,
        name: "User Test Dept",
        isOffice: false,
      },
    });
    departmentId = dept.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    const admin = await prisma.user.create({
      data: {
        email: "user-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "User Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });
    adminId = admin.id;

    await prisma.user.create({
      data: {
        email: "user-student@test.com",
        passwordHash: hashedPassword,
        fullName: "User Test Student",
        role: "STUDENT",
        departmentId: dept.id,
      },
    });

    const target = await prisma.user.create({
      data: {
        email: "user-target@test.com",
        passwordHash: hashedPassword,
        fullName: "User Test Target",
        role: "STUDENT",
        departmentId: dept.id,
      },
    });
    targetUserId = target.id;

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "user-admin@test.com",
      password: "test123",
    });

    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const studentLogin = await request(app).post("/api/auth/login").send({
      email: "user-student@test.com",
      password: "test123",
    });

    expect(studentLogin.status).toBe(200);
    studentToken = studentLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication & Authorization", () => {
    it("should reject unauthenticated list requests", async () => {
      const res = await request(app).get("/api/users");
      expect(res.status).toBe(401);
    });

    it("should deny list access for non-SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("CREATE - POST /api/users", () => {
    it("should create a user with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "user-new@test.com",
          password: "test123",
          fullName: "New User",
          role: "CENTRAL_STORE_OFFICER",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe("user-new@test.com");
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it("should never return passwordHash", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      for (const user of res.body.data) {
        expect(user.passwordHash).toBeUndefined();
      }
    });

    it("should return 409 for duplicate email", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "user-new@test.com",
          password: "test123",
          fullName: "Duplicate User",
          role: "CENTRAL_STORE_OFFICER",
        });

      expect(res.status).toBe(409);
    });

    it("should return 400 when a scoped role has no departmentId", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "user-scoped-fail@test.com",
          password: "test123",
          fullName: "Scoped Fail User",
          role: "INSTRUCTOR",
        });

      expect(res.status).toBe(400);
    });

    it("should deny create for non-SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          email: "user-dup@test.com",
          password: "test123",
          fullName: "Should Fail",
          role: "STUDENT",
          departmentId,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("READ - GET /api/users", () => {
    it("should list users", async () => {
      const res = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it("should get a user by ID", async () => {
      const res = await request(app)
        .get(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(targetUserId);
    });

    it("should return 404 for a non-existent user", async () => {
      const res = await request(app)
        .get("/api/users/nonexistent")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/users/:id", () => {
    it("should update a user's fullName", async () => {
      const res = await request(app)
        .patch(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ fullName: "Updated Target User" });

      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe("Updated Target User");
    });

    it("should return 409 for duplicate email on update", async () => {
      const res = await request(app)
        .patch(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: "user-new@test.com" });

      expect(res.status).toBe(409);
    });

    it("should return 400 when moving a user to a scoped role without a department", async () => {
      const res = await request(app)
        .patch(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "LAB_ASSISTANT", departmentId: null });

      expect(res.status).toBe(400);
    });

    it("should prevent an admin from deactivating themselves", async () => {
      const res = await request(app)
        .patch(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(409);
    });

    it("should prevent an admin from changing their own role away from SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .patch(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "OFFICE_ADMIN" });

      expect(res.status).toBe(409);
    });

    it("should deny update for non-SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .patch(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ fullName: "Should Not Change" });

      expect(res.status).toBe(403);
    });
  });

  describe("PASSWORD - PATCH /api/users/:id/password", () => {
    it("should reset a user's password", async () => {
      const res = await request(app)
        .patch(`/api/users/${targetUserId}/password`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ password: "newpassword123" });

      expect(res.status).toBe(204);

      const loginRes = await request(app).post("/api/auth/login").send({
        email: "user-target@test.com",
        password: "newpassword123",
      });

      expect(loginRes.status).toBe(200);
    });
  });

  describe("DELETE - DELETE /api/users/:id", () => {
    it("should prevent an admin from deactivating themselves", async () => {
      const res = await request(app)
        .delete(`/api/users/${adminId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
    });

    it("should deny delete for non-SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .delete(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("should soft delete (deactivate) a user with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .delete(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(204);

      const deleted = await prisma.user.findUnique({
        where: { id: targetUserId },
      });

      expect(deleted).not.toBeNull();
      expect(deleted?.isActive).toBe(false);
    });

    it("should be able to reactivate a deactivated user via PATCH", async () => {
      const res = await request(app)
        .patch(`/api/users/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });
  });
});
