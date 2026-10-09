import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import routineSlotRouter from "./routine-slot.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", routineSlotRouter);

const testDepartmentCode = "TEST-RS-DEPT";
const testCourseCode = "TEST-RS-COURSE";
const testEmails = ["rs-admin@test.com", "rs-central@test.com"];

const EFFECTIVE_FROM = "2026-01-15";
const EFFECTIVE_TO = "2026-05-30";

async function cleanupTestData() {
  await prisma.classSession.deleteMany({
    where: {
      routineSlot: { lab: { department: { code: testDepartmentCode } } },
    },
  });
  await prisma.routineSlot.deleteMany({
    where: { lab: { department: { code: testDepartmentCode } } },
  });
  await prisma.section.deleteMany({
    where: { course: { code: testCourseCode } },
  });
  await prisma.course.deleteMany({ where: { code: testCourseCode } });
  await prisma.lab.deleteMany({
    where: { department: { code: testDepartmentCode } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({ where: { code: testDepartmentCode } });
}

describe("RoutineSlot CRUD API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;
  let sectionAId: string;
  let sectionBId: string;
  let labOneId: string;
  let labTwoId: string;
  let routineSlotId: string;
  let lockedRoutineSlotId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: testDepartmentCode,
        name: "Routine Slot Test Department",
        isOffice: false,
      },
    });

    const course = await prisma.course.create({
      data: {
        code: testCourseCode,
        title: "Routine Slot Test Course",
        departmentId: department.id,
      },
    });

    const sectionA = await prisma.section.create({
      data: {
        courseId: course.id,
        name: "RS-A",
        semester: "Spring 2026",
        studentCount: 40,
      },
    });
    sectionAId = sectionA.id;

    const sectionB = await prisma.section.create({
      data: {
        courseId: course.id,
        name: "RS-B",
        semester: "Spring 2026",
        studentCount: 38,
      },
    });
    sectionBId = sectionB.id;

    const labOne = await prisma.lab.create({
      data: {
        name: "Routine Slot Test Lab One",
        roomNo: "TEST-RS-901",
        groupSize: 4,
        departmentId: department.id,
      },
    });
    labOneId = labOne.id;

    const labTwo = await prisma.lab.create({
      data: {
        name: "Routine Slot Test Lab Two",
        roomNo: "TEST-RS-902",
        groupSize: 4,
        departmentId: department.id,
      },
    });
    labTwoId = labTwo.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "rs-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Routine Slot Test Admin",
        role: "DEPT_STORE_HEAD",
        departmentId: department.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "rs-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Routine Slot Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: department.id,
      },
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "rs-admin@test.com", password: "test123" });
    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "rs-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated routine slot list requests", async () => {
      const res = await request(app).get("/api/routine-slots");
      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/routine-slots", () => {
    it("should create a routine slot with DEPT_STORE_HEAD role", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionAId,
          labId: labOneId,
          dayOfWeek: 2,
          startTime: "08:30",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.dayOfWeek).toBe(2);
      expect(res.body.data.startTime).toBe("08:30");
      expect(res.body.data.section.id).toBe(sectionAId);
      expect(res.body.data.lab.id).toBe(labOneId);
      routineSlotId = res.body.data.id;
    });

    it("should deny create for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          sectionId: sectionBId,
          labId: labTwoId,
          dayOfWeek: 3,
          startTime: "08:30",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(403);
    });

    it("should return 409 when the lab is already booked at an overlapping time", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionBId,
          labId: labOneId,
          dayOfWeek: 2,
          startTime: "10:00",
          endTime: "12:00",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("lab is already booked");
    });

    it("should return 409 when the section already has a class at an overlapping time", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionAId,
          labId: labTwoId,
          dayOfWeek: 2,
          startTime: "10:00",
          endTime: "12:00",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("section already has a class");
    });

    it("should allow a back-to-back slot in the same lab", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionBId,
          labId: labOneId,
          dayOfWeek: 2,
          startTime: "11:30",
          endTime: "14:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(201);
      lockedRoutineSlotId = res.body.data.id;
    });

    it("should allow the same lab and time when the effective ranges do not overlap", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionBId,
          labId: labOneId,
          dayOfWeek: 2,
          startTime: "08:30",
          endTime: "11:30",
          effectiveFrom: "2027-01-15",
          effectiveTo: "2027-05-30",
        });

      expect(res.status).toBe(201);
    });

    it("should reject an invalid time format", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionAId,
          labId: labTwoId,
          dayOfWeek: 4,
          startTime: "8:30",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(400);
    });

    it("should reject a start time that is not before the end time", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionAId,
          labId: labTwoId,
          dayOfWeek: 4,
          startTime: "14:00",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(400);
    });

    it("should reject an out-of-range day of week", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionAId,
          labId: labTwoId,
          dayOfWeek: 7,
          startTime: "08:30",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 for a non-existent section", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: "nonexistent",
          labId: labTwoId,
          dayOfWeek: 5,
          startTime: "08:30",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(404);
    });

    it("should return 404 for a non-existent lab", async () => {
      const res = await request(app)
        .post("/api/routine-slots")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          sectionId: sectionAId,
          labId: "nonexistent",
          dayOfWeek: 5,
          startTime: "08:30",
          endTime: "11:30",
          effectiveFrom: EFFECTIVE_FROM,
          effectiveTo: EFFECTIVE_TO,
        });

      expect(res.status).toBe(404);
    });
  });

  describe("READ - GET /api/routine-slots", () => {
    it("should allow authenticated users to list routine slots", async () => {
      const res = await request(app)
        .get("/api/routine-slots")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it("should filter routine slots by lab", async () => {
      const res = await request(app)
        .get(`/api/routine-slots?labId=${labOneId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (slot: { lab: { id: string } }) => slot.lab.id === labOneId,
        ),
      ).toBe(true);
    });

    it("should filter routine slots by day of week", async () => {
      const res = await request(app)
        .get("/api/routine-slots?dayOfWeek=2")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (slot: { dayOfWeek: number }) => slot.dayOfWeek === 2,
        ),
      ).toBe(true);
    });

    it("should get a routine slot by ID", async () => {
      const res = await request(app)
        .get(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(routineSlotId);
    });

    it("should return 404 for a non-existent routine slot", async () => {
      const res = await request(app)
        .get("/api/routine-slots/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/routine-slots/:id", () => {
    it("should update a routine slot with DEPT_STORE_HEAD role", async () => {
      const res = await request(app)
        .patch(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ startTime: "09:00" });

      expect(res.status).toBe(200);
      expect(res.body.data.startTime).toBe("09:00");
      expect(res.body.data.endTime).toBe("11:30");
    });

    it("should reject a partial update that pushes the start past the end", async () => {
      const res = await request(app)
        .patch(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ startTime: "23:00" });

      expect(res.status).toBe(400);
    });

    it("should return 409 when an update collides with another slot in the same lab", async () => {
      const res = await request(app)
        .patch(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ endTime: "13:00" });

      expect(res.status).toBe(409);
    });

    it("should deny update for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ startTime: "10:00" });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE - DELETE /api/routine-slots/:id", () => {
    it("should deny delete for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .delete(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(403);
    });

    it("should block deletion when class sessions exist", async () => {
      await prisma.classSession.create({
        data: {
          routineSlotId: lockedRoutineSlotId,
          date: new Date("2026-02-03"),
          startsAt: new Date("2026-02-03T11:30:00.000Z"),
          endsAt: new Date("2026-02-03T14:30:00.000Z"),
        },
      });

      const res = await request(app)
        .delete(`/api/routine-slots/${lockedRoutineSlotId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        "Routine slot has class sessions and cannot be deleted",
      );
    });

    it("should delete a routine slot with DEPT_STORE_HEAD role", async () => {
      const res = await request(app)
        .delete(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const deleted = await prisma.routineSlot.findUnique({
        where: { id: routineSlotId },
      });
      expect(deleted).toBeNull();
    });

    it("should return 404 for the deleted routine slot", async () => {
      const res = await request(app)
        .get(`/api/routine-slots/${routineSlotId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
