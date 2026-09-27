import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import requisitionRouter from "./requisition.routes";
import damageRouter from "./damage.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", requisitionRouter);
app.use("/api", damageRouter);

const testDepartmentCodes = ["TEST-REQ-A", "TEST-REQ-B", "TEST-REQ-OFFICE"];
const testCourseCodes = ["TEST-REQ-COURSE-A", "TEST-REQ-COURSE-B"];
const testComponentCodes = [
  "TEST-REQ-COMP-1",
  "TEST-REQ-COMP-2",
  "TEST-REQ-GONE",
  "TEST-REQ-CONCURRENT",
  "TEST-REQ-TIER2",
  "TEST-REQ-TIER3",
  "TEST-REQ-TIER4",
  "TEST-REQ-SUB-ORIG",
  "TEST-REQ-SUB-ALT",
];
const testEmails = [
  "req-student@test.com",
  "req-student2@test.com",
  "req-labasst-a@test.com",
  "req-labasst-b@test.com",
  "req-central@test.com",
  "req-instructor-a@test.com",
  "req-instructor-b@test.com",
];

const DAY = "2027-06-08";

function at(time: string): Date {
  return new Date(`${DAY}T${time}:00.000Z`);
}

// A window for the personal and maintenance requisitions, which supply their own.
const OWN_WINDOW = {
  neededFrom: at("14:00").toISOString(),
  neededTo: at("17:00").toISOString(),
};

let departmentAId: string;
let departmentBId: string;
let sessionAId: string;
let sessionA2Id: string;
let sessionBId: string;
let componentOneId: string;
let componentTwoId: string;
let inactiveComponentId: string;
let studentId: string;

async function clearRequisitions() {
  // Tier 3 can create real BorrowRequest rows against a test requisition;
  // BorrowRequest.requisition has no onDelete: Cascade, so these must go
  // before the requisition itself or this delete throws an FK violation.
  await prisma.borrowRequest.deleteMany({
    where: {
      requisition: { department: { code: { in: testDepartmentCodes } } },
    },
  });
  // Tier 4 can create real PurchaseRequest rows too; PurchaseRequest.
  // requisition has no onDelete: Cascade either, so same ordering concern.
  // ApprovalStep cascades on PurchaseRequest deletion, so no separate delete.
  await prisma.purchaseRequest.deleteMany({
    where: {
      OR: [
        { requisition: { department: { code: { in: testDepartmentCodes } } } },
        { component: { code: { in: testComponentCodes } } },
      ],
    },
  });
  await prisma.allocation.deleteMany({
    where: {
      requisitionLine: { component: { code: { in: testComponentCodes } } },
    },
  });
  await prisma.requisitionLine.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.requisition.deleteMany({
    where: { department: { code: { in: testDepartmentCodes } } },
  });
}

async function cleanupTestData() {
  await prisma.damageReport.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await clearRequisitions();
  await prisma.stockMovement.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.stock.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.departmentQuota.deleteMany({
    where: {
      OR: [
        { component: { code: { in: testComponentCodes } } },
        { department: { code: { in: testDepartmentCodes } } },
      ],
    },
  });
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
  await prisma.componentSubstitute.deleteMany({
    where: { original: { code: { in: testComponentCodes } } },
  });
  await prisma.component.deleteMany({
    where: { code: { in: testComponentCodes } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Requisition CRUD API Integration Tests", () => {
  let studentToken: string;
  let student2Token: string;
  let labAsstAToken: string;
  let labAsstBToken: string;
  let centralToken: string;
  let instructorAToken: string;
  let instructorBToken: string;

  beforeAll(async () => {
    await cleanupTestData();

    const departmentA = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Requisition Test Dept A" },
    });
    departmentAId = departmentA.id;

    const departmentB = await prisma.department.create({
      data: { code: testDepartmentCodes[1], name: "Requisition Test Dept B" },
    });
    departmentBId = departmentB.id;

    const componentOne = await prisma.component.create({
      data: {
        code: testComponentCodes[0],
        name: "Requisition Test Component One",
        category: "Test",
        sizeClass: "EXPENSIVE",
      },
    });
    componentOneId = componentOne.id;

    const componentTwo = await prisma.component.create({
      data: {
        code: testComponentCodes[1],
        name: "Requisition Test Component Two",
        category: "Test",
        sizeClass: "SMALL",
      },
    });
    componentTwoId = componentTwo.id;

    const inactiveComponent = await prisma.component.create({
      data: {
        code: testComponentCodes[2],
        name: "Requisition Test Retired Component",
        category: "Test",
        sizeClass: "SMALL",
        isActive: false,
      },
    });
    inactiveComponentId = inactiveComponent.id;

    async function makeSession(
      departmentId: string,
      courseCode: string,
      sectionName: string,
      roomNo: string,
      startTime: string,
      endTime: string,
    ) {
      const course = await prisma.course.upsert({
        where: { code: courseCode },
        update: {},
        create: {
          code: courseCode,
          title: `${courseCode} title`,
          departmentId,
        },
      });

      const section = await prisma.section.create({
        data: {
          courseId: course.id,
          name: sectionName,
          semester: "Spring 2027",
          studentCount: 40,
        },
      });

      const lab = await prisma.lab.create({
        data: { name: `Lab ${roomNo}`, roomNo, groupSize: 4, departmentId },
      });

      const slot = await prisma.routineSlot.create({
        data: {
          sectionId: section.id,
          labId: lab.id,
          dayOfWeek: 2,
          startTime,
          endTime,
          effectiveFrom: new Date("2027-01-01"),
          effectiveTo: new Date("2027-12-31"),
        },
      });

      const session = await prisma.classSession.create({
        data: {
          routineSlotId: slot.id,
          date: new Date(DAY),
          startsAt: at(startTime),
          endsAt: at(endTime),
        },
      });

      return session.id;
    }

    sessionAId = await makeSession(
      departmentAId,
      testCourseCodes[0],
      "REQ-A1",
      "TEST-REQ-901",
      "08:30",
      "11:30",
    );
    sessionA2Id = await makeSession(
      departmentAId,
      testCourseCodes[0],
      "REQ-A2",
      "TEST-REQ-902",
      "14:00",
      "17:00",
    );
    sessionBId = await makeSession(
      departmentBId,
      testCourseCodes[1],
      "REQ-B1",
      "TEST-REQ-903",
      "08:30",
      "11:30",
    );

    const hashedPassword = await bcryptjs.hash("test123", 10);

    const student = await prisma.user.create({
      data: {
        email: "req-student@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Student",
        role: "STUDENT",
        departmentId: departmentAId,
      },
    });
    studentId = student.id;

    await prisma.user.create({
      data: {
        email: "req-student2@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Student Two",
        role: "STUDENT",
        departmentId: departmentAId,
      },
    });

    const assistantA = await prisma.user.create({
      data: {
        email: "req-labasst-a@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Lab Assistant A",
        role: "LAB_ASSISTANT",
        departmentId: departmentAId,
      },
    });

    const assistantB = await prisma.user.create({
      data: {
        email: "req-labasst-b@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Lab Assistant B",
        role: "LAB_ASSISTANT",
        departmentId: departmentBId,
      },
    });

    await prisma.user.create({
      data: {
        email: "req-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: null,
      },
    });

    const instructorA = await prisma.user.create({
      data: {
        email: "req-instructor-a@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Instructor A",
        role: "INSTRUCTOR",
        departmentId: departmentAId,
      },
    });
    const instructorB = await prisma.user.create({
      data: {
        email: "req-instructor-b@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Instructor B",
        role: "INSTRUCTOR",
        departmentId: departmentBId,
      },
    });
    await prisma.section.updateMany({
      where: { course: { code: testCourseCodes[0] } },
      data: { instructorId: instructorA.id, labAssistantId: assistantA.id },
    });
    await prisma.section.updateMany({
      where: { course: { code: testCourseCodes[1] } },
      data: { instructorId: instructorB.id, labAssistantId: assistantB.id },
    });
    await prisma.lab.updateMany({
      where: { departmentId: departmentAId, roomNo: { startsWith: "TEST-REQ-" } },
      data: { labAssistantId: assistantA.id },
    });
    await prisma.lab.updateMany({
      where: { departmentId: departmentBId, roomNo: { startsWith: "TEST-REQ-" } },
      data: { labAssistantId: assistantB.id },
    });

    async function login(email: string): Promise<string> {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "test123" });
      expect(res.status).toBe(200);
      return res.body.token;
    }

    studentToken = await login("req-student@test.com");
    student2Token = await login("req-student2@test.com");
    labAsstAToken = await login("req-labasst-a@test.com");
    labAsstBToken = await login("req-labasst-b@test.com");
    centralToken = await login("req-central@test.com");
    instructorAToken = await login("req-instructor-a@test.com");
    instructorBToken = await login("req-instructor-b@test.com");
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  function create(body: object, token: string) {
    return request(app)
      .post("/api/requisitions")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  describe("Instructor live orders", () => {
    beforeEach(clearRequisitions);

    it("requires authentication and an instructor role", async () => {
      const body = { lines: [{ componentId: componentOneId, qtyNeeded: 2 }] };
      const anonymous = await request(app)
        .post("/api/sessions/" + sessionAId + "/live-order")
        .send(body);
      expect(anonymous.status).toBe(401);

      const student = await request(app)
        .post("/api/sessions/" + sessionAId + "/live-order")
        .set("Authorization", "Bearer " + studentToken)
        .send(body);
      expect(student.status).toBe(403);
    });

    it("accepts only the assigned instructor and records the actual order", async () => {
      const body = { lines: [{ componentId: componentOneId, qtyNeeded: 2 }] };
      const wrongInstructor = await request(app)
        .post("/api/sessions/" + sessionAId + "/live-order")
        .set("Authorization", "Bearer " + instructorBToken)
        .send(body);
      expect(wrongInstructor.status).toBe(403);

      const placed = await request(app)
        .post("/api/sessions/" + sessionAId + "/live-order")
        .set("Authorization", "Bearer " + instructorAToken)
        .send(body);
      expect(placed.status).toBe(201);
      expect(placed.body.data.origin).toBe("INSTRUCTOR_LIVE");
      expect(placed.body.data.lines).toHaveLength(1);
      expect(placed.body.data.lines[0].qtyNeeded).toBe(2);
      expect(placed.body.data.status).not.toBe("DRAFT");
    });

    it("replaces an unsubmitted auto draft and rejects duplicate components", async () => {
      const draft = await create(
        { type: "CLASS", classSessionId: sessionA2Id, lines: [{ componentId: componentTwoId, qtyNeeded: 8 }] },
        labAsstAToken,
      );
      expect(draft.status).toBe(201);

      const duplicate = await request(app)
        .post("/api/sessions/" + sessionA2Id + "/live-order")
        .set("Authorization", "Bearer " + instructorAToken)
        .send({ lines: [
          { componentId: componentOneId, qtyNeeded: 1 },
          { componentId: componentOneId, qtyNeeded: 1 },
        ] });
      expect(duplicate.status).toBe(409);

      const placed = await request(app)
        .post("/api/sessions/" + sessionA2Id + "/live-order")
        .set("Authorization", "Bearer " + instructorAToken)
        .send({ lines: [{ componentId: componentOneId, qtyNeeded: 3 }] });
      expect(placed.status).toBe(201);
      expect(placed.body.data.id).toBe(draft.body.data.id);
      expect(placed.body.data.origin).toBe("INSTRUCTOR_LIVE");
      expect(placed.body.data.lines).toHaveLength(1);
      expect(placed.body.data.lines[0].componentId).toBe(componentOneId);
    });
  });

  describe("Who may raise what", () => {
    beforeEach(clearRequisitions);

    it("rejects unauthenticated requests", async () => {
      const res = await request(app)
        .post("/api/requisitions")
        .send({ type: "PERSONAL", ...OWN_WINDOW });

      expect(res.status).toBe(401);
    });

    it("lets a student raise a personal requisition", async () => {
      const res = await create(
        { type: "PERSONAL", ...OWN_WINDOW },
        studentToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe("PERSONAL");
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.requestedBy.id).toBe(studentId);
    });

    it("stops a student raising a class requisition", async () => {
      const res = await create(
        { type: "CLASS", classSessionId: sessionAId },
        studentToken,
      );

      expect(res.status).toBe(403);
    });

    it("lets a lab assistant raise a class requisition", async () => {
      const res = await create(
        { type: "CLASS", classSessionId: sessionAId },
        labAsstAToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe("CLASS");
      expect(res.body.data.department.id).toBe(departmentAId);
    });

    it("lets a lab assistant raise a maintenance requisition", async () => {
      const res = await create(
        { type: "MAINTENANCE", ...OWN_WINDOW },
        labAsstAToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.data.type).toBe("MAINTENANCE");
    });

    it("stops a lab assistant raising a personal requisition", async () => {
      const res = await create(
        { type: "PERSONAL", ...OWN_WINDOW },
        labAsstAToken,
      );

      expect(res.status).toBe(403);
    });

    it("stops a lab assistant raising one for another department's session", async () => {
      const res = await create(
        { type: "CLASS", classSessionId: sessionAId },
        labAsstBToken,
      );

      expect(res.status).toBe(403);
    });
  });

  describe("The time window", () => {
    beforeEach(clearRequisitions);

    it("takes a class requisition's window from its session, ignoring the client", async () => {
      const res = await create(
        {
          type: "CLASS",
          classSessionId: sessionAId,
          // A three-day claim on a three-hour class — must be discarded.
          neededFrom: at("00:00").toISOString(),
          neededTo: new Date(`2027-06-11T23:59:00.000Z`).toISOString(),
        },
        labAsstAToken,
      );

      expect(res.status).toBe(201);
      expect(res.body.data.neededFrom).toBe(at("08:30").toISOString());
      expect(res.body.data.neededTo).toBe(at("11:30").toISOString());
    });

    it("requires a window on a personal requisition", async () => {
      const res = await create({ type: "PERSONAL" }, studentToken);
      expect(res.status).toBe(400);
    });

    it("rejects a window whose start is not before its end", async () => {
      const res = await create(
        {
          type: "PERSONAL",
          neededFrom: OWN_WINDOW.neededTo,
          neededTo: OWN_WINDOW.neededFrom,
        },
        studentToken,
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Class session binding", () => {
    beforeEach(clearRequisitions);

    it("requires a session on a class requisition", async () => {
      const res = await create({ type: "CLASS" }, labAsstAToken);
      expect(res.status).toBe(400);
    });

    it("refuses a session on a personal requisition", async () => {
      const res = await create(
        { type: "PERSONAL", classSessionId: sessionAId, ...OWN_WINDOW },
        studentToken,
      );

      expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown session", async () => {
      const res = await create(
        { type: "CLASS", classSessionId: "nonexistent" },
        labAsstAToken,
      );

      expect(res.status).toBe(404);
    });

    it("allows only one requisition per session", async () => {
      const first = await create(
        { type: "CLASS", classSessionId: sessionA2Id },
        labAsstAToken,
      );
      expect(first.status).toBe(201);

      const second = await create(
        { type: "CLASS", classSessionId: sessionA2Id },
        labAsstAToken,
      );

      expect(second.status).toBe(409);
    });
  });

  describe("Reading and scope", () => {
    beforeEach(async () => {
      await clearRequisitions();

      await create({ type: "PERSONAL", ...OWN_WINDOW }, studentToken);
      await create({ type: "PERSONAL", ...OWN_WINDOW }, student2Token);
      await create(
        { type: "CLASS", classSessionId: sessionBId },
        labAsstBToken,
      );
    });

    it("shows a student only their own requisitions", async () => {
      const res = await request(app)
        .get("/api/requisitions")
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].requestedBy.id).toBe(studentId);
    });

    it("forbids another student's requisition", async () => {
      const mine = await request(app)
        .get("/api/requisitions")
        .set("Authorization", `Bearer ${student2Token}`);

      const otherId = mine.body.data[0].id;

      const res = await request(app)
        .get(`/api/requisitions/${otherId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      // The record exists, but belongs to a different student.
      expect(res.status).toBe(403);
    });

    it("shows a lab assistant their own department's requisitions", async () => {
      const res = await request(app)
        .get("/api/requisitions")
        .set("Authorization", `Bearer ${labAsstAToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (r: { department: { id: string } }) =>
            r.department.id === departmentAId,
        ),
      ).toBe(true);
    });

    it("shows an unscoped role every department", async () => {
      const res = await request(app)
        .get("/api/requisitions")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);

      const departments = new Set(
        res.body.data.map(
          (r: { department: { id: string } }) => r.department.id,
        ),
      );

      expect(departments.has(departmentAId)).toBe(true);
      expect(departments.has(departmentBId)).toBe(true);
    });

    it("ignores a departmentId filter from a scoped role", async () => {
      const res = await request(app)
        .get(`/api/requisitions?departmentId=${departmentBId}`)
        .set("Authorization", `Bearer ${labAsstAToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (r: { department: { id: string } }) =>
            r.department.id === departmentAId,
        ),
      ).toBe(true);
    });
  });

  describe("Lines", () => {
    let requisitionId: string;

    beforeEach(async () => {
      await clearRequisitions();

      const res = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: componentOneId, qtyNeeded: 4 }],
        },
        studentToken,
      );

      expect(res.status).toBe(201);
      requisitionId = res.body.data.id;
    });

    it("creates a requisition with its lines", async () => {
      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.body.data.lines).toHaveLength(1);
      expect(res.body.data.lines[0].qtyNeeded).toBe(4);
      expect(res.body.data.lines[0].component.id).toBe(componentOneId);
    });

    it("leaves every resolution and return field at zero", async () => {
      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      const line = res.body.data.lines[0];

      // These belong to the resolver (task 3.4) and to return processing in
      // Stage 4. Nothing here may pre-fill them.
      expect(line.qtyOwnQuota).toBe(0);
      expect(line.qtySubstitute).toBe(0);
      expect(line.qtySpare).toBe(0);
      expect(line.qtyBorrowed).toBe(0);
      expect(line.qtyShort).toBe(0);
      expect(line.qtyIssued).toBe(0);
      expect(line.qtyReturnedGood).toBe(0);
      expect(line.qtyDamaged).toBe(0);
      expect(line.qtyLost).toBe(0);
      expect(line.qtyUsedUp).toBe(0);
    });

    it("adds a line and returns the whole requisition", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/lines`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ componentId: componentTwoId, qtyNeeded: 10 });

      expect(res.status).toBe(201);
      expect(res.body.data.lines).toHaveLength(2);
    });

    it("refuses the same component twice", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/lines`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ componentId: componentOneId, qtyNeeded: 1 });

      expect(res.status).toBe(409);
    });

    it("refuses duplicate components in the create payload", async () => {
      const res = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [
            { componentId: componentTwoId, qtyNeeded: 1 },
            { componentId: componentTwoId, qtyNeeded: 2 },
          ],
        },
        studentToken,
      );

      expect(res.status).toBe(409);
    });

    it("refuses an inactive component", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/lines`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ componentId: inactiveComponentId, qtyNeeded: 1 });

      expect(res.status).toBe(404);
    });

    it("refuses a quantity below one", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/lines`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ componentId: componentTwoId, qtyNeeded: 0 });

      expect(res.status).toBe(400);
    });

    it("changes a line quantity", async () => {
      const detail = await request(app)
        .get(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      const lineId = detail.body.data.lines[0].id;

      const res = await request(app)
        .patch(`/api/requisitions/${requisitionId}/lines/${lineId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ qtyNeeded: 9 });

      expect(res.status).toBe(200);
      expect(res.body.data.lines[0].qtyNeeded).toBe(9);
    });

    it("removes a line", async () => {
      const detail = await request(app)
        .get(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      const lineId = detail.body.data.lines[0].id;

      const res = await request(app)
        .delete(`/api/requisitions/${requisitionId}/lines/${lineId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lines).toHaveLength(0);
    });

    it("will not reach a line through another requisition's URL", async () => {
      const detail = await request(app)
        .get(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      const lineId = detail.body.data.lines[0].id;

      const other = await create(
        { type: "PERSONAL", ...OWN_WINDOW },
        studentToken,
      );

      const res = await request(app)
        .patch(`/api/requisitions/${other.body.data.id}/lines/${lineId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ qtyNeeded: 99 });

      expect(res.status).toBe(404);
    });
  });

  describe("Editing, ownership and status", () => {
    let requisitionId: string;

    beforeEach(async () => {
      await clearRequisitions();

      const res = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: componentOneId, qtyNeeded: 2 }],
        },
        studentToken,
      );

      requisitionId = res.body.data.id;
    });

    it("lets the requester change a personal window", async () => {
      const res = await request(app)
        .patch(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ neededTo: at("18:00").toISOString() });

      expect(res.status).toBe(200);
      expect(res.body.data.neededTo).toBe(at("18:00").toISOString());
    });

    it("will not let a class window be edited by hand", async () => {
      const classReq = await create(
        { type: "CLASS", classSessionId: sessionAId },
        labAsstAToken,
      );

      const res = await request(app)
        .patch(`/api/requisitions/${classReq.body.data.id}`)
        .set("Authorization", `Bearer ${labAsstAToken}`)
        .send({ neededTo: at("23:00").toISOString() });

      expect(res.status).toBe(400);
    });

    it("stops another user editing your draft", async () => {
      const res = await request(app)
        .patch(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${student2Token}`)
        .send({ neededTo: at("18:00").toISOString() });

      expect(res.status).toBe(403);
    });

    it("deletes a draft", async () => {
      const res = await request(app)
        .delete(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(204);
    });

    it("refuses to edit anything past draft", async () => {
      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "SUBMITTED" },
      });

      const res = await request(app)
        .patch(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ neededTo: at("18:00").toISOString() });

      expect(res.status).toBe(409);
    });

    it("refuses to delete anything past draft", async () => {
      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "SUBMITTED" },
      });

      const res = await request(app)
        .delete(`/api/requisitions/${requisitionId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(409);
    });

    it("refuses to add a line past draft", async () => {
      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/lines`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ componentId: componentTwoId, qtyNeeded: 1 });

      expect(res.status).toBe(409);
    });
  });

  describe("Issue and return", () => {
    let requisitionId: string;

    beforeEach(async () => {
      await clearRequisitions();
      await prisma.stockMovement.deleteMany({
        where: { component: { code: { in: testComponentCodes } } },
      });
      await prisma.stock.deleteMany({
        where: { component: { code: { in: testComponentCodes } } },
      });

      const res = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: componentOneId, qtyNeeded: 5 }],
        },
        studentToken,
      );

      requisitionId = res.body.data.id;
    });

    it("rejects unauthenticated issue-preview requests", async () => {
      const res = await request(app).get(
        `/api/requisitions/${requisitionId}/issue-preview`,
      );

      expect(res.status).toBe(401);
    });

    it("stops a student previewing a requisition's issue", async () => {
      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}/issue-preview`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown requisition on issue-preview", async () => {
      const res = await request(app)
        .get("/api/requisitions/nonexistent/issue-preview")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(404);
    });

    it("previews a requisition's components, quantities and current stock", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}/issue-preview`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requisitionId).toBe(requisitionId);
      expect(res.body.data.status).toBe("READY");
      expect(res.body.data.lines).toHaveLength(1);

      const line = res.body.data.lines[0];
      expect(line.componentId).toBe(componentOneId);
      expect(line.componentCode).toBe(testComponentCodes[0]);
      expect(line.qtyNeeded).toBe(5);
      expect(line.currentStock).toBe(10);
    });

    it("previews zero current stock for a component with no stock row yet", async () => {
      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}/issue-preview`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lines[0].currentStock).toBe(0);
    });

    it("rejects unauthenticated issue requests", async () => {
      const res = await request(app).post(
        `/api/requisitions/${requisitionId}/issue`,
      );

      expect(res.status).toBe(401);
    });

    it("stops a student issuing a requisition", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown requisition on issue", async () => {
      const res = await request(app)
        .post("/api/requisitions/nonexistent/issue")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown requisition on return", async () => {
      const res = await request(app)
        .post("/api/requisitions/nonexistent/return")
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ items: [{ componentId: componentOneId, goodQty: 1 }] });

      expect(res.status).toBe(404);
    });

    it("refuses to issue a requisition that is not ready", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(400);
    });

    it("refuses to return a requisition that has not been issued", async () => {
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ items: [{ componentId: componentOneId, goodQty: 1 }] });

      expect(res.status).toBe(400);
    });

    it("rejects unauthenticated return-preview requests", async () => {
      const res = await request(app).get(
        `/api/requisitions/${requisitionId}/return-preview`,
      );

      expect(res.status).toBe(401);
    });

    it("stops a student previewing a requisition's return", async () => {
      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}/return-preview`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown requisition on return-preview", async () => {
      const res = await request(app)
        .get("/api/requisitions/nonexistent/return-preview")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(404);
    });

    it("previews an issued requisition's returnable components", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(issueRes.status).toBe(200);

      const res = await request(app)
        .get(`/api/requisitions/${requisitionId}/return-preview`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.requisitionId).toBe(requisitionId);
      expect(res.body.data.status).toBe("ISSUED");
      expect(res.body.data.lines).toHaveLength(1);

      const line = res.body.data.lines[0];
      expect(line.componentId).toBe(componentOneId);
      expect(line.componentCode).toBe(testComponentCodes[0]);
      expect(line.qtyIssued).toBe(5);
    });

    it("omits lines that were never issued from the return preview", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: componentOneId, qtyNeeded: 5 }],
        },
        studentToken,
      );
      const otherId = created.body.data.id;

      const res = await request(app)
        .get(`/api/requisitions/${otherId}/return-preview`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lines).toHaveLength(0);
    });

    it("refuses to issue when stock is insufficient", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 1, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(409);
    });

    it("issues stock and later accepts a return", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(issueRes.status).toBe(200);
      expect(issueRes.body.data.status).toBe("ISSUED");
      expect(issueRes.body.data.lines[0].qtyIssued).toBe(5);

      const stockAfterIssue = await prisma.stock.findUnique({
        where: { componentId: componentOneId },
      });

      expect(stockAfterIssue?.onHand).toBe(5);

      const issueMovement = await prisma.stockMovement.findFirst({
        where: {
          componentId: componentOneId,
          type: "ISSUE",
          refId: requisitionId,
        },
      });

      expect(issueMovement).not.toBeNull();
      expect(issueMovement?.qty).toBe(-5);

      const returnRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 3,
              damagedQty: 1,
              lostQty: 1,
              usedUpQty: 0,
            },
          ],
        });

      expect(returnRes.status).toBe(200);
      expect(returnRes.body.data.status).toBe("RETURNED");

      const returnedLine = returnRes.body.data.lines[0];
      expect(returnedLine.qtyReturnedGood).toBe(3);
      expect(returnedLine.qtyDamaged).toBe(1);
      expect(returnedLine.qtyLost).toBe(1);

      const stockAfterReturn = await prisma.stock.findUnique({
        where: { componentId: componentOneId },
      });

      // 5 remained after issue; +3 good returned = 8. Damaged/lost stay out.
      expect(stockAfterReturn?.onHand).toBe(8);

      const damagedMovement = await prisma.stockMovement.findFirst({
        where: {
          componentId: componentOneId,
          type: "DAMAGED",
          refId: requisitionId,
        },
      });

      expect(damagedMovement).not.toBeNull();
      expect(damagedMovement?.qty).toBe(1);
    });

    it("deducts every issued unit from onHand and the spare portion from spareQty", async () => {
      await prisma.stock.create({
        data: {
          componentId: componentOneId,
          onHand: 10,
          spareQty: 5,
        },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      await prisma.requisitionLine.updateMany({
        where: { requisitionId },
        data: { qtySpare: 3 },
      });

      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);

      const stock = await prisma.stock.findUniqueOrThrow({
        where: { componentId: componentOneId },
      });

      expect(stock.onHand).toBe(5);
      expect(stock.spareQty).toBe(2);
    });

    it("Task 5.18: still accepts a return whose counts sum exactly to qtyIssued", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(issueRes.status).toBe(200);
      expect(issueRes.body.data.lines[0].qtyIssued).toBe(5);

      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 4,
              damagedQty: 1,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("RETURNED");

      const line = await prisma.requisitionLine.findFirst({
        where: { requisitionId, componentId: componentOneId },
      });
      expect(line?.qtyReturnedGood).toBe(4);
      expect(line?.qtyDamaged).toBe(1);
    });

    it("Task 5.18: rejects a return whose counts sum to less than qtyIssued, with no StockMovement or line change", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(issueRes.status).toBe(200);
      expect(issueRes.body.data.lines[0].qtyIssued).toBe(5);

      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 2,
              damagedQty: 0,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Return quantity mismatch");

      const line = await prisma.requisitionLine.findFirst({
        where: { requisitionId, componentId: componentOneId },
      });
      expect(line?.qtyReturnedGood).toBe(0);
      expect(line?.qtyDamaged).toBe(0);
      expect(line?.qtyLost).toBe(0);
      expect(line?.qtyUsedUp).toBe(0);

      const returnMovements = await prisma.stockMovement.findMany({
        where: {
          refId: requisitionId,
          type: { in: ["RETURN", "DAMAGED", "LOST", "USED_UP"] },
        },
      });
      expect(returnMovements).toHaveLength(0);

      const requisition = await prisma.requisition.findUnique({
        where: { id: requisitionId },
      });
      expect(requisition?.status).toBe("ISSUED");
    });

    it("Task 5.18: rejects a return whose counts sum to more than qtyIssued", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(issueRes.status).toBe(200);
      expect(issueRes.body.data.lines[0].qtyIssued).toBe(5);

      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 10,
              damagedQty: 0,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(400);

      const line = await prisma.requisitionLine.findFirst({
        where: { requisitionId, componentId: componentOneId },
      });
      expect(line?.qtyReturnedGood).toBe(0);

      const requisition = await prisma.requisition.findUnique({
        where: { id: requisitionId },
      });
      expect(requisition?.status).toBe("ISSUED");
    });

    it("Task 5.18: rejects the whole return when one line is valid and another isn't, applying neither", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [
            { componentId: componentOneId, qtyNeeded: 5 },
            { componentId: componentTwoId, qtyNeeded: 3 },
          ],
        },
        studentToken,
      );
      const multiRequisitionId = created.body.data.id;

      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 10, spareQty: 0 },
      });
      await prisma.stock.create({
        data: { componentId: componentTwoId, onHand: 10, spareQty: 0 },
      });

      await prisma.requisition.update({
        where: { id: multiRequisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${multiRequisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);

      expect(issueRes.status).toBe(200);

      // componentOne's counts are valid (sum to its qtyIssued of 5) and come
      // first; componentTwo's are invalid (sum to 2, not its qtyIssued of
      // 3) and come second — proving the pre-check rejects everything
      // up front rather than only stopping once it reaches the bad line.
      const res = await request(app)
        .post(`/api/requisitions/${multiRequisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 5,
              damagedQty: 0,
              lostQty: 0,
              usedUpQty: 0,
            },
            {
              componentId: componentTwoId,
              goodQty: 2,
              damagedQty: 0,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(400);

      const lineOne = await prisma.requisitionLine.findFirst({
        where: { requisitionId: multiRequisitionId, componentId: componentOneId },
      });
      const lineTwo = await prisma.requisitionLine.findFirst({
        where: { requisitionId: multiRequisitionId, componentId: componentTwoId },
      });

      expect(lineOne?.qtyReturnedGood).toBe(0);
      expect(lineTwo?.qtyReturnedGood).toBe(0);

      const returnMovements = await prisma.stockMovement.findMany({
        where: {
          refId: multiRequisitionId,
          type: { in: ["RETURN", "DAMAGED", "LOST", "USED_UP"] },
        },
      });
      expect(returnMovements).toHaveLength(0);

      const requisition = await prisma.requisition.findUnique({
        where: { id: multiRequisitionId },
      });
      expect(requisition?.status).toBe("ISSUED");
    });

    it("Task 5.19: a return that drops stock below the reorder point auto-raises a purchase request", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 5, spareQty: 0, reorderPoint: 3 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(issueRes.status).toBe(200);

      // onHand after issue: 5 - 5 = 0.
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 1,
              damagedQty: 4,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(200);

      // onHand after return: 0 + 1 (good) = 1, below reorderPoint of 3.
      const stock = await prisma.stock.findUnique({
        where: { componentId: componentOneId },
      });
      expect(stock?.onHand).toBe(1);

      const purchaseRequest = await prisma.purchaseRequest.findFirst({
        where: { componentId: componentOneId },
        include: { steps: true },
      });

      expect(purchaseRequest).not.toBeNull();
      expect(purchaseRequest?.status).toBe("PENDING");
      expect(purchaseRequest?.urgency).toBe("NORMAL");
      expect(purchaseRequest?.currentLevel).toBe(1);
      // Requested enough to bring onHand back up to the reorder point: 3 - 1 = 2.
      expect(purchaseRequest?.qtyNeeded).toBe(2);
      expect(purchaseRequest?.steps).toHaveLength(1);
      expect(purchaseRequest?.steps[0].level).toBe(1);
      expect(purchaseRequest?.steps[0].approverRole).toBe(
        "DEPT_STORE_HEAD",
      );
    });

    it("Task 5.19: a return that keeps stock at or above the reorder point does not raise a purchase request", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 20, spareQty: 0, reorderPoint: 3 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(issueRes.status).toBe(200);

      // onHand after issue: 20 - 5 = 15; after +3 good returned: 18 >= 3.
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 3,
              damagedQty: 2,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(200);

      const purchaseRequest = await prisma.purchaseRequest.findFirst({
        where: { componentId: componentOneId },
      });
      expect(purchaseRequest).toBeNull();
    });

    it("Task 5.19: aggregates into an already-open purchase request instead of duplicating", async () => {
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 5, spareQty: 0, reorderPoint: 3 },
      });

      await prisma.requisition.update({
        where: { id: requisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${requisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(issueRes.status).toBe(200);

      // Seeded directly, bypassing the API — exactly the "another PENDING
      // request already exists for this component" scenario Task 5.10's
      // aggregatePurchaseRequests was built for.
      const existing = await prisma.purchaseRequest.create({
        data: {
          componentId: componentOneId,
          qtyNeeded: 4,
          raisedById: studentId,
          status: "PENDING",
          currentLevel: 1,
          steps: {
            create: [
              {
                level: 1,
                approverRole: "DEPT_STORE_HEAD",
                decision: "PENDING",
                dueAt: new Date(Date.now() + 1000 * 60 * 60),
              },
            ],
          },
        },
      });

      // onHand after issue: 0; after +1 good returned: 1, below reorderPoint 3.
      const res = await request(app)
        .post(`/api/requisitions/${requisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 1,
              damagedQty: 4,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(200);

      // Task 5.10's aggregation soft-cancels a duplicate rather than
      // deleting it (audit trail), so both rows still exist afterward —
      // the pre-existing (oldest) one stays PENDING and absorbs the
      // reorder trigger's shortfall (3 - 1 = 2), while the second,
      // would-be-duplicate request that checkReorderPoint tried to raise
      // is folded into it and left CANCELLED, not a separate open request.
      const pendingRequests = await prisma.purchaseRequest.findMany({
        where: { componentId: componentOneId, status: "PENDING" },
      });
      const cancelledRequests = await prisma.purchaseRequest.findMany({
        where: { componentId: componentOneId, status: "CANCELLED" },
      });

      expect(pendingRequests).toHaveLength(1);
      expect(pendingRequests[0].id).toBe(existing.id);
      expect(pendingRequests[0].qtyNeeded).toBe(4 + 2);
      expect(cancelledRequests).toHaveLength(1);
    });

    it("Task 5.19: in a multi-line return, only the line crossing its own reorder point raises a request", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [
            { componentId: componentOneId, qtyNeeded: 5 },
            { componentId: componentTwoId, qtyNeeded: 5 },
          ],
        },
        studentToken,
      );
      const multiRequisitionId = created.body.data.id;

      // componentOne ends up below its reorder point; componentTwo does not.
      await prisma.stock.create({
        data: { componentId: componentOneId, onHand: 5, spareQty: 0, reorderPoint: 3 },
      });
      await prisma.stock.create({
        data: { componentId: componentTwoId, onHand: 20, spareQty: 0, reorderPoint: 3 },
      });

      await prisma.requisition.update({
        where: { id: multiRequisitionId },
        data: { status: "READY" },
      });

      const issueRes = await request(app)
        .post(`/api/requisitions/${multiRequisitionId}/issue`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(issueRes.status).toBe(200);

      const res = await request(app)
        .post(`/api/requisitions/${multiRequisitionId}/return`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({
          items: [
            {
              componentId: componentOneId,
              goodQty: 1,
              damagedQty: 4,
              lostQty: 0,
              usedUpQty: 0,
            },
            {
              componentId: componentTwoId,
              goodQty: 3,
              damagedQty: 2,
              lostQty: 0,
              usedUpQty: 0,
            },
          ],
        });

      expect(res.status).toBe(200);

      const purchaseRequestOne = await prisma.purchaseRequest.findFirst({
        where: { componentId: componentOneId },
      });
      const purchaseRequestTwo = await prisma.purchaseRequest.findFirst({
        where: { componentId: componentTwoId },
      });

      expect(purchaseRequestOne).not.toBeNull();
      expect(purchaseRequestTwo).toBeNull();
    });
  });

  describe("Submit and resolve", () => {
    let concurrentComponentId: string;
    let tier2ComponentId: string;
    let tier3ComponentId: string;
    let tier4ComponentId: string;

    beforeAll(async () => {
      const concurrentComponent = await prisma.component.create({
        data: {
          code: "TEST-REQ-CONCURRENT",
          name: "Requisition Test Concurrent Component",
          category: "Test",
          sizeClass: "SMALL",
        },
      });
      concurrentComponentId = concurrentComponent.id;

      await prisma.departmentQuota.create({
        data: {
          departmentId: departmentAId,
          componentId: concurrentComponentId,
          qty: 6,
        },
      });

      await prisma.stock.create({
        data: { componentId: concurrentComponentId, onHand: 6, spareQty: 0 },
      });

      const tier2Component = await prisma.component.create({
        data: {
          code: "TEST-REQ-TIER2",
          name: "Requisition Test Tier 2 Component",
          category: "Test",
          sizeClass: "SMALL",
        },
      });
      tier2ComponentId = tier2Component.id;

      await prisma.stock.create({
        data: { componentId: tier2ComponentId, onHand: 10, spareQty: 5 },
      });

      await prisma.departmentQuota.create({
        data: {
          departmentId: departmentAId,
          componentId: tier2ComponentId,
          qty: 2,
        },
      });

      // Tier 3 fixture: departmentA (the borrower in every test here) and the
      // office both have zero quota for this component, but departmentB — an
      // ordinary academic department, not the office — has real stock to
      // lend, and nothing else in this test's own data competes for it.
      const tier3Component = await prisma.component.create({
        data: {
          code: "TEST-REQ-TIER3",
          name: "Requisition Test Tier 3 Component",
          category: "Test",
          sizeClass: "SMALL",
        },
      });
      tier3ComponentId = tier3Component.id;

      await prisma.stock.create({
        data: { componentId: tier3ComponentId, onHand: 8, spareQty: 0 },
      });

      await prisma.departmentQuota.create({
        data: {
          departmentId: departmentBId,
          componentId: tier3ComponentId,
          qty: 8,
        },
      });

      // Tier 4 fixture: deliberately no quota anywhere (own, office, or any
      // other department) and no stock — nothing in tiers 1-3 can cover any
      // amount of this component, so the whole qtyNeeded must fall through
      // to a purchase request.
      const tier4Component = await prisma.component.create({
        data: {
          code: "TEST-REQ-TIER4",
          name: "Requisition Test Tier 4 Component",
          category: "Test",
          sizeClass: "SMALL",
        },
      });
      tier4ComponentId = tier4Component.id;
    });

    beforeEach(clearRequisitions);

    it("cancels an unissued request and releases holds and pending follow-ups", async () => {
      const draft = await create({
        type: "PERSONAL",
        ...OWN_WINDOW,
        lines: [
          { componentId: tier2ComponentId, qtyNeeded: 5 },
          { componentId: tier3ComponentId, qtyNeeded: 3 },
          { componentId: tier4ComponentId, qtyNeeded: 2 },
        ],
      }, studentToken);
      const id = draft.body.data.id;
      const submitted = await request(app)
        .post("/api/requisitions/" + id + "/submit")
        .set("Authorization", "Bearer " + studentToken);
      expect(submitted.status).toBe(200);

      const stranger = await request(app)
        .post("/api/requisitions/" + id + "/cancel")
        .set("Authorization", "Bearer " + student2Token);
      expect(stranger.status).toBe(403);

      const cancelled = await request(app)
        .post("/api/requisitions/" + id + "/cancel")
        .set("Authorization", "Bearer " + studentToken);
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.status).toBe("CANCELLED");
      expect(await prisma.allocation.count({
        where: { requisitionLine: { requisitionId: id }, status: "HELD" },
      })).toBe(0);
      expect(await prisma.borrowRequest.count({
        where: { requisitionId: id, status: "CANCELLED" },
      })).toBe(0);
      expect(await prisma.purchaseRequest.count({
        where: { requisitionId: id, status: "CANCELLED" },
      })).toBe(0);

      const repeated = await request(app)
        .post("/api/requisitions/" + id + "/cancel")
        .set("Authorization", "Bearer " + studentToken);
      expect(repeated.status).toBe(409);
    });

    it("resolves, issues, and returns physical substitute units at the approved ratio", async () => {
      const original = await prisma.component.create({
        data: { code: "TEST-REQ-SUB-ORIG", name: "Original", category: "Test" },
      });
      const alternative = await prisma.component.create({
        data: { code: "TEST-REQ-SUB-ALT", name: "Alternative", category: "Test" },
      });
      await prisma.stock.create({
        data: { componentId: original.id, onHand: 0, spareQty: 0 },
      });
      await prisma.stock.create({
        data: { componentId: alternative.id, onHand: 10, spareQty: 0 },
      });
      await prisma.departmentQuota.create({
        data: { departmentId: departmentAId, componentId: alternative.id, qty: 6 },
      });
      await prisma.componentSubstitute.create({
        data: { originalId: original.id, substituteId: alternative.id, ratio: 2 },
      });

      const draft = await create(
        { type: "CLASS", classSessionId: sessionA2Id, lines: [{ componentId: original.id, qtyNeeded: 3 }] },
        labAsstAToken,
      );
      const submitted = await request(app)
        .post("/api/requisitions/" + draft.body.data.id + "/submit")
        .set("Authorization", "Bearer " + labAsstAToken);
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.status).toBe("READY");

      const resolution = await request(app)
        .get("/api/requisitions/" + draft.body.data.id + "/resolution")
        .set("Authorization", "Bearer " + labAsstAToken);
      expect(resolution.body.data.lines[0].qtyFromSubstitute).toBe(3);
      expect(resolution.body.data.lines[0].substitutes[0].physicalQty).toBe(6);
      expect(resolution.body.data.lines[0].substitutes[0].ratio).toBe(2);

      const issued = await request(app)
        .post("/api/requisitions/" + draft.body.data.id + "/issue")
        .set("Authorization", "Bearer " + centralToken);
      expect(issued.status).toBe(200);
      expect(issued.body.data.lines[0].qtyIssued).toBe(0);
      expect((await prisma.stock.findUnique({ where: { componentId: alternative.id } }))?.onHand).toBe(4);

      const preview = await request(app)
        .get("/api/requisitions/" + draft.body.data.id + "/return-preview")
        .set("Authorization", "Bearer " + centralToken);
      expect(preview.body.data.lines).toEqual(
        expect.arrayContaining([expect.objectContaining({ componentId: alternative.id, qtyIssued: 6, isSubstitute: true })]),
      );

      const returned = await request(app)
        .post("/api/requisitions/" + draft.body.data.id + "/return")
        .set("Authorization", "Bearer " + centralToken)
        .send({ items: [{ componentId: alternative.id, goodQty: 5, damagedQty: 1 }] });
      expect(returned.status).toBe(200);
      expect(returned.body.data.status).toBe("RETURNED");
      expect((await prisma.stock.findUnique({ where: { componentId: alternative.id } }))?.onHand).toBe(9);
      const allocation = await prisma.allocation.findFirst({
        where: { requisitionLine: { requisitionId: draft.body.data.id }, source: "SUBSTITUTE" },
      });
      expect(allocation?.returnedGoodQty).toBe(5);
      expect(allocation?.damagedQty).toBe(1);
      const damage = await prisma.damageReport.findFirst({
        where: { requisitionId: draft.body.data.id, componentId: alternative.id },
      });
      expect(damage?.qty).toBe(1);
      expect(damage?.status).toBe("REPORTED");

      const forbidden = await request(app)
        .get("/api/damage-reports")
        .set("Authorization", "Bearer " + studentToken);
      expect(forbidden.status).toBe(403);
      const maintenance = await request(app)
        .patch("/api/damage-reports/" + damage!.id)
        .set("Authorization", "Bearer " + centralToken)
        .send({ status: "UNDER_MAINTENANCE", notes: "Bench inspection" });
      expect(maintenance.status).toBe(403);
      const labMaintenance = await request(app)
        .patch("/api/damage-reports/" + damage!.id)
        .set("Authorization", "Bearer " + labAsstAToken)
        .send({ status: "UNDER_MAINTENANCE", notes: "Bench inspection" });
      expect(labMaintenance.status).toBe(200);
      const repaired = await request(app)
        .patch("/api/damage-reports/" + damage!.id)
        .set("Authorization", "Bearer " + labAsstAToken)
        .send({ status: "REPAIRED", notes: "Replaced connector" });
      expect(repaired.status).toBe(200);
      expect((await prisma.stock.findUnique({ where: { componentId: alternative.id } }))?.onHand).toBe(10);
    });

    it("rejects unauthenticated submit requests", async () => {
      const created = await create(
        { type: "PERSONAL", ...OWN_WINDOW },
        studentToken,
      );

      const res = await request(app).post(
        `/api/requisitions/${created.body.data.id}/submit`,
      );

      expect(res.status).toBe(401);
    });

    it("forbids another user's draft on submit", async () => {
      const created = await create(
        { type: "PERSONAL", ...OWN_WINDOW },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${student2Token}`);

      expect(res.status).toBe(403);
    });

    it("refuses to submit anything past draft", async () => {
      const created = await create(
        { type: "PERSONAL", ...OWN_WINDOW },
        studentToken,
      );

      await prisma.requisition.update({
        where: { id: created.body.data.id },
        data: { status: "SUBMITTED" },
      });

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(409);
    });

    it("does not let a personal draft consume its department teaching quota", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: concurrentComponentId, qtyNeeded: 3 }],
        },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("SUBMITTED");
      expect(res.body.data.lines[0].qtyOwnQuota).toBe(0);
      expect(res.body.data.lines[0].qtyShort).toBe(3);
    });

    it("fills a personal request from the spare pool only", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: tier2ComponentId, qtyNeeded: 5 }],
        },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("READY");
      expect(res.body.data.lines[0].qtyOwnQuota).toBe(0);
      expect(res.body.data.lines[0].qtySpare).toBe(5);
      expect(res.body.data.lines[0].qtyShort).toBe(0);

      const allocations = await prisma.allocation.findMany({
        where: {
          status: "HELD",
          requisitionLine: { requisitionId: created.body.data.id },
        },
      });

      expect(allocations).toHaveLength(1);
      expect(
        allocations.some(
          (a) => a.source === "OWN_QUOTA" && a.sourceDeptId === departmentAId,
        ),
      ).toBe(false);
      expect(
        allocations.some(
          (a) => a.source === "SPARE" && a.sourceDeptId === null,
        ),
      ).toBe(true);

      const purchaseRequest = await prisma.purchaseRequest.findFirst({
        where: {
          requisitionId: created.body.data.id,
          componentId: tier2ComponentId,
        },
      });

      expect(purchaseRequest).toBeNull();
    });

    it("lands on SUBMITTED when even the spare pool falls short", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: tier2ComponentId, qtyNeeded: 50 }],
        },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("SUBMITTED");
      expect(res.body.data.lines[0].qtyShort).toBeGreaterThan(0);
    });

    it("does not borrow from another department for a personal request", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: tier3ComponentId, qtyNeeded: 5 }],
        },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("SUBMITTED");
      expect(res.body.data.lines[0].qtyOwnQuota).toBe(0);
      expect(res.body.data.lines[0].qtySpare).toBe(0);
      expect(res.body.data.lines[0].qtyBorrowed).toBe(0);
      expect(res.body.data.lines[0].qtyShort).toBe(5);

      const borrowRequest = await prisma.borrowRequest.findFirst({
        where: {
          requisitionId: created.body.data.id,
          lenderDeptId: departmentBId,
          borrowerDeptId: departmentAId,
        },
        include: { lines: true },
      });

      expect(borrowRequest).toBeNull();

      const borrowAllocation = await prisma.allocation.findFirst({
        where: {
          status: "HELD",
          source: "BORROW",
          sourceDeptId: departmentBId,
          requisitionLine: { requisitionId: created.body.data.id },
        },
      });

      expect(borrowAllocation).toBeNull();
    });

    it("leaves the full personal shortfall without a borrow", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: tier3ComponentId, qtyNeeded: 20 }],
        },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("SUBMITTED");
      expect(res.body.data.lines[0].qtyBorrowed).toBe(0);
      expect(res.body.data.lines[0].qtyShort).toBe(20);

      const resolution = await request(app)
        .get(`/api/requisitions/${created.body.data.id}/resolution`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(resolution.status).toBe(200);
      expect(resolution.body.data.lines[0].qtyFromBorrow).toBe(0);

      const borrowRequest = await prisma.borrowRequest.findFirst({
        where: {
          requisitionId: created.body.data.id,
          lenderDeptId: departmentBId,
        },
        include: { lines: true },
      });

      expect(borrowRequest).toBeNull();
    });

    it("does not auto-raise a department purchase for a personal shortfall", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: tier4ComponentId, qtyNeeded: 6 }],
        },
        studentToken,
      );

      const res = await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      // Tier 4 does not resolve the shortfall — it raises a purchase request
      // for it — so the requisition stays SUBMITTED, not READY, and qtyShort
      // still reports the full amount.
      expect(res.body.data.status).toBe("SUBMITTED");
      expect(res.body.data.lines[0].qtyOwnQuota).toBe(0);
      expect(res.body.data.lines[0].qtySpare).toBe(0);
      expect(res.body.data.lines[0].qtyBorrowed).toBe(0);
      expect(res.body.data.lines[0].qtyShort).toBe(6);

      const purchaseRequest = await prisma.purchaseRequest.findFirst({
        where: {
          requisitionId: created.body.data.id,
          componentId: tier4ComponentId,
        },
        include: { steps: true },
      });

      expect(purchaseRequest).toBeNull();
    });

    it("returns a per-line resolution breakdown", async () => {
      const created = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: concurrentComponentId, qtyNeeded: 3 }],
        },
        studentToken,
      );

      await request(app)
        .post(`/api/requisitions/${created.body.data.id}/submit`)
        .set("Authorization", `Bearer ${studentToken}`);

      const res = await request(app)
        .get(`/api/requisitions/${created.body.data.id}/resolution`)
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.lines).toHaveLength(1);

      const line = res.body.data.lines[0];
      expect(line.qtyNeeded).toBe(3);
      expect(line.qtyFromOwn).toBe(0);
      expect(line.qtyFromOffice).toBe(0);
      expect(line.qtyFromBorrow).toBe(0);
      expect(line.qtyToPurchase).toBe(0);
      expect(line.qtyShort).toBe(3);
    });

    it("prevents double-allocation when two drafts race for the last units", async () => {
      await prisma.stock.update({ where: { componentId: concurrentComponentId }, data: { spareQty: 6 } });
      const first = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: concurrentComponentId, qtyNeeded: 6 }],
        },
        studentToken,
      );

      const second = await create(
        {
          type: "PERSONAL",
          ...OWN_WINDOW,
          lines: [{ componentId: concurrentComponentId, qtyNeeded: 6 }],
        },
        student2Token,
      );

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/requisitions/${first.body.data.id}/submit`)
          .set("Authorization", `Bearer ${studentToken}`),
        request(app)
          .post(`/api/requisitions/${second.body.data.id}/submit`)
          .set("Authorization", `Bearer ${student2Token}`),
      ]);

      for (const res of [res1, res2]) {
        // Every response is a clean win, a clean short-allocation, or a
        // serialization conflict — never an unhandled crash.
        expect([200, 409]).toContain(res.status);
      }

      const fullyReady = [res1, res2].filter(
        (res) => res.status === 200 && res.body.data.status === "READY",
      );

      // Never both — that would mean 12 units were allocated from a 6-unit
      // pool. This is the actual guarantee task 4.7 exists to provide.
      expect(fullyReady.length).toBe(1);

      const totalHeld = await prisma.allocation.aggregate({
        where: {
          status: "HELD",
          requisitionLine: { componentId: concurrentComponentId },
        },
        _sum: { qty: true },
      });

      expect(totalHeld._sum.qty ?? 0).toBeLessThanOrEqual(6);
    });
  });
});
