import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import borrowRouter from "./borrow.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", borrowRouter);

const testDepartmentCodes = [
  "TEST-BOR-BORROWER",
  "TEST-BOR-LENDER",
  "TEST-BOR-OTHER",
  "TEST-BOR-ZERO",
];
const testComponentCodes = ["TEST-BOR-COMP"];
const testEmails = [
  "bor-deptstorehead@test.com",
  "bor-student@test.com",
  "bor-lender-head@test.com",
  "bor-other-head@test.com",
];

async function cleanupTestData() {
  await prisma.borrowRequest.deleteMany({
    where: {
      OR: [
        { lender: { code: { in: testDepartmentCodes } } },
        { borrower: { code: { in: testDepartmentCodes } } },
      ],
    },
  });
  // Task 5.5's approve/reject tests attach real Allocation/RequisitionLine
  // rows to prove the allocation gets updated/released — both must go
  // before requisition/component or those deletes hit an FK violation.
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
  await prisma.departmentQuota.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.stock.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.component.deleteMany({
    where: { code: { in: testComponentCodes } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Borrow Request API Integration Tests", () => {
  let deptBorrowerId: string;
  let deptLenderId: string;
  let deptOtherId: string;
  let componentId: string;
  let requisitionBorrowerId: string;

  // Borrower and lending-department users, plus a disallowed role and a
  // department uninvolved in either seeded loan, for the scope tests.
  let deptStoreHeadToken: string;
  let studentToken: string;
  let lenderHeadToken: string;
  let otherHeadToken: string;

  let brBorrowerLenderId: string;
  let brOtherLenderId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const deptBorrower = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Borrow Test Borrower Dept" },
    });
    deptBorrowerId = deptBorrower.id;

    const deptLender = await prisma.department.create({
      data: { code: testDepartmentCodes[1], name: "Borrow Test Lender Dept" },
    });
    deptLenderId = deptLender.id;

    const deptOther = await prisma.department.create({
      data: { code: testDepartmentCodes[2], name: "Borrow Test Other Dept" },
    });
    deptOtherId = deptOther.id;

    const component = await prisma.component.create({
      data: {
        code: testComponentCodes[0],
        name: "Borrow Test Component",
        category: "Test",
        sizeClass: "SMALL",
      },
    });
    componentId = component.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    const deptStoreHeadUser = await prisma.user.create({
      data: {
        email: "bor-deptstorehead@test.com",
        passwordHash: hashedPassword,
        fullName: "Borrow Test Dept Store Head",
        role: "DEPT_STORE_HEAD",
        departmentId: deptBorrowerId,
      },
    });

    await prisma.user.create({
      data: {
        email: "bor-student@test.com",
        passwordHash: hashedPassword,
        fullName: "Borrow Test Student",
        role: "STUDENT",
        departmentId: deptBorrowerId,
      },
    });

    await prisma.user.create({
      data: {
        email: "bor-lender-head@test.com",
        passwordHash: hashedPassword,
        fullName: "Borrow Test Lender Head",
        role: "DEPT_STORE_HEAD",
        departmentId: deptLenderId,
      },
    });

    const otherHeadUser = await prisma.user.create({
      data: {
        email: "bor-other-head@test.com",
        passwordHash: hashedPassword,
        fullName: "Borrow Test Other Head",
        role: "DEPT_STORE_HEAD",
        departmentId: deptOther.id,
      },
    });

    const requisitionBorrower = await prisma.requisition.create({
      data: {
        type: "PERSONAL",
        origin: "LAB_ASSISTANT",
        requestedById: deptStoreHeadUser.id,
        departmentId: deptBorrowerId,
        neededFrom: new Date("2027-07-01T08:00:00.000Z"),
        neededTo: new Date("2027-07-01T10:00:00.000Z"),
        status: "DRAFT",
      },
    });
    requisitionBorrowerId = requisitionBorrower.id;

    const requisitionOther = await prisma.requisition.create({
      data: {
        type: "PERSONAL",
        origin: "LAB_ASSISTANT",
        requestedById: otherHeadUser.id,
        departmentId: deptOther.id,
        neededFrom: new Date("2027-07-02T08:00:00.000Z"),
        neededTo: new Date("2027-07-02T10:00:00.000Z"),
        status: "DRAFT",
      },
    });

    // Seeded directly, bypassing the API — the LIST/GET scope tests don't
    // need to exercise create, only read what's already there.
    const brBorrowerLender = await prisma.borrowRequest.create({
      data: {
        requisitionId: requisitionBorrowerId,
        lenderDeptId: deptLenderId,
        borrowerDeptId: deptBorrowerId,
        returnBy: new Date("2027-07-05T00:00:00.000Z"),
        status: "REQUESTED",
        lines: { create: [{ componentId, qtyRequested: 3 }] },
      },
    });
    brBorrowerLenderId = brBorrowerLender.id;

    // Same lender, but a different borrower (deptOther) — uninvolved in the
    // first loan, so it is the scope-isolation control case.
    const brOtherLender = await prisma.borrowRequest.create({
      data: {
        requisitionId: requisitionOther.id,
        lenderDeptId: deptLenderId,
        borrowerDeptId: deptOther.id,
        returnBy: new Date("2027-07-06T00:00:00.000Z"),
        status: "REQUESTED",
        lines: { create: [{ componentId, qtyRequested: 2 }] },
      },
    });
    brOtherLenderId = brOtherLender.id;

    async function login(email: string): Promise<string> {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "test123" });
      expect(res.status).toBe(200);
      return res.body.token;
    }

    deptStoreHeadToken = await login("bor-deptstorehead@test.com");
    studentToken = await login("bor-student@test.com");
    lenderHeadToken = await login("bor-lender-head@test.com");
    otherHeadToken = await login("bor-other-head@test.com");
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated list requests", async () => {
      const res = await request(app).get("/api/borrow-requests");
      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/borrow-requests", () => {
    it("succeeds for an allowed role and returns 201 with lines", async () => {
      const res = await request(app)
        .post("/api/borrow-requests")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({
          requisitionId: requisitionBorrowerId,
          lenderDeptId: deptLenderId,
          returnBy: "2027-07-10T00:00:00.000Z",
          remarks: "Integration test borrow",
          lines: [{ componentId, qtyRequested: 5 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("REQUESTED");
      expect(res.body.data.borrower.id).toBe(deptBorrowerId);
      expect(res.body.data.lender.id).toBe(deptLenderId);
      expect(res.body.data.lines).toHaveLength(1);
      expect(res.body.data.lines[0].qtyRequested).toBe(5);
      expect(res.body.data.lines[0].component.id).toBe(componentId);
    });

    it("is 403 for a disallowed role", async () => {
      const res = await request(app)
        .post("/api/borrow-requests")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({
          requisitionId: requisitionBorrowerId,
          lenderDeptId: deptLenderId,
          returnBy: "2027-07-10T00:00:00.000Z",
          lines: [{ componentId, qtyRequested: 5 }],
        });

      expect(res.status).toBe(403);
    });

    it("is 400 when lenderDeptId equals the requisition's own department", async () => {
      const res = await request(app)
        .post("/api/borrow-requests")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({
          requisitionId: requisitionBorrowerId,
          lenderDeptId: deptBorrowerId,
          returnBy: "2027-07-10T00:00:00.000Z",
          lines: [{ componentId, qtyRequested: 5 }],
        });

      expect(res.status).toBe(400);
    });

    it("is 404 for a nonexistent requisitionId", async () => {
      const res = await request(app)
        .post("/api/borrow-requests")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({
          requisitionId: "nonexistent",
          lenderDeptId: deptLenderId,
          returnBy: "2027-07-10T00:00:00.000Z",
          lines: [{ componentId, qtyRequested: 5 }],
        });

      expect(res.status).toBe(404);
    });

    it("is 404 for a nonexistent lenderDeptId", async () => {
      const res = await request(app)
        .post("/api/borrow-requests")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({
          requisitionId: requisitionBorrowerId,
          lenderDeptId: "nonexistent",
          returnBy: "2027-07-10T00:00:00.000Z",
          lines: [{ componentId, qtyRequested: 5 }],
        });

      expect(res.status).toBe(404);
    });

    it("is 404 for a nonexistent componentId", async () => {
      const res = await request(app)
        .post("/api/borrow-requests")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({
          requisitionId: requisitionBorrowerId,
          lenderDeptId: deptLenderId,
          returnBy: "2027-07-10T00:00:00.000Z",
          lines: [{ componentId: "nonexistent", qtyRequested: 5 }],
        });

      expect(res.status).toBe(404);
    });
  });

  describe("LIST - GET /api/borrow-requests", () => {
    it("only returns requests where the actor's department is lender or borrower", async () => {
      const res = await request(app)
        .get("/api/borrow-requests")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((br: { id: string }) => br.id);
      expect(ids).toContain(brBorrowerLenderId);
      expect(ids).not.toContain(brOtherLenderId);
    });

    it("filters by direction=LENDING", async () => {
      const res = await request(app)
        .get("/api/borrow-requests?direction=LENDING")
        .set("Authorization", `Bearer ${lenderHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((br: { id: string }) => br.id);
      expect(ids).toContain(brBorrowerLenderId);
      expect(ids).toContain(brOtherLenderId);
    });

    it("filters by direction=BORROWING", async () => {
      const res = await request(app)
        .get("/api/borrow-requests?direction=BORROWING")
        .set("Authorization", `Bearer ${lenderHeadToken}`);

      expect(res.status).toBe(200);
      // The lending department never borrows in this fixture.
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("GET - GET /api/borrow-requests/:id", () => {
    it("returns 404 for a borrow request outside the actor's scope", async () => {
      const res = await request(app)
        .get(`/api/borrow-requests/${brBorrowerLenderId}`)
        .set("Authorization", `Bearer ${otherHeadToken}`);

      expect(res.status).toBe(404);
    });

    it("returns the borrow request within scope", async () => {
      const res = await request(app)
        .get(`/api/borrow-requests/${brBorrowerLenderId}`)
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(brBorrowerLenderId);
    });
  });

  describe("FIND LENDERS - GET /api/borrow-requests/lenders", () => {
    let deptZeroId: string;

    const windowStart = "2027-08-01T08:00:00.000Z";
    const windowEnd = "2027-08-01T10:00:00.000Z";

    beforeAll(async () => {
      const deptZero = await prisma.department.create({
        data: { code: "TEST-BOR-ZERO", name: "Borrow Test Zero-Quota Dept" },
      });
      deptZeroId = deptZero.id;

      // Comfortably above the sum of every quota below, so quota — not
      // physical stock — is the binding constraint for each department,
      // keeping the expected numbers exactly equal to the quotas.
      await prisma.stock.create({
        data: { componentId, onHand: 100, spareQty: 0 },
      });

      await prisma.departmentQuota.createMany({
        data: [
          { departmentId: deptBorrowerId, componentId, qty: 15 },
          { departmentId: deptLenderId, componentId, qty: 20 },
          { departmentId: deptOtherId, componentId, qty: 5 },
          // deptZeroId gets no quota row at all — zero entitlement.
        ],
      });
    });

    function lendersUrl(excludeDeptId: string): string {
      return (
        "/api/borrow-requests/lenders" +
        `?componentId=${componentId}` +
        "&qtyNeeded=10" +
        `&windowStart=${windowStart}` +
        `&windowEnd=${windowEnd}` +
        `&excludeDeptId=${excludeDeptId}`
      );
    }

    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get(lendersUrl(deptZeroId));
      expect(res.status).toBe(401);
    });

    it("is 403 for a disallowed role", async () => {
      const res = await request(app)
        .get(lendersUrl(deptZeroId))
        .set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it("returns departments ranked by available quantity, descending", async () => {
      const res = await request(app)
        .get(lendersUrl(deptZeroId))
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);

      type Lender = { departmentId: string; availableQty: number };

      const byId = new Map(
        res.body.data.map((l: Lender) => [l.departmentId, l.availableQty]),
      );

      expect(byId.get(deptLenderId)).toBe(20);
      expect(byId.get(deptBorrowerId)).toBe(15);
      expect(byId.get(deptOtherId)).toBe(5);

      const indexOf = (deptId: string) =>
        res.body.data.findIndex((l: Lender) => l.departmentId === deptId);

      expect(indexOf(deptLenderId)).toBeLessThan(indexOf(deptBorrowerId));
      expect(indexOf(deptBorrowerId)).toBeLessThan(indexOf(deptOtherId));
    });

    it("excludes the requesting department", async () => {
      const res = await request(app)
        .get(lendersUrl(deptBorrowerId))
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map(
        (l: { departmentId: string }) => l.departmentId,
      );

      expect(ids).not.toContain(deptBorrowerId);
      // Confirms the exclusion actually did something — deptBorrowerId had
      // real (15-unit) availability that a broken filter would have shown.
      expect(ids).toContain(deptLenderId);
    });

    it("excludes departments with zero availability", async () => {
      const res = await request(app)
        .get(lendersUrl(deptOtherId))
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map(
        (l: { departmentId: string }) => l.departmentId,
      );

      expect(ids).not.toContain(deptZeroId);
    });
  });

  describe("INBOX - GET /api/borrow-requests/incoming|outgoing", () => {
    it("rejects unauthenticated requests", async () => {
      const incoming = await request(app).get("/api/borrow-requests/incoming");
      expect(incoming.status).toBe(401);

      const outgoing = await request(app).get("/api/borrow-requests/outgoing");
      expect(outgoing.status).toBe(401);
    });

    it("is 403 for a disallowed role", async () => {
      const incoming = await request(app)
        .get("/api/borrow-requests/incoming")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(incoming.status).toBe(403);

      const outgoing = await request(app)
        .get("/api/borrow-requests/outgoing")
        .set("Authorization", `Bearer ${studentToken}`);
      expect(outgoing.status).toBe(403);
    });

    it("shows the lender its incoming requests, with borrower/component/lines included", async () => {
      const res = await request(app)
        .get("/api/borrow-requests/incoming")
        .set("Authorization", `Bearer ${lenderHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((br: { id: string }) => br.id);
      expect(ids).toContain(brBorrowerLenderId);
      expect(ids).toContain(brOtherLenderId);

      const match = res.body.data.find(
        (br: { id: string }) => br.id === brBorrowerLenderId,
      );
      expect(match.borrower.id).toBe(deptBorrowerId);
      expect(match.lines[0].component.id).toBe(componentId);
    });

    it("shows the borrower its outgoing requests, with lender/component/lines included", async () => {
      const res = await request(app)
        .get("/api/borrow-requests/outgoing")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((br: { id: string }) => br.id);
      expect(ids).toContain(brBorrowerLenderId);

      const match = res.body.data.find(
        (br: { id: string }) => br.id === brBorrowerLenderId,
      );
      expect(match.lender.id).toBe(deptLenderId);
      expect(match.lines[0].component.id).toBe(componentId);
    });

    it("does not show the lender its own loans in outgoing", async () => {
      const res = await request(app)
        .get("/api/borrow-requests/outgoing")
        .set("Authorization", `Bearer ${lenderHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((br: { id: string }) => br.id);
      expect(ids).not.toContain(brBorrowerLenderId);
      expect(ids).not.toContain(brOtherLenderId);
    });

    it("does not show the borrower its own request in incoming", async () => {
      const res = await request(app)
        .get("/api/borrow-requests/incoming")
        .set("Authorization", `Bearer ${deptStoreHeadToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((br: { id: string }) => br.id);
      expect(ids).not.toContain(brBorrowerLenderId);
    });
  });

  describe("APPROVE / REJECT - POST /api/borrow-requests/:id/approve|reject", () => {
    // RequisitionLine has @@unique([requisitionId, componentId]) — clear any
    // line createLinkedAllocation left on the shared (requisitionBorrowerId,
    // componentId) pair so each test starts clean. Allocation cascades.
    beforeEach(async () => {
      await prisma.requisitionLine.deleteMany({
        where: { requisitionId: requisitionBorrowerId, componentId },
      });
    });

    async function createFreshBorrowRequest(qtyRequested = 5) {
      return prisma.borrowRequest.create({
        data: {
          requisitionId: requisitionBorrowerId,
          lenderDeptId: deptLenderId,
          borrowerDeptId: deptBorrowerId,
          returnBy: new Date("2027-07-05T00:00:00.000Z"),
          status: "REQUESTED",
          lines: { create: [{ componentId, qtyRequested }] },
        },
      });
    }

    // Simulates what tier 3's resolver would have created for this borrow,
    // so approve/reject have a real Allocation to update or release.
    async function createLinkedAllocation(qty: number) {
      const requisitionLine = await prisma.requisitionLine.create({
        data: { requisitionId: requisitionBorrowerId, componentId, qtyNeeded: qty },
      });

      const allocation = await prisma.allocation.create({
        data: {
          requisitionLineId: requisitionLine.id,
          sourceDeptId: deptLenderId,
          qty,
          source: "BORROW",
          status: "HELD",
        },
      });

      return allocation.id;
    }

    it("rejects unauthenticated requests", async () => {
      const br = await createFreshBorrowRequest();

      const approve = await request(app).post(
        `/api/borrow-requests/${br.id}/approve`,
      );
      expect(approve.status).toBe(401);

      const reject = await request(app).post(
        `/api/borrow-requests/${br.id}/reject`,
      );
      expect(reject.status).toBe(401);
    });

    it("is 403 for a disallowed role", async () => {
      const br = await createFreshBorrowRequest();

      const approve = await request(app)
        .post(`/api/borrow-requests/${br.id}/approve`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ approvedQty: 5 });
      expect(approve.status).toBe(403);

      const reject = await request(app)
        .post(`/api/borrow-requests/${br.id}/reject`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ reason: "not needed" });
      expect(reject.status).toBe(403);
    });

    it("is 400 when approving or rejecting a non-REQUESTED request", async () => {
      const br = await createFreshBorrowRequest();

      await prisma.borrowRequest.update({
        where: { id: br.id },
        data: { status: "APPROVED" },
      });

      const approve = await request(app)
        .post(`/api/borrow-requests/${br.id}/approve`)
        .set("Authorization", `Bearer ${lenderHeadToken}`)
        .send({ approvedQty: 5 });
      expect(approve.status).toBe(400);

      const reject = await request(app)
        .post(`/api/borrow-requests/${br.id}/reject`)
        .set("Authorization", `Bearer ${lenderHeadToken}`)
        .send({ reason: "changed my mind" });
      expect(reject.status).toBe(400);
    });

    it("is 400 when the approved quantity exceeds the requested quantity", async () => {
      const br = await createFreshBorrowRequest(5);

      const res = await request(app)
        .post(`/api/borrow-requests/${br.id}/approve`)
        .set("Authorization", `Bearer ${lenderHeadToken}`)
        .send({ approvedQty: 6 });

      expect(res.status).toBe(400);
    });

    it("approves with a partial quantity and updates the linked allocation", async () => {
      const br = await createFreshBorrowRequest(5);
      const allocationId = await createLinkedAllocation(5);

      const res = await request(app)
        .post(`/api/borrow-requests/${br.id}/approve`)
        .set("Authorization", `Bearer ${lenderHeadToken}`)
        .send({ approvedQty: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("APPROVED");
      expect(res.body.data.lines[0].qtyApproved).toBe(3);

      const line = await prisma.borrowLine.findFirst({
        where: { borrowRequestId: br.id },
      });
      expect(line?.qtyApproved).toBe(3);

      const allocation = await prisma.allocation.findUnique({
        where: { id: allocationId },
      });
      expect(allocation?.qty).toBe(3);
      expect(allocation?.status).toBe("HELD");
    });

    it("rejects with a reason and releases the linked allocation", async () => {
      const br = await createFreshBorrowRequest(5);
      const allocationId = await createLinkedAllocation(5);

      const res = await request(app)
        .post(`/api/borrow-requests/${br.id}/reject`)
        .set("Authorization", `Bearer ${lenderHeadToken}`)
        .send({ reason: "No spare stock available after all" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("REJECTED");
      expect(res.body.data.remarks).toBe("No spare stock available after all");

      const allocation = await prisma.allocation.findUnique({
        where: { id: allocationId },
      });
      expect(allocation?.status).toBe("RELEASED");
    });

    it("stops the borrower from approving its own request", async () => {
      const br = await createFreshBorrowRequest();

      const res = await request(app)
        .post(`/api/borrow-requests/${br.id}/approve`)
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({ approvedQty: 5 });

      expect(res.status).toBe(403);
    });

    it("stops the borrower from rejecting its own request", async () => {
      const br = await createFreshBorrowRequest();

      const res = await request(app)
        .post(`/api/borrow-requests/${br.id}/reject`)
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({ reason: "I changed my mind" });

      expect(res.status).toBe(403);
    });
  });
});
