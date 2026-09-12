import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import quotaRouter from "./quota.routes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", quotaRouter);

const testDepartmentCodes = [
  "QUOTA-SUGGEST-A",
  "QUOTA-SUGGEST-B",
  "QUOTA-SUGGEST-INACTIVE",
];

const testCourseCodes = [
  "QUOTA-SUGGEST-COURSE-A",
  "QUOTA-SUGGEST-COURSE-B",
];

const testComponentCodes = [
  "QUOTA-SUGGEST-COMP-A",
  "QUOTA-SUGGEST-COMP-B",
];

const testEmails = [
  "quota-suggest-admin@test.com",
  "quota-suggest-central@test.com",
  "quota-suggest-office@test.com",
  "quota-suggest-student@test.com",
];

const TEST_DATE = "2027-03-02";

function at(time: string): Date {
  return new Date(`${TEST_DATE}T${time}:00.000Z`);
}

async function cleanupTestData() {
  const departments = await prisma.department.findMany({
    where: {
      code: {
        in: testDepartmentCodes,
      },
    },
    select: { id: true },
  });

  const components = await prisma.component.findMany({
    where: {
      code: {
        in: testComponentCodes,
      },
    },
    select: { id: true },
  });

  const departmentIds = departments.map((item) => item.id);
  const componentIds = components.map((item) => item.id);

  if (departmentIds.length > 0 || componentIds.length > 0) {
    await prisma.quotaHistory.deleteMany({
      where: {
        OR: [
          ...(departmentIds.length > 0
            ? [{ departmentId: { in: departmentIds } }]
            : []),
          ...(componentIds.length > 0
            ? [{ componentId: { in: componentIds } }]
            : []),
        ],
      },
    });

    await prisma.departmentQuota.deleteMany({
      where: {
        OR: [
          ...(departmentIds.length > 0
            ? [{ departmentId: { in: departmentIds } }]
            : []),
          ...(componentIds.length > 0
            ? [{ componentId: { in: componentIds } }]
            : []),
        ],
      },
    });
  }

  await prisma.classSession.deleteMany({
    where: {
      routineSlot: {
        section: {
          course: {
            code: {
              in: testCourseCodes,
            },
          },
        },
      },
    },
  });

  await prisma.routineSlot.deleteMany({
    where: {
      section: {
        course: {
          code: {
            in: testCourseCodes,
          },
        },
      },
    },
  });

  await prisma.section.deleteMany({
    where: {
      course: {
        code: {
          in: testCourseCodes,
        },
      },
    },
  });

  await prisma.experimentItem.deleteMany({
    where: {
      experiment: {
        course: {
          code: {
            in: testCourseCodes,
          },
        },
      },
    },
  });

  await prisma.experiment.deleteMany({
    where: {
      course: {
        code: {
          in: testCourseCodes,
        },
      },
    },
  });

  await prisma.course.deleteMany({
    where: {
      code: {
        in: testCourseCodes,
      },
    },
  });

  await prisma.lab.deleteMany({
    where: {
      department: {
        code: {
          in: testDepartmentCodes,
        },
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

  if (componentIds.length > 0) {
    await prisma.stock.deleteMany({
      where: {
        componentId: {
          in: componentIds,
        },
      },
    });

    await prisma.component.deleteMany({
      where: {
        id: {
          in: componentIds,
        },
      },
    });
  }

  if (departmentIds.length > 0) {
    await prisma.department.deleteMany({
      where: {
        id: {
          in: departmentIds,
        },
      },
    });
  }
}

describe("Quota Suggestion Engine Integration Tests", () => {
  let adminToken: string;
  let centralToken: string;
  let officeToken: string;
  let studentToken: string;

  let departmentAId: string;
  let departmentBId: string;
  let inactiveDepartmentId: string;

  let componentAId: string;
  let componentBId: string;

  const originalConfirmedAt = new Date("2027-01-15T12:00:00.000Z");

  beforeAll(async () => {
    await cleanupTestData();

    const departmentA = await prisma.department.create({
      data: {
        code: testDepartmentCodes[0],
        name: "Quota Suggestion Department A",
        isActive: true,
      },
    });
    departmentAId = departmentA.id;

    const departmentB = await prisma.department.create({
      data: {
        code: testDepartmentCodes[1],
        name: "Quota Suggestion Department B",
        isActive: true,
      },
    });
    departmentBId = departmentB.id;

    const inactiveDepartment = await prisma.department.create({
      data: {
        code: testDepartmentCodes[2],
        name: "Inactive Quota Suggestion Department",
        isActive: false,
      },
    });
    inactiveDepartmentId = inactiveDepartment.id;

    const componentA = await prisma.component.create({
      data: {
        code: testComponentCodes[0],
        name: "Quota Suggestion Component A",
        category: "Quota Suggestion Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: true,
      },
    });
    componentAId = componentA.id;

    const componentB = await prisma.component.create({
      data: {
        code: testComponentCodes[1],
        name: "Quota Suggestion Component B",
        category: "Quota Suggestion Test",
        sizeClass: "SMALL",
        unit: "pcs",
        isReturnable: true,
        isActive: true,
      },
    });
    componentBId = componentB.id;

    const courseA = await prisma.course.create({
      data: {
        code: testCourseCodes[0],
        title: "Quota Suggestion Course A",
        departmentId: departmentAId,
      },
    });

    const courseB = await prisma.course.create({
      data: {
        code: testCourseCodes[1],
        title: "Quota Suggestion Course B",
        departmentId: departmentBId,
      },
    });

    const experimentA1 = await prisma.experiment.create({
      data: {
        courseId: courseA.id,
        number: 1,
        title: "Quota Suggestion Experiment A1",
      },
    });

    const experimentA2 = await prisma.experiment.create({
      data: {
        courseId: courseA.id,
        number: 2,
        title: "Quota Suggestion Experiment A2",
      },
    });

    const experimentB = await prisma.experiment.create({
      data: {
        courseId: courseB.id,
        number: 1,
        title: "Quota Suggestion Experiment B1",
      },
    });

    await prisma.experimentItem.createMany({
      data: [
        {
          experimentId: experimentA1.id,
          componentId: componentAId,
          qtyPerGroup: 2,
        },
        {
          experimentId: experimentA2.id,
          componentId: componentAId,
          qtyPerGroup: 5,
        },
        {
          experimentId: experimentA1.id,
          componentId: componentBId,
          qtyPerGroup: 3,
        },
        {
          experimentId: experimentB.id,
          componentId: componentAId,
          qtyPerGroup: 4,
        },
      ],
    });

    const labA = await prisma.lab.create({
      data: {
        name: "Quota Suggestion Lab A",
        roomNo: "QUOTA-SUGGEST-LAB-A",
        groupSize: 4,
        departmentId: departmentAId,
      },
    });

    const effectiveFrom = new Date("2027-01-01");
    const effectiveTo = new Date("2027-12-31");

    async function makeSession(
      sectionName: string,
      studentCount: number,
      startTime: string,
      endTime: string,
    ) {
      const section = await prisma.section.create({
        data: {
          courseId: courseA.id,
          name: sectionName,
          semester: "Spring 2027",
          studentCount,
        },
      });

      const slot = await prisma.routineSlot.create({
        data: {
          sectionId: section.id,
          labId: labA.id,
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
          status: "SCHEDULED",
        },
      });
    }

    // Department A:
    // 40 students / group size 4 = 10 groups
    // 20 students / group size 4 = 5 groups
    // 12 students / group size 4 = 3 groups
    // All overlap at 10:00 -> peakGroups = 18.
    await makeSession("SUGGEST-A1", 40, "08:00", "11:00");
    await makeSession("SUGGEST-A2", 20, "09:00", "12:00");
    await makeSession("SUGGEST-A3", 12, "10:00", "10:30");

    await prisma.departmentQuota.create({
      data: {
        departmentId: departmentAId,
        componentId: componentAId,
        qty: 7,
        suggestedQty: 1,
        confirmedAt: originalConfirmedAt,
      },
    });

    const passwordHash = await bcryptjs.hash("test123", 10);

    await prisma.user.createMany({
      data: [
        {
          email: testEmails[0],
          passwordHash,
          fullName: "Quota Suggestion Admin",
          role: "SYSTEM_ADMIN",
          departmentId: null,
        },
        {
          email: testEmails[1],
          passwordHash,
          fullName: "Quota Suggestion Central Officer",
          role: "CENTRAL_STORE_OFFICER",
          departmentId: departmentAId,
        },
        {
          email: testEmails[2],
          passwordHash,
          fullName: "Quota Suggestion Office Admin",
          role: "OFFICE_ADMIN",
          departmentId: null,
        },
        {
          email: testEmails[3],
          passwordHash,
          fullName: "Quota Suggestion Student",
          role: "STUDENT",
          departmentId: departmentAId,
        },
      ],
    });

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmails[0], password: "test123" });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmails[1], password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralToken = centralLogin.body.token;

    const officeLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmails[2], password: "test123" });
    expect(officeLogin.status).toBe(200);
    officeToken = officeLogin.body.token;

    const studentLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmails[3], password: "test123" });
    expect(studentLogin.status).toBe(200);
    studentToken = studentLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  it("should reject unauthenticated suggestion generation", async () => {
    const res = await request(app)
      .post("/api/quotas/suggestions")
      .send({ departmentId: departmentAId });

    expect(res.status).toBe(401);
  });

  it("should deny OFFICE_ADMIN and STUDENT from generating suggestions", async () => {
    const officeRes = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${officeToken}`)
      .send({ departmentId: departmentAId });

    expect(officeRes.status).toBe(403);

    const studentRes = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ departmentId: departmentAId });

    expect(studentRes.status).toBe(403);
  });

  it("should calculate peakGroups multiplied by maximum qtyPerGroup", async () => {
    const res = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId: departmentAId });

    expect(res.status).toBe(200);
    expect(res.body.department.id).toBe(departmentAId);
    expect(res.body.peakGroups).toBe(18);

    const componentASuggestion = res.body.suggestions.find(
      (item: { componentId: string }) =>
        item.componentId === componentAId,
    );

    const componentBSuggestion = res.body.suggestions.find(
      (item: { componentId: string }) =>
        item.componentId === componentBId,
    );

    expect(componentASuggestion).toEqual({
      componentId: componentAId,
      maxQtyPerGroup: 5,
      suggestedQty: 90,
    });

    expect(componentBSuggestion).toEqual({
      componentId: componentBId,
      maxQtyPerGroup: 3,
      suggestedQty: 54,
    });
  });

  it("should preserve confirmed qty and confirmedAt and create no history", async () => {
    const beforeHistory = await prisma.quotaHistory.count({
      where: {
        departmentId: departmentAId,
        componentId: componentAId,
      },
    });

    const res = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${centralToken}`)
      .send({ departmentId: departmentAId });

    expect(res.status).toBe(200);

    const quota = await prisma.departmentQuota.findUniqueOrThrow({
      where: {
        departmentId_componentId: {
          departmentId: departmentAId,
          componentId: componentAId,
        },
      },
    });

    expect(quota.qty).toBe(7);
    expect(quota.suggestedQty).toBe(90);
    expect(quota.confirmedAt?.toISOString()).toBe(
      originalConfirmedAt.toISOString(),
    );

    const afterHistory = await prisma.quotaHistory.count({
      where: {
        departmentId: departmentAId,
        componentId: componentAId,
      },
    });

    expect(afterHistory).toBe(beforeHistory);
  });

  it("should create a missing quota row with zero confirmed quantity", async () => {
    const quota = await prisma.departmentQuota.findUniqueOrThrow({
      where: {
        departmentId_componentId: {
          departmentId: departmentAId,
          componentId: componentBId,
        },
      },
    });

    expect(quota.qty).toBe(0);
    expect(quota.suggestedQty).toBe(54);
    expect(quota.confirmedAt).toBeNull();
  });

  it("should use zero peakGroups when the department has no class sessions", async () => {
    const res = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId: departmentBId });

    expect(res.status).toBe(200);
    expect(res.body.peakGroups).toBe(0);

    const suggestion = res.body.suggestions.find(
      (item: { componentId: string }) =>
        item.componentId === componentAId,
    );

    expect(suggestion).toEqual({
      componentId: componentAId,
      maxQtyPerGroup: 4,
      suggestedQty: 0,
    });

    const quota = await prisma.departmentQuota.findUniqueOrThrow({
      where: {
        departmentId_componentId: {
          departmentId: departmentBId,
          componentId: componentAId,
        },
      },
    });

    expect(quota.qty).toBe(0);
    expect(quota.suggestedQty).toBe(0);
    expect(quota.confirmedAt).toBeNull();
  });

  it("should respect a date range", async () => {
    const res = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        departmentId: departmentAId,
        from: "2027-04-01",
        to: "2027-04-30",
      });

    expect(res.status).toBe(200);
    expect(res.body.peakGroups).toBe(0);

    for (const suggestion of res.body.suggestions) {
      expect(suggestion.suggestedQty).toBe(0);
    }
  });

  it("should reject an invalid date range", async () => {
    const res = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        departmentId: departmentAId,
        from: "2027-05-01",
        to: "2027-04-01",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      "From date must be on or before to date",
    );
  });

  it("should reject an inactive department", async () => {
    const res = await request(app)
      .post("/api/quotas/suggestions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ departmentId: inactiveDepartmentId });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Department not found");
  });
});
