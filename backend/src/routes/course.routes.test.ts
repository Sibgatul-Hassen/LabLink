import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import courseRouter from "./course.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", courseRouter);

const testEmails = ["course-admin@test.com", "course-central@test.com"];

const testCourseCodes = ["TEST-COURSE-001", "TEST-COURSE-DENY"];

const testDepartmentCode = "TEST-COURSE-DEPT";

async function cleanupTestData() {
  await prisma.course.deleteMany({
    where: {
      code: {
        in: testCourseCodes,
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
      code: testDepartmentCode,
    },
  });
}

describe("Course CRUD API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;
  let departmentId: string;
  let courseId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: testDepartmentCode,
        name: "Course Test Department",
        isOffice: false,
      },
    });

    departmentId = department.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "course-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Course Test Admin",
        role: "DEPT_STORE_HEAD",
        departmentId: department.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "course-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Course Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId,
      },
    });

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "course-admin@test.com",
      password: "test123",
    });

    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app).post("/api/auth/login").send({
      email: "course-central@test.com",
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
    it("should reject unauthenticated course list requests", async () => {
      const res = await request(app).get("/api/courses");

      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/courses", () => {
    it("should create a course with DEPT_STORE_HEAD role", async () => {
      const res = await request(app)
        .post("/api/courses")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          code: "TEST-COURSE-001",
          title: "Test Course",
          departmentId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe("TEST-COURSE-001");
      expect(res.body.data.title).toBe("Test Course");
      expect(res.body.data.departmentId).toBe(departmentId);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.department.code).toBe(testDepartmentCode);

      courseId = res.body.data.id;
    });

    it("should return 409 for duplicate course code", async () => {
      const res = await request(app)
        .post("/api/courses")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          code: "TEST-COURSE-001",
          title: "Duplicate Course",
          departmentId,
        });

      expect(res.status).toBe(409);
    });

    it("should return 404 for an invalid department", async () => {
      const res = await request(app)
        .post("/api/courses")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          code: "TEST-COURSE-DENY",
          title: "Invalid Department Course",
          departmentId: "nonexistent",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Department not found");
    });

    it("should deny create for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/courses")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          code: "TEST-COURSE-DENY",
          title: "Should Not Be Created",
          departmentId,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("READ - GET /api/courses", () => {
    it("should allow authenticated users to list courses", async () => {
      const res = await request(app)
        .get("/api/courses")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.page).toBe(1);
    });

    it("should search courses by code or title", async () => {
      const res = await request(app)
        .get("/api/courses?search=TEST-COURSE-001")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);

      expect(
        res.body.data.some(
          (course: { code: string }) => course.code === "TEST-COURSE-001",
        ),
      ).toBe(true);
    });

    it("should filter courses by department", async () => {
      const res = await request(app)
        .get(`/api/courses?departmentId=${departmentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      expect(
        res.body.data.every(
          (course: { departmentId: string }) =>
            course.departmentId === departmentId,
        ),
      ).toBe(true);
    });

    it("should get a course by ID", async () => {
      const res = await request(app)
        .get(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(courseId);
      expect(res.body.data.code).toBe("TEST-COURSE-001");
      expect(res.body.data.department.code).toBe(testDepartmentCode);
    });

    it("should return 404 for a non-existent course", async () => {
      const res = await request(app)
        .get("/api/courses/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/courses/:id", () => {
    it("should update a course with DEPT_STORE_HEAD role", async () => {
      const res = await request(app)
        .patch(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          title: "Updated Test Course",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Updated Test Course");
      expect(res.body.data.code).toBe("TEST-COURSE-001");
    });

    it("should return 404 when updating to an invalid department", async () => {
      const res = await request(app)
        .patch(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          departmentId: "nonexistent",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Department not found");
    });

    it("should deny update for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          title: "Should Not Change",
        });

      expect(res.status).toBe(403);
    });

    it("forbids a department head from reading or editing another department's course", async () => {
      const otherDepartment = await prisma.department.create({
        data: { code: "TEST-COURSE-FOREIGN", name: "Foreign Course Department" },
      });
      const otherCourse = await prisma.course.create({
        data: { code: "TEST-COURSE-FOREIGN", title: "Foreign Course", departmentId: otherDepartment.id },
      });
      try {
        const read = await request(app).get(`/api/courses/${otherCourse.id}`)
          .set("Authorization", `Bearer ${systemAdminToken}`);
        const edit = await request(app).patch(`/api/courses/${otherCourse.id}`)
          .set("Authorization", `Bearer ${systemAdminToken}`)
          .send({ title: "Cross department change" });
        expect(read.status).toBe(403);
        expect(edit.status).toBe(403);
      } finally {
        await prisma.course.delete({ where: { id: otherCourse.id } });
        await prisma.department.delete({ where: { id: otherDepartment.id } });
      }
    });
  });

  describe("DELETE - DELETE /api/courses/:id", () => {
    it("should deny delete for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .delete(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(403);
    });

    it("should soft delete a course with DEPT_STORE_HEAD role", async () => {
      const res = await request(app)
        .delete(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const deletedCourse = await prisma.course.findUnique({
        where: {
          id: courseId,
        },
      });

      expect(deletedCourse).not.toBeNull();
      expect(deletedCourse?.isActive).toBe(false);
    });

    it("should return 404 for the soft-deleted course", async () => {
      const res = await request(app)
        .get(`/api/courses/${courseId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
