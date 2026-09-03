import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";
import { AllocationStatus } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AvailabilityService } from "../services/availability.service";
import authRouter from "./auth.routes";
import availabilityRouter from "./availability.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", availabilityRouter);

const testDepartmentCodes = ["TEST-AVL-A", "TEST-AVL-B"];
const testComponentCodes = ["TEST-AVL-MAIN", "TEST-AVL-SCARCE"];
const testEmails = [
  "avl-student@test.com",
  "avl-central@test.com",
  "avl-orphan@test.com",
];

// A fixed future date keeps these windows clear of any seeded session.
const DAY = "2027-05-04";

function at(time: string): Date {
  return new Date(`${DAY}T${time}:00.000Z`);
}

// The window every test asks about.
const WINDOW = { from: at("10:00"), to: at("13:00") };

let departmentAId: string;
let departmentBId: string;
let mainComponentId: string;
let scarceComponentId: string;
let requesterId: string;

async function clearClaims() {
  await prisma.allocation.deleteMany({
    where: {
      requisitionLine: {
        component: { code: { in: testComponentCodes } },
      },
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
  await clearClaims();
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

/**
 * An Allocation has no window of its own — it inherits one from its
 * requisition. So a claim needs the whole chain: Requisition -> Line ->
 * Allocation. Returns the requisition id so tests can exclude it.
 */
async function makeClaim(opts: {
  componentId: string;
  sourceDeptId: string | null;
  qty: number;
  from: Date;
  to: Date;
  status?: AllocationStatus;
}): Promise<string> {
  const requisition = await prisma.requisition.create({
    data: {
      type: "CLASS",
      requestedById: requesterId,
      departmentId: departmentAId,
      neededFrom: opts.from,
      neededTo: opts.to,
      status: "SUBMITTED",
    },
  });

  const line = await prisma.requisitionLine.create({
    data: {
      requisitionId: requisition.id,
      componentId: opts.componentId,
      qtyNeeded: opts.qty,
    },
  });

  await prisma.allocation.create({
    data: {
      requisitionLineId: line.id,
      sourceDeptId: opts.sourceDeptId,
      qty: opts.qty,
      source: opts.sourceDeptId ? "OWN_QUOTA" : "SPARE",
      status: opts.status ?? "HELD",
    },
  });

  return requisition.id;
}

describe("Availability API Integration Tests", () => {
  let studentToken: string;
  let centralToken: string;
  let orphanToken: string;

  beforeAll(async () => {
    await cleanupTestData();

    const departmentA = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Availability Test Dept A" },
    });
    departmentAId = departmentA.id;

    const departmentB = await prisma.department.create({
      data: { code: testDepartmentCodes[1], name: "Availability Test Dept B" },
    });
    departmentBId = departmentB.id;

    // Plentiful: 40 on hand against a quota of 20, so quota binds.
    const mainComponent = await prisma.component.create({
      data: {
        code: testComponentCodes[0],
        name: "Availability Test Main",
        category: "Test",
        sizeClass: "EXPENSIVE",
      },
    });
    mainComponentId = mainComponent.id;

    // Scarce: 5 on hand against a quota of 20, so stock binds.
    const scarceComponent = await prisma.component.create({
      data: {
        code: testComponentCodes[1],
        name: "Availability Test Scarce",
        category: "Test",
        sizeClass: "EXPENSIVE",
      },
    });
    scarceComponentId = scarceComponent.id;

    await prisma.stock.create({
      data: { componentId: mainComponent.id, onHand: 40, spareQty: 0 },
    });
    await prisma.stock.create({
      data: { componentId: scarceComponent.id, onHand: 5, spareQty: 0 },
    });

    await prisma.departmentQuota.create({
      data: {
        departmentId: departmentA.id,
        componentId: mainComponent.id,
        qty: 20,
      },
    });
    await prisma.departmentQuota.create({
      data: {
        departmentId: departmentB.id,
        componentId: mainComponent.id,
        qty: 12,
      },
    });
    await prisma.departmentQuota.create({
      data: {
        departmentId: departmentA.id,
        componentId: scarceComponent.id,
        qty: 20,
      },
    });

    const hashedPassword = await bcryptjs.hash("test123", 10);

    const student = await prisma.user.create({
      data: {
        email: "avl-student@test.com",
        passwordHash: hashedPassword,
        fullName: "Availability Test Student",
        role: "STUDENT",
        departmentId: departmentA.id,
      },
    });
    requesterId = student.id;

    // Unscoped role deliberately without a department, to exercise both the
    // "may name any department" and "must name one" branches.
    await prisma.user.create({
      data: {
        email: "avl-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Availability Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId: null,
      },
    });

    // Scoped role with no department: the genuinely broken state.
    await prisma.user.create({
      data: {
        email: "avl-orphan@test.com",
        passwordHash: hashedPassword,
        fullName: "Availability Test Orphan",
        role: "LAB_ASSISTANT",
        departmentId: null,
      },
    });

    const studentLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "avl-student@test.com", password: "test123" });
    expect(studentLogin.status).toBe(200);
    studentToken = studentLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "avl-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralToken = centralLogin.body.token;

    const orphanLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "avl-orphan@test.com", password: "test123" });
    expect(orphanLogin.status).toBe(200);
    orphanToken = orphanLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("availableToDept computation", () => {
    beforeEach(clearClaims);

    it("returns the smaller of quota and stock when nothing is claimed", async () => {
      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(result.quota).toBe(20);
      expect(result.onHand).toBe(40);
      expect(result.available).toBe(20);
      expect(result.bindingConstraint).toBe("QUOTA");
    });

    it("is limited by physical stock when stock is lower than the quota", async () => {
      const result = await AvailabilityService.breakdown(
        departmentAId,
        scarceComponentId,
        WINDOW,
      );

      // Quota says 20, but only 5 exist.
      expect(result.quota).toBe(20);
      expect(result.onHand).toBe(5);
      expect(result.available).toBe(5);
      expect(result.bindingConstraint).toBe("PHYSICAL");
    });

    it("subtracts the department's own overlapping claims", async () => {
      await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentAId,
        qty: 8,
        from: WINDOW.from,
        to: WINDOW.to,
      });

      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(result.ownClaims).toBe(8);
      expect(result.quotaFree).toBe(12);
      expect(result.available).toBe(12);
    });

    it("counts another department's claims against physical stock only", async () => {
      // B holds 25 of the 40 that exist. A's own quota is untouched at 20,
      // but only 15 units physically remain.
      await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentBId,
        qty: 25,
        from: WINDOW.from,
        to: WINDOW.to,
      });

      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(result.ownClaims).toBe(0);
      expect(result.quotaFree).toBe(20);
      expect(result.allClaims).toBe(25);
      expect(result.physicalFree).toBe(15);
      expect(result.available).toBe(15);
      expect(result.bindingConstraint).toBe("PHYSICAL");
    });

    it("ignores ISSUED allocations, which have already left stock", async () => {
      await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentAId,
        qty: 8,
        from: WINDOW.from,
        to: WINDOW.to,
        status: "ISSUED",
      });

      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      // Counting it as well as the fall in onHand would subtract twice.
      expect(result.ownClaims).toBe(0);
      expect(result.available).toBe(20);
    });

    it("ignores claims in a window that does not overlap", async () => {
      await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentAId,
        qty: 8,
        from: at("06:00"),
        to: at("09:00"),
      });

      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(result.ownClaims).toBe(0);
      expect(result.available).toBe(20);
    });

    it("does not treat a back-to-back claim as overlapping", async () => {
      // Ends at exactly 10:00, when the queried window begins.
      await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentAId,
        qty: 8,
        from: at("07:00"),
        to: at("10:00"),
      });

      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(result.ownClaims).toBe(0);
      expect(result.available).toBe(20);
    });

    it("never returns a negative number", async () => {
      // 30 claimed against a quota of 20 — over-allocated.
      await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentAId,
        qty: 30,
        from: WINDOW.from,
        to: WINDOW.to,
      });

      const result = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(result.quotaFree).toBe(-10);
      expect(result.available).toBe(0);
    });

    it("treats a department with no quota row as having no entitlement", async () => {
      // Department B has no quota for the scarce component.
      const result = await AvailabilityService.breakdown(
        departmentBId,
        scarceComponentId,
        WINDOW,
      );

      expect(result.quota).toBe(0);
      expect(result.available).toBe(0);
    });

    it("excludes a requisition's own claims when re-resolving it", async () => {
      const requisitionId = await makeClaim({
        componentId: mainComponentId,
        sourceDeptId: departmentAId,
        qty: 8,
        from: WINDOW.from,
        to: WINDOW.to,
      });

      const without = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
      );
      expect(without.available).toBe(12);

      const ignoring = await AvailabilityService.breakdown(
        departmentAId,
        mainComponentId,
        WINDOW,
        requisitionId,
      );

      // Re-resolving must not make a requisition compete with itself.
      expect(ignoring.ownClaims).toBe(0);
      expect(ignoring.available).toBe(20);
    });

    it("exposes the same number through availableToDept()", async () => {
      const value = await AvailabilityService.availableToDept(
        departmentAId,
        mainComponentId,
        WINDOW,
      );

      expect(value).toBe(20);
    });
  });

  describe("GET /api/availability", () => {
    beforeEach(clearClaims);

    function query(params: Record<string, string>) {
      const search = new URLSearchParams(params).toString();
      return request(app).get(`/api/availability?${search}`);
    }

    it("rejects unauthenticated requests", async () => {
      const res = await query({
        componentId: mainComponentId,
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      });

      expect(res.status).toBe(401);
    });

    it("lets a student check availability for their own department", async () => {
      const res = await query({
        componentId: mainComponentId,
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      }).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.departmentId).toBe(departmentAId);
      expect(res.body.data.available).toBe(20);
    });

    it("ignores a department a scoped user is not part of", async () => {
      const res = await query({
        componentId: mainComponentId,
        departmentId: departmentBId,
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      }).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      // Asked about B, answered about A.
      expect(res.body.data.departmentId).toBe(departmentAId);
    });

    it("lets an unscoped role name any department", async () => {
      const res = await query({
        componentId: mainComponentId,
        departmentId: departmentBId,
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      }).set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.departmentId).toBe(departmentBId);
      expect(res.body.data.quota).toBe(12);
    });

    it("asks an unscoped role without a department to name one", async () => {
      const res = await query({
        componentId: mainComponentId,
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      }).set("Authorization", `Bearer ${centralToken}`);

      expect(res.status).toBe(400);
    });

    it("refuses a scoped account with no department", async () => {
      const res = await query({
        componentId: mainComponentId,
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      }).set("Authorization", `Bearer ${orphanToken}`);

      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown component rather than zero", async () => {
      const res = await query({
        componentId: "nonexistent",
        from: WINDOW.from.toISOString(),
        to: WINDOW.to.toISOString(),
      }).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(404);
    });

    it("rejects a window whose start is not before its end", async () => {
      const res = await query({
        componentId: mainComponentId,
        from: WINDOW.to.toISOString(),
        to: WINDOW.from.toISOString(),
      }).set("Authorization", `Bearer ${studentToken}`);

      expect(res.status).toBe(400);
    });

    it("requires a window", async () => {
      const res = await query({ componentId: mainComponentId }).set(
        "Authorization",
        `Bearer ${studentToken}`,
      );

      expect(res.status).toBe(400);
    });
  });
});
