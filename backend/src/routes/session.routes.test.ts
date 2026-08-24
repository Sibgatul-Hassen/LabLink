import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import sessionRouter from "./session.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", sessionRouter);

const testDepartmentCode = "TEST-SESS-DEPT";
const testCourseCodes = ["TEST-SESS-COURSE-1", "TEST-SESS-COURSE-2"];
const testEmails = [
  "sess-admin@test.com",
  "sess-instructor-a@test.com",
  "sess-instructor-b@test.com",
  "sess-central@test.com",
];

function utcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function cleanupTestData() {
  await prisma.classSession.deleteMany({
    where: {
      routineSlot: { lab: { department: { code: testDepartmentCode } } },
    },
  });
  await prisma.routineSlot.deleteMany({
    where: { lab: { department: { code: testDepartmentCode } } },
  });
  await prisma.experimentItem.deleteMany({
    where: { experiment: { course: { code: { in: testCourseCodes } } } },
  });
  await prisma.experiment.deleteMany({
    where: { course: { code: { in: testCourseCodes } } },
  });
  await prisma.section.deleteMany({
    where: { course: { code: { in: testCourseCodes } } },
  });
  await prisma.course.deleteMany({ where: { code: { in: testCourseCodes } } });
  await prisma.lab.deleteMany({
    where: { department: { code: testDepartmentCode } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({ where: { code: testDepartmentCode } });
}

describe("Class Session API Integration Tests", () => {
  let systemAdminToken: string;
  let instructorAToken: string;
  let instructorBToken: string;
  let centralStoreToken: string;

  let labId: string;
  let sectionAId: string;
  let experimentOneId: string;
  let experimentTwoId: string;

  // A 7-day horizon contains each weekday exactly once, so each slot below
  // yields exactly one session — which keeps the counts deterministic.
  const today = utcDateOnly(new Date());
  const dayOne = today.getUTCDay();
  const dayTwo = (today.getUTCDay() + 3) % 7;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: testDepartmentCode,
        name: "Session Test Department",
        isOffice: false,
      },
    });

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "sess-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Session Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    const instructorA = await prisma.user.create({
      data: {
        email: "sess-instructor-a@test.com",
        passwordHash: hashedPassword,
        fullName: "Session Test Instructor A",
        role: "INSTRUCTOR",
        departmentId: department.id,
      },
    });

    const instructorB = await prisma.user.create({
      data: {
        email: "sess-instructor-b@test.com",
        passwordHash: hashedPassword,
        fullName: "Session Test Instructor B",
        role: "INSTRUCTOR",
        departmentId: department.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "sess-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Session Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: department.id,
      },
    });

    const courseOne = await prisma.course.create({
      data: {
        code: testCourseCodes[0],
        title: "Session Test Course One",
        departmentId: department.id,
      },
    });

    const courseTwo = await prisma.course.create({
      data: {
        code: testCourseCodes[1],
        title: "Session Test Course Two",
        departmentId: department.id,
      },
    });

    const sectionA = await prisma.section.create({
      data: {
        courseId: courseOne.id,
        name: "SESS-A",
        semester: "Spring 2026",
        studentCount: 40,
        instructorId: instructorA.id,
      },
    });
    sectionAId = sectionA.id;

    const sectionB = await prisma.section.create({
      data: {
        courseId: courseTwo.id,
        name: "SESS-B",
        semester: "Spring 2026",
        studentCount: 36,
        instructorId: instructorB.id,
      },
    });

    const lab = await prisma.lab.create({
      data: {
        name: "Session Test Lab",
        roomNo: "TEST-SESS-LAB",
        groupSize: 4,
        departmentId: department.id,
      },
    });
    labId = lab.id;

    const effectiveFrom = addUtcDays(today, -30);
    const effectiveTo = addUtcDays(today, 60);

    await prisma.routineSlot.create({
      data: {
        sectionId: sectionA.id,
        labId: lab.id,
        dayOfWeek: dayOne,
        startTime: "08:30",
        endTime: "11:30",
        effectiveFrom,
        effectiveTo,
      },
    });

    await prisma.routineSlot.create({
      data: {
        sectionId: sectionB.id,
        labId: lab.id,
        dayOfWeek: dayTwo,
        startTime: "14:00",
        endTime: "17:00",
        effectiveFrom,
        effectiveTo,
      },
    });

    const experimentOne = await prisma.experiment.create({
      data: {
        courseId: courseOne.id,
        number: 1,
        title: "Session Test Experiment One",
      },
    });
    experimentOneId = experimentOne.id;

    const experimentTwo = await prisma.experiment.create({
      data: {
        courseId: courseTwo.id,
        number: 1,
        title: "Session Test Experiment Two",
      },
    });
    experimentTwoId = experimentTwo.id;

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "sess-admin@test.com", password: "test123" });
    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const instructorALogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "sess-instructor-a@test.com", password: "test123" });
    expect(instructorALogin.status).toBe(200);
    instructorAToken = instructorALogin.body.token;

    const instructorBLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "sess-instructor-b@test.com", password: "test123" });
    expect(instructorBLogin.status).toBe(200);
    instructorBToken = instructorBLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "sess-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated session list requests", async () => {
      const res = await request(app).get("/api/sessions");
      expect(res.status).toBe(401);
    });
  });

  describe("GENERATE - POST /api/sessions/generate", () => {
    it("should deny generation for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/sessions/generate")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ horizonDays: 7 });

      expect(res.status).toBe(403);
    });

    it("should generate one session per slot across a seven day horizon", async () => {
      const res = await request(app)
        .post("/api/sessions/generate")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ horizonDays: 7 });

      expect(res.status).toBe(200);
      expect(res.body.data.horizonDays).toBe(7);
      expect(res.body.data.created).toBeGreaterThanOrEqual(2);

      const listed = await request(app)
        .get(`/api/sessions?labId=${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(listed.body.total).toBe(2);
    });

    it("should be idempotent when run again over the same horizon", async () => {
      const res = await request(app)
        .post("/api/sessions/generate")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ horizonDays: 7 });

      expect(res.status).toBe(200);
      expect(res.body.data.created).toBe(0);

      const listed = await request(app)
        .get(`/api/sessions?labId=${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(listed.body.total).toBe(2);
    });

    it("should derive startsAt and endsAt from the slot times", async () => {
      const listed = await request(app)
        .get(`/api/sessions?sectionId=${sectionAId}&labId=${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(listed.status).toBe(200);
      expect(listed.body.data).toHaveLength(1);

      const session = listed.body.data[0];
      expect(session.startsAt).toContain("T08:30:00");
      expect(session.endsAt).toContain("T11:30:00");
      expect(session.status).toBe("SCHEDULED");
    });

    it("should reject a non-positive horizon", async () => {
      const res = await request(app)
        .post("/api/sessions/generate")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ horizonDays: 0 });

      expect(res.status).toBe(400);
    });
  });

  describe("READ - GET /api/sessions", () => {
    it("should allow authenticated users to list sessions", async () => {
      const res = await request(app)
        .get("/api/sessions")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should filter sessions by date range", async () => {
      const from = today.toISOString().slice(0, 10);
      const to = addUtcDays(today, 6).toISOString().slice(0, 10);

      const res = await request(app)
        .get(`/api/sessions?labId=${labId}&from=${from}&to=${to}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
    });

    it("should return an empty range before the horizon", async () => {
      const from = addUtcDays(today, -20).toISOString().slice(0, 10);
      const to = addUtcDays(today, -10).toISOString().slice(0, 10);

      const res = await request(app)
        .get(`/api/sessions?labId=${labId}&from=${from}&to=${to}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it("should return 404 for a non-existent session", async () => {
      const res = await request(app)
        .get("/api/sessions/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("ASSIGN EXPERIMENT - PATCH /api/sessions/:id/experiment", () => {
    let sessionAId: string;

    beforeAll(async () => {
      const listed = await request(app)
        .get(`/api/sessions?sectionId=${sectionAId}&labId=${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      sessionAId = listed.body.data[0].id;
    });

    it("should deny assignment for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ experimentId: experimentOneId });

      expect(res.status).toBe(403);
    });

    it("should let the owning instructor assign an experiment", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${instructorAToken}`)
        .send({ experimentId: experimentOneId });

      expect(res.status).toBe(200);
      expect(res.body.data.experiment.id).toBe(experimentOneId);
    });

    it("should forbid an instructor from another section", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${instructorBToken}`)
        .send({ experimentId: experimentOneId });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe(
        "You can only assign experiments to your own sections",
      );
    });

    it("should reject an experiment from a different course", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${instructorAToken}`)
        .send({ experimentId: experimentTwoId });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe(
        "Experiment does not belong to this session's course",
      );
    });

    it("should return 404 for a non-existent experiment", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ experimentId: "nonexistent" });

      expect(res.status).toBe(404);
    });

    it("should let a system admin assign to any section", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ experimentId: experimentOneId });

      expect(res.status).toBe(200);
      expect(res.body.data.experiment.id).toBe(experimentOneId);
    });

    it("should clear the assignment when experimentId is null", async () => {
      const res = await request(app)
        .patch(`/api/sessions/${sessionAId}/experiment`)
        .set("Authorization", `Bearer ${instructorAToken}`)
        .send({ experimentId: null });

      expect(res.status).toBe(200);
      expect(res.body.data.experiment).toBeNull();
    });
  });
});
