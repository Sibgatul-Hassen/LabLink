import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import sectionRouter from "./section.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", sectionRouter);

const testDepartmentCode = "TEST-SECTION-DEPT";
const testCourseCode = "TEST-SECTION-COURSE-001";
const testLabRoom = "TEST-SECTION-LAB";

const testEmails = [
  "section-admin@test.com",
  "section-central@test.com",
  "section-instructor@test.com",
  "section-labasst@test.com",
];

async function cleanupTestData() {
  const department = await prisma.department.findUnique({
    where: { code: testDepartmentCode },
  });

  if (department) {
    const courses = await prisma.course.findMany({
      where: {
        departmentId: department.id,
        code: testCourseCode,
      },
      select: {
        id: true,
      },
    });

    const courseIds = courses.map((course) => course.id);

    if (courseIds.length > 0) {
      const sections = await prisma.section.findMany({
        where: {
          courseId: {
            in: courseIds,
          },
        },
        select: {
          id: true,
        },
      });

      const sectionIds = sections.map((section) => section.id);

      if (sectionIds.length > 0) {
        await prisma.routineSlot.deleteMany({
          where: {
            sectionId: {
              in: sectionIds,
            },
          },
        });

        await prisma.section.deleteMany({
          where: {
            id: {
              in: sectionIds,
            },
          },
        });
      }

      await prisma.course.deleteMany({
        where: {
          id: {
            in: courseIds,
          },
        },
      });
    }

    await prisma.lab.deleteMany({
      where: {
        departmentId: department.id,
        roomNo: testLabRoom,
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
      code: testDepartmentCode,
    },
  });
}

describe("Section CRUD API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;

  let departmentId: string;
  let courseId: string;
  let labId: string;

  let instructorId: string;
  let labAssistantId: string;

  let sectionId: string;
  let lockedSectionId: string;
  let lockedRoutineSlotId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: testDepartmentCode,
        name: "Section Test Department",
        isOffice: false,
      },
    });

    departmentId = department.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "section-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Section Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "section-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Section Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId,
      },
    });

    const instructor = await prisma.user.create({
      data: {
        email: "section-instructor@test.com",
        passwordHash: hashedPassword,
        fullName: "Section Test Instructor",
        role: "INSTRUCTOR",
        departmentId,
      },
    });

    instructorId = instructor.id;

    const labAssistant = await prisma.user.create({
      data: {
        email: "section-labasst@test.com",
        passwordHash: hashedPassword,
        fullName: "Section Test Lab Assistant",
        role: "LAB_ASSISTANT",
        departmentId,
      },
    });

    labAssistantId = labAssistant.id;

    const course = await prisma.course.create({
      data: {
        code: testCourseCode,
        title: "Section Test Course",
        departmentId,
        isActive: true,
      },
    });

    courseId = course.id;

    const lab = await prisma.lab.create({
      data: {
        name: "Section Test Lab",
        roomNo: testLabRoom,
        departmentId,
        labAssistantId,
      },
    });

    labId = lab.id;

    const lockedSection = await prisma.section.create({
      data: {
        courseId,
        name: "LOCKED",
        semester: "Spring 2026",
        studentCount: 20,
      },
    });

    lockedSectionId = lockedSection.id;

    const routineSlot = await prisma.routineSlot.create({
      data: {
        sectionId: lockedSectionId,
        labId,
        dayOfWeek: 1,
        startTime: "08:30",
        endTime: "11:30",
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-12-31T23:59:59.000Z"),
      },
    });

    lockedRoutineSlotId = routineSlot.id;

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({
        email: "section-admin@test.com",
        password: "test123",
      });

    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({
        email: "section-central@test.com",
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
    it("should reject unauthenticated section list requests", async () => {
      const res = await request(app).get("/api/sections");

      expect(res.status).toBe(401);
    });
  });

  describe("ASSIGNEES - GET /api/sections/assignees", () => {
    it("should list active instructors for SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .get("/api/sections/assignees?role=INSTRUCTOR")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      expect(
        res.body.data.some(
          (user: { id: string }) => user.id === instructorId,
        ),
      ).toBe(true);

      expect(
        res.body.data.every(
          (user: { role: string }) => user.role === "INSTRUCTOR",
        ),
      ).toBe(true);
    });

    it("should list active lab assistants for SYSTEM_ADMIN", async () => {
      const res = await request(app)
        .get("/api/sections/assignees?role=LAB_ASSISTANT")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);

      expect(
        res.body.data.some(
          (user: { id: string }) => user.id === labAssistantId,
        ),
      ).toBe(true);

      expect(
        res.body.data.every(
          (user: { role: string }) => user.role === "LAB_ASSISTANT",
        ),
      ).toBe(true);
    });

    it("should reject an invalid assignee role", async () => {
      const res = await request(app)
        .get("/api/sections/assignees?role=STUDENT")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(400);
    });

    it("should deny assignee listing for non-admin users", async () => {
      const res = await request(app)
        .get("/api/sections/assignees?role=INSTRUCTOR")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("CREATE - POST /api/sections", () => {
    it("should create a section with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .post("/api/sections")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId,
          name: "A",
          semester: "Spring 2026",
          studentCount: 40,
          instructorId,
          labAssistantId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("A");
      expect(res.body.data.semester).toBe("Spring 2026");
      expect(res.body.data.studentCount).toBe(40);
      expect(res.body.data.course.code).toBe(testCourseCode);
      expect(res.body.data.instructor.role).toBe("INSTRUCTOR");
      expect(res.body.data.labAssistant.role).toBe("LAB_ASSISTANT");

      sectionId = res.body.data.id;
    });

    it("should return 409 for duplicate course, name, and semester", async () => {
      const res = await request(app)
        .post("/api/sections")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId,
          name: "A",
          semester: "Spring 2026",
          studentCount: 30,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        "Section with this course, name, and semester already exists",
      );
    });

    it("should return 404 for an invalid course", async () => {
      const res = await request(app)
        .post("/api/sections")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId: "nonexistent",
          name: "B",
          semester: "Spring 2026",
          studentCount: 30,
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Course not found");
    });

    it("should reject a non-INSTRUCTOR user as instructor", async () => {
      const res = await request(app)
        .post("/api/sections")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId,
          name: "B",
          semester: "Spring 2026",
          studentCount: 30,
          instructorId: labAssistantId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("User must have INSTRUCTOR role");
    });

    it("should reject a non-LAB_ASSISTANT user as lab assistant", async () => {
      const res = await request(app)
        .post("/api/sections")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId,
          name: "B",
          semester: "Spring 2026",
          studentCount: 30,
          labAssistantId: instructorId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "User must have LAB_ASSISTANT role",
      );
    });

    it("should deny create for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/sections")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          courseId,
          name: "B",
          semester: "Spring 2026",
          studentCount: 30,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("READ - GET /api/sections", () => {
    it("should allow authenticated users to list sections", async () => {
      const res = await request(app)
        .get("/api/sections")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.page).toBe(1);
    });

    it("should search sections by course code or section information", async () => {
      const res = await request(app)
        .get(`/api/sections?search=${testCourseCode}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);

      expect(
        res.body.data.every(
          (section: { course: { code: string } }) =>
            section.course.code === testCourseCode,
        ),
      ).toBe(true);
    });

    it("should filter sections by course and semester", async () => {
      const res = await request(app)
        .get(
          `/api/sections?courseId=${courseId}&semester=Spring%202026`,
        )
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      expect(
        res.body.data.every(
          (section: {
            courseId: string;
            semester: string;
          }) =>
            section.courseId === courseId &&
            section.semester === "Spring 2026",
        ),
      ).toBe(true);
    });

    it("should get a section by ID", async () => {
      const res = await request(app)
        .get(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(sectionId);
      expect(res.body.data.name).toBe("A");
      expect(res.body.data.course.code).toBe(testCourseCode);
      expect(res.body.data.instructor.id).toBe(instructorId);
      expect(res.body.data.labAssistant.id).toBe(labAssistantId);
    });

    it("should return 404 for a non-existent section", async () => {
      const res = await request(app)
        .get("/api/sections/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Section not found");
    });
  });

  describe("UPDATE - PATCH /api/sections/:id", () => {
    it("should update a section with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .patch(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          studentCount: 45,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.studentCount).toBe(45);
      expect(res.body.data.name).toBe("A");
      expect(res.body.data.semester).toBe("Spring 2026");
    });

    it("should reject an invalid instructor role during update", async () => {
      const res = await request(app)
        .patch(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          instructorId: labAssistantId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("User must have INSTRUCTOR role");
    });

    it("should deny update for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          studentCount: 50,
        });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE - DELETE /api/sections/:id", () => {
    it("should deny delete for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .delete(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(403);
    });

    it("should block deletion when routine slots exist", async () => {
      const res = await request(app)
        .delete(`/api/sections/${lockedSectionId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        "Section has routine slots and cannot be deleted",
      );
    });

    it("should hard delete a section with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .delete(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const deletedSection = await prisma.section.findUnique({
        where: {
          id: sectionId,
        },
      });

      expect(deletedSection).toBeNull();
    });

    it("should allow deletion after dependent routine slots are removed", async () => {
      await prisma.routineSlot.delete({
        where: {
          id: lockedRoutineSlotId,
        },
      });

      const res = await request(app)
        .delete(`/api/sections/${lockedSectionId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const deletedSection = await prisma.section.findUnique({
        where: {
          id: lockedSectionId,
        },
      });

      expect(deletedSection).toBeNull();
    });

    it("should return 404 for the deleted section", async () => {
      const res = await request(app)
        .get(`/api/sections/${sectionId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Section not found");
    });
  });
});
