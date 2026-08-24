import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import experimentRouter from "./experiment.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", experimentRouter);

const testDepartmentCode = "TEST-EXP-DEPT";
const testCourseCodes = ["TEST-EXP-COURSE-1", "TEST-EXP-COURSE-2"];
const testComponentCodes = ["TEST-EXP-COMP-1", "TEST-EXP-COMP-2"];
const testEmails = ["exp-admin@test.com", "exp-central@test.com"];

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
  await prisma.component.deleteMany({
    where: { code: { in: testComponentCodes } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({ where: { code: testDepartmentCode } });
}

describe("Experiment CRUD API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;
  let courseOneId: string;
  let courseTwoId: string;
  let componentOneId: string;
  let componentTwoId: string;
  let routineSlotId: string;
  let experimentId: string;
  let secondExperimentId: string;
  let lockedExperimentId: string;
  let itemId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: testDepartmentCode,
        name: "Experiment Test Department",
        isOffice: false,
      },
    });

    const courseOne = await prisma.course.create({
      data: {
        code: testCourseCodes[0],
        title: "Experiment Test Course One",
        departmentId: department.id,
      },
    });
    courseOneId = courseOne.id;

    const courseTwo = await prisma.course.create({
      data: {
        code: testCourseCodes[1],
        title: "Experiment Test Course Two",
        departmentId: department.id,
      },
    });
    courseTwoId = courseTwo.id;

    const componentOne = await prisma.component.create({
      data: {
        code: testComponentCodes[0],
        name: "Experiment Test Component One",
        category: "Test",
        sizeClass: "SMALL",
      },
    });
    componentOneId = componentOne.id;

    const componentTwo = await prisma.component.create({
      data: {
        code: testComponentCodes[1],
        name: "Experiment Test Component Two",
        category: "Test",
        sizeClass: "EXPENSIVE",
      },
    });
    componentTwoId = componentTwo.id;

    const section = await prisma.section.create({
      data: {
        courseId: courseOne.id,
        name: "EXP-A",
        semester: "Spring 2026",
        studentCount: 40,
      },
    });

    const lab = await prisma.lab.create({
      data: {
        name: "Experiment Test Lab",
        roomNo: "TEST-EXP-LAB",
        groupSize: 4,
        departmentId: department.id,
      },
    });

    const routineSlot = await prisma.routineSlot.create({
      data: {
        sectionId: section.id,
        labId: lab.id,
        dayOfWeek: 3,
        startTime: "08:30",
        endTime: "11:30",
        effectiveFrom: new Date("2026-01-15"),
        effectiveTo: new Date("2026-05-30"),
      },
    });
    routineSlotId = routineSlot.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "exp-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Experiment Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "exp-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Experiment Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: department.id,
      },
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "exp-admin@test.com", password: "test123" });
    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "exp-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated experiment list requests", async () => {
      const res = await request(app).get("/api/experiments");
      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/experiments", () => {
    it("should create an experiment with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ courseId: courseOneId, number: 1, title: "Blinking LED" });

      expect(res.status).toBe(201);
      expect(res.body.data.number).toBe(1);
      expect(res.body.data.title).toBe("Blinking LED");
      expect(res.body.data.course.id).toBe(courseOneId);
      expect(res.body.data.items).toEqual([]);
      experimentId = res.body.data.id;
    });

    it("should deny create for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ courseId: courseOneId, number: 99, title: "Should Not Exist" });

      expect(res.status).toBe(403);
    });

    it("should return 409 for a duplicate number in the same course", async () => {
      const res = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ courseId: courseOneId, number: 1, title: "Duplicate Number" });

      expect(res.status).toBe(409);
    });

    it("should allow the same number in a different course", async () => {
      const res = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId: courseTwoId,
          number: 1,
          title: "Other Course Experiment",
        });

      expect(res.status).toBe(201);
      secondExperimentId = res.body.data.id;
    });

    it("should return 404 for a non-existent course", async () => {
      const res = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId: "nonexistent",
          number: 5,
          title: "Orphan Experiment",
        });

      expect(res.status).toBe(404);
    });

    it("should reject a non-positive experiment number", async () => {
      const res = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ courseId: courseOneId, number: 0, title: "Zero Number" });

      expect(res.status).toBe(400);
    });
  });

  describe("READ - GET /api/experiments", () => {
    it("should allow authenticated users to list experiments", async () => {
      const res = await request(app)
        .get("/api/experiments")
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it("should filter experiments by course", async () => {
      const res = await request(app)
        .get(`/api/experiments?courseId=${courseOneId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (experiment: { course: { id: string } }) =>
            experiment.course.id === courseOneId,
        ),
      ).toBe(true);
    });

    it("should get an experiment by ID", async () => {
      const res = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(experimentId);
    });

    it("should return 404 for a non-existent experiment", async () => {
      const res = await request(app)
        .get("/api/experiments/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/experiments/:id", () => {
    it("should update an experiment with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .patch(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ title: "Blinking LED and Digital Output" });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe("Blinking LED and Digital Output");
      expect(res.body.data.number).toBe(1);
    });

    it("should deny update for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ title: "Should Not Change" });

      expect(res.status).toBe(403);
    });
  });

  describe("ITEM LIST - /api/experiments/:id/items", () => {
    it("should add an item and return the experiment with its list", async () => {
      const res = await request(app)
        .post(`/api/experiments/${experimentId}/items`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ componentId: componentOneId, qtyPerGroup: 4 });

      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].qtyPerGroup).toBe(4);
      expect(res.body.data.items[0].component.id).toBe(componentOneId);
      itemId = res.body.data.items[0].id;
    });

    it("should deny adding an item for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post(`/api/experiments/${experimentId}/items`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ componentId: componentTwoId, qtyPerGroup: 1 });

      expect(res.status).toBe(403);
    });

    it("should return 409 for the same component twice", async () => {
      const res = await request(app)
        .post(`/api/experiments/${experimentId}/items`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ componentId: componentOneId, qtyPerGroup: 2 });

      expect(res.status).toBe(409);
    });

    it("should return 404 for a non-existent component", async () => {
      const res = await request(app)
        .post(`/api/experiments/${experimentId}/items`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ componentId: "nonexistent", qtyPerGroup: 1 });

      expect(res.status).toBe(404);
    });

    it("should reject a zero quantity per group", async () => {
      const res = await request(app)
        .post(`/api/experiments/${experimentId}/items`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ componentId: componentTwoId, qtyPerGroup: 0 });

      expect(res.status).toBe(400);
    });

    it("should update an item quantity", async () => {
      const res = await request(app)
        .patch(`/api/experiments/${experimentId}/items/${itemId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ qtyPerGroup: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].qtyPerGroup).toBe(5);
    });

    it("should not reach an item through a different experiment's URL", async () => {
      const res = await request(app)
        .patch(`/api/experiments/${secondExperimentId}/items/${itemId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ qtyPerGroup: 99 });

      expect(res.status).toBe(404);
    });

    it("should delete an item", async () => {
      const addSecond = await request(app)
        .post(`/api/experiments/${experimentId}/items`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ componentId: componentTwoId, qtyPerGroup: 1 });

      expect(addSecond.status).toBe(201);
      expect(addSecond.body.data.items).toHaveLength(2);

      const secondItemId = addSecond.body.data.items.find(
        (item: { component: { id: string } }) =>
          item.component.id === componentTwoId,
      ).id;

      const res = await request(app)
        .delete(`/api/experiments/${experimentId}/items/${secondItemId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const after = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(after.body.data.items).toHaveLength(1);
    });
  });

  describe("DELETE - DELETE /api/experiments/:id", () => {
    it("should deny delete for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);

      expect(res.status).toBe(403);
    });

    it("should block deletion when the experiment is assigned to a class session", async () => {
      const created = await request(app)
        .post("/api/experiments")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          courseId: courseOneId,
          number: 7,
          title: "Assigned Experiment",
        });

      expect(created.status).toBe(201);
      lockedExperimentId = created.body.data.id;

      await prisma.classSession.create({
        data: {
          routineSlotId,
          date: new Date("2026-02-04"),
          startsAt: new Date("2026-02-04T08:30:00.000Z"),
          endsAt: new Date("2026-02-04T11:30:00.000Z"),
          experimentId: lockedExperimentId,
        },
      });

      const res = await request(app)
        .delete(`/api/experiments/${lockedExperimentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        "Experiment is assigned to class sessions and cannot be deleted",
      );
    });

    it("should delete an experiment and cascade its item list", async () => {
      const res = await request(app)
        .delete(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(204);

      const deleted = await prisma.experiment.findUnique({
        where: { id: experimentId },
      });
      expect(deleted).toBeNull();

      const orphanedItems = await prisma.experimentItem.findMany({
        where: { experimentId },
      });
      expect(orphanedItems).toHaveLength(0);
    });

    it("should return 404 for the deleted experiment", async () => {
      const res = await request(app)
        .get(`/api/experiments/${experimentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
