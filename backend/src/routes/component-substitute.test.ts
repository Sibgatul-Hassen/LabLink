import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import componentRouter from "./component.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", componentRouter);

const testEmails = [
  "sub-central@test.com",
  "sub-admin@test.com",
  "sub-assistant@test.com",
];

const testComponentCodes = ["TEST-SUB-A", "TEST-SUB-B", "TEST-SUB-C"];

async function cleanupTestData() {
  await prisma.componentSubstitute.deleteMany({
    where: {
      original: { code: { in: testComponentCodes } },
    },
  });
  await prisma.componentSubstitute.deleteMany({
    where: {
      substitute: { code: { in: testComponentCodes } },
    },
  });
  await prisma.stock.deleteMany({
    where: { component: { code: { in: testComponentCodes } } },
  });
  await prisma.component.deleteMany({
    where: { code: { in: testComponentCodes } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  });
  await prisma.department.deleteMany({
    where: { code: "TEST-SUB" },
  });
}

describe("Component Substitute API Integration Tests", () => {
  let centralToken: string;
  let adminToken: string;
  let assistantToken: string;
  let componentAId: string;
  let componentBId: string;
  let componentCId: string;
  let substituteRowId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const dept = await prisma.department.create({
      data: { code: "TEST-SUB", name: "Test Sub Dept", isOffice: false },
    });

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.createMany({
      data: [
        {
          email: "sub-central@test.com",
          passwordHash: hashedPassword,
          fullName: "Central Officer",
          role: "CENTRAL_STORE_OFFICER",
          departmentId: dept.id,
        },
        {
          email: "sub-admin@test.com",
          passwordHash: hashedPassword,
          fullName: "System Admin",
          role: "SYSTEM_ADMIN",
          departmentId: null,
        },
        {
          email: "sub-assistant@test.com",
          passwordHash: hashedPassword,
          fullName: "Lab Assistant",
          role: "LAB_ASSISTANT",
          departmentId: dept.id,
        },
      ],
    });

    const [centralRes, adminRes, assistantRes] = await Promise.all([
      request(app)
        .post("/api/auth/login")
        .send({ email: "sub-central@test.com", password: "test123" }),
      request(app)
        .post("/api/auth/login")
        .send({ email: "sub-admin@test.com", password: "test123" }),
      request(app)
        .post("/api/auth/login")
        .send({ email: "sub-assistant@test.com", password: "test123" }),
    ]);

    centralToken = centralRes.body.token;
    adminToken = adminRes.body.token;
    assistantToken = assistantRes.body.token;

    const [compA, compB, compC] = await Promise.all([
      prisma.component.create({
        data: {
          code: "TEST-SUB-A",
          name: "Test Sub A",
          category: "Test",
          sizeClass: "SMALL",
          unit: "pcs",
          stock: { create: { onHand: 0, spareQty: 0, reorderPoint: 0 } },
        },
      }),
      prisma.component.create({
        data: {
          code: "TEST-SUB-B",
          name: "Test Sub B",
          category: "Test",
          sizeClass: "SMALL",
          unit: "pcs",
          stock: { create: { onHand: 0, spareQty: 0, reorderPoint: 0 } },
        },
      }),
      prisma.component.create({
        data: {
          code: "TEST-SUB-C",
          name: "Test Sub C",
          category: "Test",
          sizeClass: "SMALL",
          unit: "pcs",
          stock: { create: { onHand: 0, spareQty: 0, reorderPoint: 0 } },
        },
      }),
    ]);

    componentAId = compA.id;
    componentBId = compB.id;
    componentCId = compC.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("GET /api/components/:id/substitutes", () => {
    it("should return 401 when unauthenticated", async () => {
      const res = await request(app).get(
        `/api/components/${componentAId}/substitutes`,
      );
      expect(res.status).toBe(401);
    });

    it("should return empty list initially", async () => {
      const res = await request(app)
        .get(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe("POST /api/components/:id/substitutes", () => {
    it("should return 401 when unauthenticated", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .send({ substituteId: componentBId });
      expect(res.status).toBe(401);
    });

    it("should return 403 for LAB_ASSISTANT", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${assistantToken}`)
        .send({ substituteId: componentBId });
      expect(res.status).toBe(403);
    });

    it("should return 409 when component substitutes for itself", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ substituteId: componentAId });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/cannot substitute for itself/i);
    });

    it("should return 404 for non-existent substitute component", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ substituteId: "nonexistent-id" });
      expect(res.status).toBe(404);
    });

    it("should return 400 for ratio 0", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ substituteId: componentBId, ratio: 0 });
      expect(res.status).toBe(400);
    });

    it("should return 400 for negative ratio", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ substituteId: componentBId, ratio: -1 });
      expect(res.status).toBe(400);
    });

    it("should create a substitute pair and return full list", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ substituteId: componentBId, ratio: 2, notes: "test note" });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].substitute.code).toBe("TEST-SUB-B");
      expect(res.body.data[0].ratio).toBe(2);
      expect(res.body.data[0].notes).toBe("test note");

      substituteRowId = res.body.data[0].id;
    });

    it("GET should now return the created pair", async () => {
      const res = await request(app)
        .get(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].substitute.code).toBe("TEST-SUB-B");
    });

    it("should return 409 for duplicate pair", async () => {
      const res = await request(app)
        .post(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ substituteId: componentBId });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it("pairs are one-way: A→B does not create B→A", async () => {
      const res = await request(app)
        .get(`/api/components/${componentBId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe("PATCH /api/components/:id/substitutes/:subId", () => {
    it("should update ratio and notes", async () => {
      const res = await request(app)
        .patch(`/api/components/${componentAId}/substitutes/${substituteRowId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ ratio: 3, notes: "updated note" });

      expect(res.status).toBe(200);
      expect(res.body.data[0].ratio).toBe(3);
      expect(res.body.data[0].notes).toBe("updated note");
    });

    it("should return 404 when using wrong parent id", async () => {
      const res = await request(app)
        .patch(`/api/components/${componentCId}/substitutes/${substituteRowId}`)
        .set("Authorization", `Bearer ${centralToken}`)
        .send({ ratio: 5 });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/components/:id/substitutes/:subId", () => {
    it("should return 404 when using wrong parent id", async () => {
      const res = await request(app)
        .delete(
          `/api/components/${componentCId}/substitutes/${substituteRowId}`,
        )
        .set("Authorization", `Bearer ${centralToken}`);
      expect(res.status).toBe(404);
    });

    it("should delete only that pair", async () => {
      const res = await request(app)
        .delete(
          `/api/components/${componentAId}/substitutes/${substituteRowId}`,
        )
        .set("Authorization", `Bearer ${centralToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it("GET after delete should return empty list", async () => {
      const res = await request(app)
        .get(`/api/components/${componentAId}/substitutes`)
        .set("Authorization", `Bearer ${centralToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });
});
