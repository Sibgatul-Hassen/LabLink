import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import { PurchaseService, UrgencyInput } from "../services/purchase.service";
import authRouter from "./auth.routes";
import purchaseRouter from "./purchase.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", purchaseRouter);

const testDepartmentCodes = ["TEST-PUR-DEPT-A", "TEST-PUR-DEPT-B"];

// One component per describe block that creates purchase requests, so that
// Task 5.10's auto-aggregation (every createPurchaseRequest call folds into
// any other PENDING request for the same component) can't merge requests
// meant to stay independent across blocks.
const testComponentCodes = [
  "TEST-PUR-COMP",
  "TEST-PUR-COMP-LIST",
  "TEST-PUR-COMP-LIST-OTHER",
  "TEST-PUR-COMP-GET",
  "TEST-PUR-COMP-GET-OTHER",
  "TEST-PUR-COMP-AGG",
  "TEST-PUR-COMP-AGG-MANUAL",
  "TEST-PUR-COMP-QUEUE-CRITICAL",
  "TEST-PUR-COMP-QUEUE-LOW",
  "TEST-PUR-COMP-QUEUE-OTHERROLE",
  "TEST-PUR-COMP-QUEUE-DECIDED",
  "TEST-PUR-COMP-DECIDE-WRONGRUNG",
  "TEST-PUR-COMP-DECIDE-LADDER",
  "TEST-PUR-COMP-DECIDE-REJECT",
  "TEST-PUR-COMP-DECIDE-FULL",
  "TEST-PUR-COMP-RECEIVE-WRONGSTATUS",
  "TEST-PUR-COMP-RECEIVE-HAPPY",
  "TEST-PUR-COMP-RECEIVE-PARTIAL",
  "TEST-PUR-COMP-RECEIVE-NOTIFY",
];

const testEmails = [
  "pur-labasst@test.com",
  "pur-other-labasst@test.com",
  "pur-student@test.com",
  "pur-central@test.com",
  "pur-officeadmin@test.com",
  "pur-deptstorehead@test.com",
];

async function cleanupTestData() {
  // ApprovalStep cascades on PurchaseRequest deletion — no separate delete
  // needed. PurchaseRequest.raisedById is a bare string column with no
  // declared @relation to User, so it carries no FK to worry about either.
  await prisma.purchaseRequest.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  // Task 5.15's receive tests create Stock/StockMovement rows against these
  // same test components — both FK to Component with no cascade, so they
  // must go before component.deleteMany can succeed.
  await prisma.stockMovement.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.stock.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.component.deleteMany({
    where: { code: { in: testComponentCodes } },
  });
  // Task 5.20's decide/receive notifications reference these users;
  // Notification.userId has no cascade, so it must go before user.deleteMany.
  await prisma.notification.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  // The RECEIVE describe block's notify test seeds a real Requisition
  // (requestedById has no cascade either) that must go the same way.
  await prisma.requisition.deleteMany({
    where: { department: { code: { in: testDepartmentCodes } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Purchase Request API Integration Tests", () => {
  let componentId: string;
  let listComponentId: string;
  let listOtherComponentId: string;
  let getComponentId: string;
  let getOtherComponentId: string;
  let aggComponentId: string;
  let manualAggComponentId: string;
  let queueCriticalComponentId: string;
  let queueLowComponentId: string;
  let queueOtherRoleComponentId: string;
  let queueDecidedComponentId: string;
  let decideWrongRungComponentId: string;
  let decideLadderComponentId: string;
  let decideRejectComponentId: string;
  let decideFullComponentId: string;
  let receiveWrongStatusComponentId: string;
  let receiveHappyComponentId: string;
  let receivePartialComponentId: string;
  let receiveNotifyComponentId: string;

  let labAsstUserId: string;
  let otherLabAsstUserId: string;
  let centralUserId: string;
  let deptStoreHeadUserId: string;
  let officeAdminUserId: string;

  let labAsstToken: string;
  let otherLabAsstToken: string;
  let studentToken: string;
  let centralToken: string;
  let officeAdminToken: string;
  let deptStoreHeadToken: string;

  beforeAll(async () => {
    await cleanupTestData();

    const deptA = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Purchase Test Dept A" },
    });

    const deptB = await prisma.department.create({
      data: { code: testDepartmentCodes[1], name: "Purchase Test Dept B" },
    });

    const [
      component,
      listComponent,
      listOtherComponent,
      getComponent,
      getOtherComponent,
      aggComponent,
      manualAggComponent,
      queueCriticalComponent,
      queueLowComponent,
      queueOtherRoleComponent,
      queueDecidedComponent,
      decideWrongRungComponent,
      decideLadderComponent,
      decideRejectComponent,
      decideFullComponent,
      receiveWrongStatusComponent,
      receiveHappyComponent,
      receivePartialComponent,
      receiveNotifyComponent,
    ] = await Promise.all(
      testComponentCodes.map((code, index) =>
        prisma.component.create({
          data: {
            code,
            name: `Purchase Test Component ${index}`,
            category: "Test",
            sizeClass: "SMALL",
          },
        }),
      ),
    );
    componentId = component.id;
    listComponentId = listComponent.id;
    listOtherComponentId = listOtherComponent.id;
    getComponentId = getComponent.id;
    getOtherComponentId = getOtherComponent.id;
    aggComponentId = aggComponent.id;
    manualAggComponentId = manualAggComponent.id;
    queueCriticalComponentId = queueCriticalComponent.id;
    queueLowComponentId = queueLowComponent.id;
    queueOtherRoleComponentId = queueOtherRoleComponent.id;
    queueDecidedComponentId = queueDecidedComponent.id;
    decideWrongRungComponentId = decideWrongRungComponent.id;
    decideLadderComponentId = decideLadderComponent.id;
    decideRejectComponentId = decideRejectComponent.id;
    decideFullComponentId = decideFullComponent.id;
    receiveWrongStatusComponentId = receiveWrongStatusComponent.id;
    receiveHappyComponentId = receiveHappyComponent.id;
    receivePartialComponentId = receivePartialComponent.id;
    receiveNotifyComponentId = receiveNotifyComponent.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    const labAsstUser = await prisma.user.create({
      data: {
        email: "pur-labasst@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Lab Assistant",
        role: "LAB_ASSISTANT",
        departmentId: deptA.id,
      },
    });
    labAsstUserId = labAsstUser.id;

    const otherLabAsstUser = await prisma.user.create({
      data: {
        email: "pur-other-labasst@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Other Lab Assistant",
        role: "LAB_ASSISTANT",
        departmentId: deptB.id,
      },
    });
    otherLabAsstUserId = otherLabAsstUser.id;

    await prisma.user.create({
      data: {
        email: "pur-student@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Student",
        role: "STUDENT",
        departmentId: deptA.id,
      },
    });

    const centralUser = await prisma.user.create({
      data: {
        email: "pur-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: null,
      },
    });
    centralUserId = centralUser.id;

    const deptStoreHeadUser = await prisma.user.create({
      data: {
        email: "pur-deptstorehead@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Dept Store Head",
        role: "DEPT_STORE_HEAD",
        departmentId: deptA.id,
      },
    });
    deptStoreHeadUserId = deptStoreHeadUser.id;

    const officeAdminUser = await prisma.user.create({
      data: {
        email: "pur-officeadmin@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Office Admin",
        role: "OFFICE_ADMIN",
        departmentId: null,
      },
    });
    officeAdminUserId = officeAdminUser.id;

    async function login(email: string): Promise<string> {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "test123" });
      expect(res.status).toBe(200);
      return res.body.token;
    }

    labAsstToken = await login("pur-labasst@test.com");
    otherLabAsstToken = await login("pur-other-labasst@test.com");
    studentToken = await login("pur-student@test.com");
    centralToken = await login("pur-central@test.com");
    officeAdminToken = await login("pur-officeadmin@test.com");
    deptStoreHeadToken = await login("pur-deptstorehead@test.com");
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated list requests", async () => {
      const res = await request(app).get("/api/purchase-requests");
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated create requests", async () => {
      const res = await request(app)
        .post("/api/purchase-requests")
        .send({ componentId, qtyRequested: 5, reason: "test" });

      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/purchase-requests", () => {
    it("is 403 for a disallowed role", async () => {
      const res = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ componentId, qtyRequested: 5, reason: "Need more stock" });

      expect(res.status).toBe(403);
    });

    it("creates a purchase request with a first ApprovalStep at level 1", async () => {
      const res = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId,
          qtyRequested: 10,
          reason: "Running low on stock",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("PENDING");
      expect(res.body.data.currentLevel).toBe(1);
      expect(res.body.data.qtyNeeded).toBe(10);
      expect(res.body.data.component.id).toBe(componentId);
      expect(res.body.data.steps).toHaveLength(1);
      expect(res.body.data.steps[0].level).toBe(1);
      expect(res.body.data.steps[0].decision).toBe("PENDING");
      expect(res.body.data.steps[0].approverRole).toBe(
        "CENTRAL_STORE_OFFICER",
      );
      expect(res.body.data.steps[0].remarks).toBe("Running low on stock");
    });

    it("is 404 for a nonexistent component", async () => {
      const res = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: "nonexistent",
          qtyRequested: 5,
          reason: "Bad component id",
        });

      expect(res.status).toBe(404);
    });
  });

  describe("LIST - GET /api/purchase-requests", () => {
    let ownPurchaseRequestId: string;
    let otherPurchaseRequestId: string;

    beforeAll(async () => {
      const own = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: listComponentId,
          qtyRequested: 3,
          reason: "Own request",
        });
      ownPurchaseRequestId = own.body.data.id;

      const other = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${otherLabAsstToken}`)
        .send({
          componentId: listOtherComponentId,
          qtyRequested: 4,
          reason: "Other dept's request",
        });
      otherPurchaseRequestId = other.body.data.id;
    });

    it("shows a scoped role only what it raised", async () => {
      const res = await request(app)
        .get("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((pr: { id: string }) => pr.id);
      expect(ids).toContain(ownPurchaseRequestId);
      expect(ids).not.toContain(otherPurchaseRequestId);
    });

    it("shows an unscoped role every purchase request", async () => {
      const res = await request(app)
        .get("/api/purchase-requests")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((pr: { id: string }) => pr.id);
      expect(ids).toContain(ownPurchaseRequestId);
      expect(ids).toContain(otherPurchaseRequestId);
    });
  });

  describe("GET - GET /api/purchase-requests/:id", () => {
    it("returns the detail with its approval steps", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: getComponentId,
          qtyRequested: 7,
          reason: "Detail test",
        });

      const res = await request(app)
        .get(`/api/purchase-requests/${created.body.data.id}`)
        .set("Authorization", `Bearer ${labAsstToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.body.data.id);
      expect(res.body.data.steps).toHaveLength(1);
      expect(res.body.data.steps[0].approverRole).toBe(
        "CENTRAL_STORE_OFFICER",
      );
    });

    it("returns 404 for a purchase request outside the actor's scope", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${otherLabAsstToken}`)
        .send({
          componentId: getOtherComponentId,
          qtyRequested: 2,
          reason: "Scope test",
        });

      const res = await request(app)
        .get(`/api/purchase-requests/${created.body.data.id}`)
        .set("Authorization", `Bearer ${labAsstToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("AGGREGATION - Task 5.10", () => {
    it("auto-merges two dept's pending requests for the same component into one on create", async () => {
      const first = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: aggComponentId,
          qtyRequested: 5,
          reason: "Dept A short on LEDs",
        });
      expect(first.status).toBe(201);
      const firstId = first.body.data.id;

      const second = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${otherLabAsstToken}`)
        .send({
          componentId: aggComponentId,
          qtyRequested: 8,
          reason: "Dept B short on LEDs",
        });
      expect(second.status).toBe(201);

      // Auto-aggregation folds the new request into the oldest survivor, so
      // the response for the second create is the same (now-updated) row,
      // not a distinct new one.
      expect(second.body.data.id).toBe(firstId);
      expect(second.body.data.qtyNeeded).toBe(13);

      const pending = await prisma.purchaseRequest.findMany({
        where: { componentId: aggComponentId, status: "PENDING" },
      });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(firstId);
      expect(pending[0].qtyNeeded).toBe(13);

      const cancelled = await prisma.purchaseRequest.findMany({
        where: { componentId: aggComponentId, status: "CANCELLED" },
      });
      expect(cancelled).toHaveLength(1);
    });

    it("manually aggregates pending requests via POST /purchase-requests/aggregate", async () => {
      // Auto-aggregation means the API itself can never leave two PENDING
      // rows for the same component lying around, so exercising the manual
      // endpoint requires seeding duplicates directly, bypassing the API —
      // e.g. a batch import or direct DB work is the scenario this endpoint
      // is for. Explicit createdAt values make "oldest wins" deterministic.
      const older = await prisma.purchaseRequest.create({
        data: {
          componentId: manualAggComponentId,
          qtyNeeded: 3,
          raisedById: labAsstUserId,
          status: "PENDING",
          currentLevel: 1,
          createdAt: new Date(Date.now() - 60_000),
          steps: {
            create: [
              {
                level: 1,
                approverRole: "CENTRAL_STORE_OFFICER",
                decision: "PENDING",
                dueAt: new Date(Date.now() + 1000 * 60 * 60),
                remarks: "Older request",
              },
            ],
          },
        },
      });

      const newer = await prisma.purchaseRequest.create({
        data: {
          componentId: manualAggComponentId,
          qtyNeeded: 6,
          raisedById: otherLabAsstUserId,
          status: "PENDING",
          currentLevel: 1,
          steps: {
            create: [
              {
                level: 1,
                approverRole: "CENTRAL_STORE_OFFICER",
                decision: "PENDING",
                dueAt: new Date(Date.now() + 1000 * 60 * 60),
                remarks: "Newer request",
              },
            ],
          },
        },
      });

      const res = await request(app)
        .post("/api/purchase-requests/aggregate")
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ componentId: manualAggComponentId });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(older.id);
      expect(res.body.data.qtyNeeded).toBe(9);

      const cancelledNewer = await prisma.purchaseRequest.findUnique({
        where: { id: newer.id },
      });
      expect(cancelledNewer?.status).toBe("CANCELLED");
    });

    it("rejects unauthenticated aggregate requests", async () => {
      const res = await request(app)
        .post("/api/purchase-requests/aggregate")
        .send({ componentId: aggComponentId });

      expect(res.status).toBe(401);
    });

    it("is 403 for a role not allowed to aggregate", async () => {
      const res = await request(app)
        .post("/api/purchase-requests/aggregate")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({ componentId: aggComponentId });

      expect(res.status).toBe(403);
    });
  });

  describe("QUEUE - GET /api/purchase-requests/queue - Task 5.11", () => {
    let criticalId: string;
    let lowId: string;
    let otherRoleId: string;
    let decidedId: string;

    beforeAll(async () => {
      const DAY_MS = 24 * 60 * 60 * 1000;

      // Seeded directly via Prisma — the API's createPurchaseRequest always
      // names CENTRAL_STORE_OFFICER as the level-1 approver with a fixed
      // 7-day SLA, so exercising a different rung/decision/deadline
      // combination requires bypassing it, same as the manual-aggregate
      // test above.
      const critical = await prisma.purchaseRequest.create({
        data: {
          componentId: queueCriticalComponentId,
          qtyNeeded: 5,
          raisedById: labAsstUserId,
          status: "PENDING",
          currentLevel: 1,
          steps: {
            create: [
              {
                level: 1,
                approverRole: "CENTRAL_STORE_OFFICER",
                decision: "PENDING",
                dueAt: new Date(Date.now() + 1 * DAY_MS),
              },
            ],
          },
        },
      });
      criticalId = critical.id;

      const low = await prisma.purchaseRequest.create({
        data: {
          componentId: queueLowComponentId,
          qtyNeeded: 5,
          raisedById: labAsstUserId,
          status: "PENDING",
          currentLevel: 1,
          steps: {
            create: [
              {
                level: 1,
                approverRole: "CENTRAL_STORE_OFFICER",
                decision: "PENDING",
                dueAt: new Date(Date.now() + 20 * DAY_MS),
              },
            ],
          },
        },
      });
      lowId = low.id;

      const otherRole = await prisma.purchaseRequest.create({
        data: {
          componentId: queueOtherRoleComponentId,
          qtyNeeded: 5,
          raisedById: labAsstUserId,
          status: "PENDING",
          currentLevel: 1,
          steps: {
            create: [
              {
                level: 1,
                approverRole: "OFFICE_ADMIN",
                decision: "PENDING",
                dueAt: new Date(Date.now() + 1 * DAY_MS),
              },
            ],
          },
        },
      });
      otherRoleId = otherRole.id;

      const decided = await prisma.purchaseRequest.create({
        data: {
          componentId: queueDecidedComponentId,
          qtyNeeded: 5,
          raisedById: labAsstUserId,
          status: "PENDING",
          currentLevel: 1,
          steps: {
            create: [
              {
                level: 1,
                approverRole: "CENTRAL_STORE_OFFICER",
                decision: "APPROVED",
                decidedAt: new Date(),
                dueAt: new Date(Date.now() + 1 * DAY_MS),
              },
            ],
          },
        },
      });
      decidedId = decided.id;
    });

    it("returns only requests at the caller's own current rung", async () => {
      const res = await request(app)
        .get("/api/purchase-requests/queue")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((pr: { id: string }) => pr.id);
      expect(ids).toContain(criticalId);
      expect(ids).toContain(lowId);
      // Assigned to a different approverRole and already decided — neither
      // belongs in CENTRAL_STORE_OFFICER's own queue.
      expect(ids).not.toContain(otherRoleId);
      expect(ids).not.toContain(decidedId);
    });

    it("shows an oversight role every pending rung", async () => {
      const res = await request(app)
        .get("/api/purchase-requests/queue")
        .set("Authorization", `Bearer ${officeAdminToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((pr: { id: string }) => pr.id);
      expect(ids).toContain(criticalId);
      expect(ids).toContain(lowId);
      expect(ids).toContain(otherRoleId);
      // Still excluded — already decided, not "current rung" for anyone.
      expect(ids).not.toContain(decidedId);
    });

    it("sorts CRITICAL before LOW and includes computed urgency", async () => {
      const res = await request(app)
        .get("/api/purchase-requests/queue")
        .set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((pr: { id: string }) => pr.id);
      const criticalIndex = ids.indexOf(criticalId);
      const lowIndex = ids.indexOf(lowId);
      expect(criticalIndex).toBeGreaterThanOrEqual(0);
      expect(lowIndex).toBeGreaterThan(criticalIndex);

      const critical = res.body.data.find(
        (pr: { id: string }) => pr.id === criticalId,
      );
      const low = res.body.data.find(
        (pr: { id: string }) => pr.id === lowId,
      );
      expect(critical.urgency).toBe("CRITICAL");
      expect(low.urgency).toBe("LOW");
    });

    it("rejects unauthenticated queue requests", async () => {
      const res = await request(app).get("/api/purchase-requests/queue");
      expect(res.status).toBe(401);
    });

    it("is 403 for a role not allowed to view the queue", async () => {
      const res = await request(app)
        .get("/api/purchase-requests/queue")
        .set("Authorization", `Bearer ${labAsstToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe("DECIDE - POST /api/purchase-requests/:id/decide - Tasks 5.12 & 5.13", () => {
    it("rejects unauthenticated decide requests", async () => {
      const res = await request(app)
        .post("/api/purchase-requests/some-id/decide")
        .send({ action: "APPROVE" });

      expect(res.status).toBe(401);
    });

    it("is 403 for a role that can never hold any rung", async () => {
      const res = await request(app)
        .post("/api/purchase-requests/some-id/decide")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ action: "APPROVE" });

      expect(res.status).toBe(403);
    });

    it("is 403 for the right kind of role but the wrong rung", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: decideWrongRungComponentId,
          qtyRequested: 5,
          reason: "Wrong rung test",
        });
      expect(created.status).toBe(201);

      // OFFICE_ADMIN is a valid approver in general (rung 3) — just not
      // for this request's current rung, which is still 1
      // (CENTRAL_STORE_OFFICER).
      const res = await request(app)
        .post(`/api/purchase-requests/${created.body.data.id}/decide`)
        .set("Authorization", `Bearer ${officeAdminToken}`)
        .send({ action: "APPROVE" });

      expect(res.status).toBe(403);
    });

    it("walks a request up all 3 rungs, minting the next ApprovalStep at each approval, then marks it APPROVED", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: decideLadderComponentId,
          qtyRequested: 5,
          reason: "Ladder test",
        });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const rung1 = await request(app)
        .post(`/api/purchase-requests/${id}/decide`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ action: "APPROVE", remarks: "Confirmed dept is out" });

      expect(rung1.status).toBe(200);
      expect(rung1.body.data.status).toBe("PENDING");
      expect(rung1.body.data.currentLevel).toBe(2);
      expect(rung1.body.data.steps).toHaveLength(2);
      expect(rung1.body.data.steps[0].decision).toBe("APPROVED");
      expect(rung1.body.data.steps[1].level).toBe(2);
      expect(rung1.body.data.steps[1].approverRole).toBe("DEPT_STORE_HEAD");
      expect(rung1.body.data.steps[1].decision).toBe("PENDING");

      // Task 5.20: escalating to rung 2 notifies every DEPT_STORE_HEAD —
      // the new step has no assigned approverId yet, so it's role-wide.
      const rung2Notification = await prisma.notification.findFirst({
        where: { userId: deptStoreHeadUserId, refType: "PURCHASE", refId: id },
      });
      expect(rung2Notification).not.toBeNull();

      const rung2 = await request(app)
        .post(`/api/purchase-requests/${id}/decide`)
        .set("Authorization", `Bearer ${deptStoreHeadToken}`)
        .send({ action: "APPROVE", remarks: "Endorsed" });

      expect(rung2.status).toBe(200);
      expect(rung2.body.data.status).toBe("PENDING");
      expect(rung2.body.data.currentLevel).toBe(3);
      expect(rung2.body.data.steps).toHaveLength(3);
      expect(rung2.body.data.steps[1].decision).toBe("APPROVED");
      expect(rung2.body.data.steps[2].level).toBe(3);
      expect(rung2.body.data.steps[2].approverRole).toBe("OFFICE_ADMIN");
      expect(rung2.body.data.steps[2].decision).toBe("PENDING");

      // Task 5.20: escalating to rung 3 notifies every OFFICE_ADMIN.
      const rung3Notification = await prisma.notification.findFirst({
        where: { userId: officeAdminUserId, refType: "PURCHASE", refId: id },
      });
      expect(rung3Notification).not.toBeNull();

      const rung3 = await request(app)
        .post(`/api/purchase-requests/${id}/decide`)
        .set("Authorization", `Bearer ${officeAdminToken}`)
        .send({ action: "APPROVE", remarks: "Approved and buying" });

      expect(rung3.status).toBe(200);
      expect(rung3.body.data.status).toBe("APPROVED");
      expect(rung3.body.data.steps).toHaveLength(3);
      expect(rung3.body.data.steps[2].decision).toBe("APPROVED");

      // Task 5.20: fully approved notifies every CENTRAL_STORE_OFFICER —
      // the role that goes on to actually receive the goods (Task 5.15).
      const finalNotification = await prisma.notification.findFirst({
        where: {
          userId: centralUserId,
          refType: "PURCHASE",
          refId: id,
          title: "Purchase request fully approved",
        },
      });
      expect(finalNotification).not.toBeNull();
    });

    it("rejects at rung 1 and sets status REJECTED without creating a rung-2 step", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: decideRejectComponentId,
          qtyRequested: 5,
          reason: "Reject test",
        });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const res = await request(app)
        .post(`/api/purchase-requests/${id}/decide`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ action: "REJECT", remarks: "Dept actually has stock" });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("REJECTED");
      expect(res.body.data.steps).toHaveLength(1);
      expect(res.body.data.steps[0].decision).toBe("REJECTED");

      // Task 5.20: rejection notifies whoever raised the request.
      const notification = await prisma.notification.findFirst({
        where: { userId: labAsstUserId, refType: "PURCHASE", refId: id },
      });
      expect(notification).not.toBeNull();
      expect(notification?.title).toBe("Purchase request rejected");
    });

    it("runs the full 3-rung happy path end to end", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: decideFullComponentId,
          qtyRequested: 12,
          reason: "Full ladder happy path",
        });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      for (const token of [
        centralToken,
        deptStoreHeadToken,
        officeAdminToken,
      ]) {
        const res = await request(app)
          .post(`/api/purchase-requests/${id}/decide`)
          .set("Authorization", `Bearer ${token}`)
          .send({ action: "APPROVE" });

        expect(res.status).toBe(200);
      }

      const final = await prisma.purchaseRequest.findUnique({
        where: { id },
        include: { steps: { orderBy: { level: "asc" } } },
      });

      expect(final?.status).toBe("APPROVED");
      expect(final?.currentLevel).toBe(3);
      expect(final?.steps).toHaveLength(3);
      expect(
        final?.steps.every((step) => step.decision === "APPROVED"),
      ).toBe(true);
      expect(final?.steps.map((step) => step.approverRole)).toEqual([
        "CENTRAL_STORE_OFFICER",
        "DEPT_STORE_HEAD",
        "OFFICE_ADMIN",
      ]);
    });
  });

  describe("RECEIVE - POST /api/purchase-requests/:id/receive - Task 5.15", () => {
    let officeDepartmentId: string;
    let receiveNotifyRequisitionId: string;

    beforeAll(async () => {
      // Reuse whatever office department already exists (real seed data
      // normally has one); only create a stand-in when none does, so this
      // never competes with a genuine office department for
      // receiveGoods()'s findFirst({ isOffice: true }) lookup — same
      // approach requisition.routes.test.ts already uses for the same
      // lookup elsewhere in this codebase. Not part of cleanupTestData:
      // a reused office department must outlive this suite.
      const existingOffice = await prisma.department.findFirst({
        where: { isOffice: true, isActive: true },
      });

      officeDepartmentId = existingOffice
        ? existingOffice.id
        : (
            await prisma.department.create({
              data: {
                code: "TEST-PUR-OFFICE",
                name: "Purchase Test Office",
                isOffice: true,
              },
            })
          ).id;

      // Task 5.20's "goods received" notification only has someone to
      // notify when the purchase request is linked to a requisition — a
      // manually-raised one (every other RECEIVE test here) has none.
      const deptA = await prisma.department.findFirstOrThrow({
        where: { code: testDepartmentCodes[0] },
      });

      const receiveNotifyRequisition = await prisma.requisition.create({
        data: {
          type: "PERSONAL",
          origin: "LAB_ASSISTANT",
          requestedById: labAsstUserId,
          departmentId: deptA.id,
          neededFrom: new Date("2027-09-01T08:00:00.000Z"),
          neededTo: new Date("2027-09-01T10:00:00.000Z"),
          status: "DRAFT",
        },
      });
      receiveNotifyRequisitionId = receiveNotifyRequisition.id;
    });

    async function createApprovedRequest(
      componentId: string,
      qtyRequested: number,
      requisitionId?: string,
    ): Promise<string> {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({ componentId, qtyRequested, reason: "Receive test", requisitionId });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      for (const token of [
        centralToken,
        deptStoreHeadToken,
        officeAdminToken,
      ]) {
        const res = await request(app)
          .post(`/api/purchase-requests/${id}/decide`)
          .set("Authorization", `Bearer ${token}`)
          .send({ action: "APPROVE" });
        expect(res.status).toBe(200);
      }

      return id;
    }

    it("rejects unauthenticated receive requests", async () => {
      const res = await request(app)
        .post("/api/purchase-requests/some-id/receive")
        .send({ poNumber: "PO-1", qtyReceived: 5 });

      expect(res.status).toBe(401);
    });

    it("is 403 for a role not allowed to receive goods", async () => {
      const res = await request(app)
        .post("/api/purchase-requests/some-id/receive")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({ poNumber: "PO-1", qtyReceived: 5 });

      expect(res.status).toBe(403);
    });

    it("is 400 for a purchase request that is not APPROVED", async () => {
      const created = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${labAsstToken}`)
        .send({
          componentId: receiveWrongStatusComponentId,
          qtyRequested: 5,
          reason: "Still pending",
        });
      expect(created.status).toBe(201);

      const res = await request(app)
        .post(`/api/purchase-requests/${created.body.data.id}/receive`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ poNumber: "PO-2", qtyReceived: 5 });

      expect(res.status).toBe(400);
    });

    it("increases office stock, creates a StockMovement, and marks status RECEIVED", async () => {
      const id = await createApprovedRequest(receiveHappyComponentId, 10);

      const res = await request(app)
        .post(`/api/purchase-requests/${id}/receive`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ poNumber: "PO-HAPPY-1", qtyReceived: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("RECEIVED");
      expect(res.body.data.poNumber).toBe("PO-HAPPY-1");
      expect(res.body.data.receivedQty).toBe(10);

      const stock = await prisma.stock.findUnique({
        where: { componentId: receiveHappyComponentId },
      });
      expect(stock?.onHand).toBe(10);

      const movement = await prisma.stockMovement.findFirst({
        where: { refType: "PURCHASE", refId: id },
      });
      expect(movement).not.toBeNull();
      expect(movement?.type).toBe("PURCHASE");
      expect(movement?.qty).toBe(10);
      expect(movement?.toDeptId).toBe(officeDepartmentId);
      expect(movement?.performedById).toBeTruthy();
    });

    it("allows a partial receipt (qtyReceived < qtyNeeded)", async () => {
      const id = await createApprovedRequest(receivePartialComponentId, 20);

      const res = await request(app)
        .post(`/api/purchase-requests/${id}/receive`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ poNumber: "PO-PARTIAL-1", qtyReceived: 8 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("RECEIVED");
      expect(res.body.data.qtyNeeded).toBe(20);
      expect(res.body.data.receivedQty).toBe(8);

      const stock = await prisma.stock.findUnique({
        where: { componentId: receivePartialComponentId },
      });
      expect(stock?.onHand).toBe(8);
    });

    it("Task 5.20: notifies the original requisition's requester when goods are received", async () => {
      const id = await createApprovedRequest(
        receiveNotifyComponentId,
        6,
        receiveNotifyRequisitionId,
      );

      const res = await request(app)
        .post(`/api/purchase-requests/${id}/receive`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ poNumber: "PO-NOTIFY-1", qtyReceived: 6 });

      expect(res.status).toBe(200);

      const notification = await prisma.notification.findFirst({
        where: { userId: labAsstUserId, refType: "PURCHASE", refId: id },
      });
      expect(notification).not.toBeNull();
      expect(notification?.title).toBe("Purchased goods received");
    });
  });
});

describe("PurchaseService.urgencyFor() - Task 5.11", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function buildInput(daysUntilNeeded: number): UrgencyInput {
    return {
      currentLevel: 1,
      createdAt: new Date(),
      requisition: null,
      steps: [
        {
          level: 1,
          dueAt: new Date(Date.now() + daysUntilNeeded * DAY_MS),
        },
      ],
    };
  }

  it("is CRITICAL within 3 days (including overdue)", () => {
    expect(PurchaseService.urgencyFor(buildInput(-1))).toBe("CRITICAL");
    expect(PurchaseService.urgencyFor(buildInput(2))).toBe("CRITICAL");
    expect(PurchaseService.urgencyFor(buildInput(3))).toBe("CRITICAL");
  });

  it("is HIGH between 3 and 7 days", () => {
    expect(PurchaseService.urgencyFor(buildInput(5))).toBe("HIGH");
    expect(PurchaseService.urgencyFor(buildInput(7))).toBe("HIGH");
  });

  it("is NORMAL (the brief's MEDIUM tier) between 7 and 14 days", () => {
    expect(PurchaseService.urgencyFor(buildInput(10))).toBe("NORMAL");
    expect(PurchaseService.urgencyFor(buildInput(14))).toBe("NORMAL");
  });

  it("is LOW beyond 14 days", () => {
    expect(PurchaseService.urgencyFor(buildInput(15))).toBe("LOW");
    expect(PurchaseService.urgencyFor(buildInput(30))).toBe("LOW");
  });

  it("prefers the linked requisition's neededTo over the approval step's dueAt", () => {
    const input: UrgencyInput = {
      currentLevel: 1,
      createdAt: new Date(),
      requisition: { neededTo: new Date(Date.now() + 1 * DAY_MS) },
      steps: [{ level: 1, dueAt: new Date(Date.now() + 20 * DAY_MS) }],
    };

    expect(PurchaseService.urgencyFor(input)).toBe("CRITICAL");
  });
});
