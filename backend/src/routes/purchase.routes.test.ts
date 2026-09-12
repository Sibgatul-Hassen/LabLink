import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import purchaseRouter from "./purchase.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", purchaseRouter);

const testDepartmentCodes = ["TEST-PUR-DEPT-A", "TEST-PUR-DEPT-B"];
const testComponentCode = "TEST-PUR-COMP";
const testEmails = [
  "pur-labasst@test.com",
  "pur-other-labasst@test.com",
  "pur-student@test.com",
  "pur-central@test.com",
];

async function cleanupTestData() {
  // ApprovalStep cascades on PurchaseRequest deletion — no separate delete
  // needed. PurchaseRequest.raisedById is a bare string column with no
  // declared @relation to User, so it carries no FK to worry about either.
  await prisma.purchaseRequest.deleteMany({
    where: { component: { code: testComponentCode } },
  });
  await prisma.component.deleteMany({ where: { code: testComponentCode } });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Purchase Request API Integration Tests", () => {
  let componentId: string;

  let labAsstToken: string;
  let otherLabAsstToken: string;
  let studentToken: string;
  let centralToken: string;

  beforeAll(async () => {
    await cleanupTestData();

    const deptA = await prisma.department.create({
      data: { code: testDepartmentCodes[0], name: "Purchase Test Dept A" },
    });

    const deptB = await prisma.department.create({
      data: { code: testDepartmentCodes[1], name: "Purchase Test Dept B" },
    });

    const component = await prisma.component.create({
      data: {
        code: testComponentCode,
        name: "Purchase Test Component",
        category: "Test",
        sizeClass: "SMALL",
      },
    });
    componentId = component.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "pur-labasst@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Lab Assistant",
        role: "LAB_ASSISTANT",
        departmentId: deptA.id,
      },
    });

    await prisma.user.create({
      data: {
        email: "pur-other-labasst@test.com",
        passwordHash: hashedPassword,
        fullName: "Purchase Test Other Lab Assistant",
        role: "LAB_ASSISTANT",
        departmentId: deptB.id,
      },
    });

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
        .send({ componentId, qtyRequested: 3, reason: "Own request" });
      ownPurchaseRequestId = own.body.data.id;

      const other = await request(app)
        .post("/api/purchase-requests")
        .set("Authorization", `Bearer ${otherLabAsstToken}`)
        .send({
          componentId,
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
        .send({ componentId, qtyRequested: 7, reason: "Detail test" });

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
        .send({ componentId, qtyRequested: 2, reason: "Scope test" });

      const res = await request(app)
        .get(`/api/purchase-requests/${created.body.data.id}`)
        .set("Authorization", `Bearer ${labAsstToken}`);

      expect(res.status).toBe(404);
    });
  });
});
