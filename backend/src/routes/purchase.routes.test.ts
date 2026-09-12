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
];

const testEmails = [
  "pur-labasst@test.com",
  "pur-other-labasst@test.com",
  "pur-student@test.com",
  "pur-central@test.com",
  "pur-officeadmin@test.com",
];

async function cleanupTestData() {
  // ApprovalStep cascades on PurchaseRequest deletion — no separate delete
  // needed. PurchaseRequest.raisedById is a bare string column with no
  // declared @relation to User, so it carries no FK to worry about either.
  await prisma.purchaseRequest.deleteMany({
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

  let labAsstUserId: string;
  let otherLabAsstUserId: string;

  let labAsstToken: string;
  let otherLabAsstToken: string;
  let studentToken: string;
  let centralToken: string;
  let officeAdminToken: string;

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

    await prisma.user.create({
      data: {
        email: "pur-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "pur-officeadmin@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Office Admin",
        role: "OFFICE_ADMIN",
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

    labAsstToken = await login("pur-labasst@test.com");
    otherLabAsstToken = await login("pur-other-labasst@test.com");
    studentToken = await login("pur-student@test.com");
    centralToken = await login("pur-central@test.com");
    officeAdminToken = await login("pur-officeadmin@test.com");
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
