import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import analyticsRouter from "./analytics.routes";
import authRouter from "./auth.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", analyticsRouter);

const testDepartmentCodes = ["TEST-PEAK-DEPT-A", "TEST-PEAK-DEPT-B"];
const testCourseCodes = ["TEST-PEAK-COURSE-A", "TEST-PEAK-COURSE-B"];
const testEmails = [
  "peak-admin@test.com",
  "peak-central@test.com",
  "peak-head-a@test.com",
  "peak-labasst@test.com",
];

// Far outside the seeded window so these sessions cannot be confused with
// anything the seed generated.
const TEST_DATE = "2027-03-02";

function at(time: string): Date {
  return new Date(`${TEST_DATE}T${time}:00.000Z`);
}

async function cleanupTestData() {
  await prisma.classSession.deleteMany({
    where: {
      routineSlot: {
        lab: { department: { code: { in: testDepartmentCodes } } },
      },
    },
  });
  await prisma.routineSlot.deleteMany({
    where: { lab: { department: { code: { in: testDepartmentCodes } } } },
  });
  await prisma.section.deleteMany({
    where: { course: { code: { in: testCourseCodes } } },
  });
  await prisma.course.deleteMany({ where: { code: { in: testCourseCodes } } });
  await prisma.lab.deleteMany({
    where: { department: { code: { in: testDepartmentCodes } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Peak Classes Analytics API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;
  let deptHeadAToken: string;
  let labAssistantToken: string;

  let departmentAId: string;
  let departmentBId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const departmentA = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Peak Test Department A" },
    });
    departmentAId = departmentA.id;

    const departmentB = await prisma.department.create({
      data: { code: testDepartmentCodes[1], name: "Peak Test Department B" },
    });
    departmentBId = departmentB.id;

    const labA = await prisma.lab.create({
      data: {
        name: "Peak Test Lab A",
        roomNo: "TEST-PEAK-A",
        groupSize: 4,
        departmentId: departmentA.id,
      },
    });

    const labB = await prisma.lab.create({
      data: {
        name: "Peak Test Lab B",
        roomNo: "TEST-PEAK-B",
        groupSize: 4,
        departmentId: departmentB.id,
      },
    });

    const courseA = await prisma.course.create({
      data: {
        code: testCourseCodes[0],
        title: "Peak Test Course A",
        departmentId: departmentA.id,
      },
    });

    const courseB = await prisma.course.create({
      data: {
        code: testCourseCodes[1],
        title: "Peak Test Course B",
        departmentId: departmentB.id,
      },
    });

    const effectiveFrom = new Date("2027-01-01");
    const effectiveTo = new Date("2027-12-31");

    async function makeSession(
      courseId: string,
      labId: string,
      sectionName: string,
      studentCount: number,
      startTime: string,
      endTime: string,
      status: "SCHEDULED" | "CANCELLED" = "SCHEDULED",
    ) {
      const section = await prisma.section.create({
        data: {
          courseId,
          name: sectionName,
          semester: "Spring 2027",
          studentCount,
        },
      });

      const slot = await prisma.routineSlot.create({
        data: {
          sectionId: section.id,
          labId,
          dayOfWeek: 2,
          startTime,
          endTime,
          effectiveFrom,
          effectiveTo,
        },
      });

      await prisma.classSession.create({
        data: {
          routineSlotId: slot.id,
          date: new Date(TEST_DATE),
          startsAt: at(startTime),
          endsAt: at(endTime),
          status,
        },
      });
    }

    // Department A — three overlapping classes at 10:00.
    //   08:00-11:00  40 students -> 10 groups
    //   09:00-12:00  20 students ->  5 groups
    //   10:00-10:30  12 students ->  3 groups
    // Peak concurrency 3, peak groups 18.
    await makeSession(courseA.id, labA.id, "PEAK-A1", 40, "08:00", "11:00");
    await makeSession(courseA.id, labA.id, "PEAK-A2", 20, "09:00", "12:00");
    await makeSession(courseA.id, labA.id, "PEAK-A3", 12, "10:00", "10:30");

    // Department B — strictly back-to-back, plus a cancelled overlap.
    // Peak must be 1: the 11:00 finish precedes the 11:00 start, and the
    // cancelled class consumes nothing.
    await makeSession(courseB.id, labB.id, "PEAK-B1", 40, "08:00", "11:00");
    await makeSession(courseB.id, labB.id, "PEAK-B2", 40, "11:00", "14:00");
    await makeSession(
      courseB.id,
      labB.id,
      "PEAK-B3",
      40,
      "09:00",
      "10:00",
      "CANCELLED",
    );

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "peak-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Peak Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "peak-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Peak Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: departmentA.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "peak-head-a@test.com",
        passwordHash: hashedPassword,
        fullName: "Peak Test Store Head A",
        role: "DEPT_STORE_HEAD",
        departmentId: departmentA.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "peak-labasst@test.com",
        passwordHash: hashedPassword,
        fullName: "Peak Test Lab Assistant",
        role: "LAB_ASSISTANT",
        departmentId: departmentA.id,
      },
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "peak-admin@test.com", password: "test123" });
    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "peak-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;

    const headLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "peak-head-a@test.com", password: "test123" });
    expect(headLogin.status).toBe(200);
    deptHeadAToken = headLogin.body.token;

    const labAsstLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "peak-labasst@test.com", password: "test123" });
    expect(labAsstLogin.status).toBe(200);
    labAssistantToken = labAsstLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Access control", () => {
    it("should reject unauthenticated requests", async () => {
      const res = await request(app).get("/api/analytics/peak-classes");
      expect(res.status).toBe(401);
    });

    it("should deny access to LAB_ASSISTANT", async () => {
      const res = await request(app)
        .get("/api/analytics/peak-classes")
        .set("Authorization", `Bearer ${labAssistantToken}`);

      expect(res.status).toBe(403);
    });

    it("should allow CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .get("/api/analytics/peak-classes")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe("Peak calculation", () => {
    it("should report three simultaneous classes and their combined groups", async () => {
      const res = await request(app)
        .get(`/api/analytics/peak-classes?departmentId=${departmentAId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);

      const result = res.body.data[0];
      expect(result.department.id).toBe(departmentAId);
      expect(result.totalSessions).toBe(3);
      expect(result.peak).toBe(3);
      expect(result.peakGroups).toBe(18);
      expect(result.peakAt).toContain("T10:00:00");
      expect(result.peakSessions).toHaveLength(3);
    });

    it("should derive group counts from student count and lab group size", async () => {
      const res = await request(app)
        .get(`/api/analytics/peak-classes?departmentId=${departmentAId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      const groups = res.body.data[0].peakSessions
        .map((session: { groups: number }) => session.groups)
        .sort((a: number, b: number) => a - b);

      expect(groups).toEqual([3, 5, 10]);
    });

    it("should not count back-to-back classes as simultaneous", async () => {
      const res = await request(app)
        .get(`/api/analytics/peak-classes?departmentId=${departmentBId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);

      const result = res.body.data[0];
      expect(result.peak).toBe(1);
      expect(result.peakGroups).toBe(10);
    });

    it("should exclude cancelled sessions", async () => {
      const res = await request(app)
        .get(`/api/analytics/peak-classes?departmentId=${departmentBId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      // The cancelled 09:00-10:00 class overlaps the 08:00-11:00 one; counting
      // it would report a peak of 2.
      expect(res.body.data[0].totalSessions).toBe(2);
      expect(res.body.data[0].peak).toBe(1);
    });

    it("should report every department when none is specified", async () => {
      const res = await request(app)
        .get("/api/analytics/peak-classes")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);

      const codes = res.body.data.map(
        (entry: { department: { code: string } }) => entry.department.code,
      );

      expect(codes).toContain(testDepartmentCodes[0]);
      expect(codes).toContain(testDepartmentCodes[1]);
    });

    it("should respect a date range that excludes the test sessions", async () => {
      const res = await request(app)
        .get(
          `/api/analytics/peak-classes?departmentId=${departmentAId}&from=2027-04-01&to=2027-04-30`,
        )
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("Department scoping", () => {
    it("should restrict a department store head to their own department", async () => {
      const res = await request(app)
        .get(`/api/analytics/peak-classes?departmentId=${departmentBId}`)
        .set("Authorization", `Bearer ${deptHeadAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);

      // Asked for department B, still gets department A.
      expect(res.body.data[0].department.id).toBe(departmentAId);
    });
  });
});
