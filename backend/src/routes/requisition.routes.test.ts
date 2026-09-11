import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import requisitionRouter from "./requisition.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", requisitionRouter);

const testDepartmentCodes = ["TEST-REQ-A", "TEST-REQ-B"];
const testCourseCodes = ["TEST-REQ-COURSE-A", "TEST-REQ-COURSE-B"];
const testComponentCodes = [
  "TEST-REQ-COMP-1",
  "TEST-REQ-COMP-2",
  "TEST-REQ-GONE",
];
const testEmails = [
  "req-student@test.com",
  "req-student2@test.com",
  "req-labasst-a@test.com",
  "req-labasst-b@test.com",
  "req-central@test.com",
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
  await clearRequisitions();
  await prisma.stockMovement.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.stock.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
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

    await prisma.user.create({
      data: {
        email: "req-labasst-a@test.com",
        passwordHash: hashedPassword,
        fullName: "Requisition Test Lab Assistant A",
        role: "LAB_ASSISTANT",
        departmentId: departmentAId,
      },
    });

    await prisma.user.create({
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

    it("hides another student's requisition behind a 404", async () => {
      const mine = await request(app)
        .get("/api/requisitions")
        .set("Authorization", `Bearer ${student2Token}`);

      const otherId = mine.body.data[0].id;

      const res = await request(app)
        .get(`/api/requisitions/${otherId}`)
        .set("Authorization", `Bearer ${studentToken}`);

      // Not 403 — an out-of-scope record should read as absent, so ids cannot
      // be probed for existence.
      expect(res.status).toBe(404);
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

      // Out of that student's scope entirely, so it reads as absent.
      expect(res.status).toBe(404);
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
  });
});
