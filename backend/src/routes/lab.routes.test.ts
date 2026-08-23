import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import labRouter from "./lab.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", labRouter);

const testEmails = [
  "lab-admin@test.com",
  "lab-central@test.com",
  "lab-assistant@test.com",
  "lab-not-assistant@test.com",
];
const testDepartmentCodes = ["TEST-LAB-DEPT", "TEST-LAB-DEPT-2"];
const testRoomNos = ["TEST-LAB-101", "TEST-LAB-102", "TEST-LAB-DUP"];

async function cleanupTestData() {
  await prisma.lab.deleteMany({ where: { roomNo: { in: testRoomNos } } });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.department.deleteMany({
    where: { code: { in: testDepartmentCodes } },
  });
}

describe("Lab CRUD API Integration Tests", () => {
  let systemAdminToken: string;
  let centralStoreToken: string;
  let departmentId: string;
  let secondDepartmentId: string;
  let labAssistantId: string;
  let nonAssistantUserId: string;
  let labId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const department = await prisma.department.create({
      data: {
        code: "TEST-LAB-DEPT",
        name: "Lab Test Department",
        isOffice: false,
      },
    });
    departmentId = department.id;

    const secondDepartment = await prisma.department.create({
      data: {
        code: "TEST-LAB-DEPT-2",
        name: "Lab Test Department 2",
        isOffice: false,
      },
    });
    secondDepartmentId = secondDepartment.id;

    const hashedPassword = await bcryptjs.hash("test123", 10);

    await prisma.user.create({
      data: {
        email: "lab-admin@test.com",
        passwordHash: hashedPassword,
        fullName: "Lab Test Admin",
        role: "SYSTEM_ADMIN",
        departmentId: null,
      },
    });

    await prisma.user.create({
      data: {
        email: "lab-central@test.com",
        passwordHash: hashedPassword,
        fullName: "Lab Test Central Officer",
        role: "CENTRAL_STORE_OFFICER",
        departmentId,
      },
    });

    const labAssistant = await prisma.user.create({
      data: {
        email: "lab-assistant@test.com",
        passwordHash: hashedPassword,
        fullName: "Lab Test Assistant",
        role: "LAB_ASSISTANT",
        departmentId,
      },
    });
    labAssistantId = labAssistant.id;

    const nonAssistant = await prisma.user.create({
      data: {
        email: "lab-not-assistant@test.com",
        passwordHash: hashedPassword,
        fullName: "Lab Test Non Assistant",
        role: "STUDENT",
        departmentId,
      },
    });
    nonAssistantUserId = nonAssistant.id;

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "lab-admin@test.com", password: "test123" });
    expect(adminLogin.status).toBe(200);
    systemAdminToken = adminLogin.body.token;

    const centralLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "lab-central@test.com", password: "test123" });
    expect(centralLogin.status).toBe(200);
    centralStoreToken = centralLogin.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("Authentication", () => {
    it("should reject unauthenticated lab list requests", async () => {
      const res = await request(app).get("/api/labs");
      expect(res.status).toBe(401);
    });
  });

  describe("CREATE - POST /api/labs", () => {
    it("should create a lab with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .post("/api/labs")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          name: "Test Digital Systems Lab",
          roomNo: "TEST-LAB-101",
          groupSize: 4,
          departmentId,
          labAssistantId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("Test Digital Systems Lab");
      expect(res.body.data.department.id).toBe(departmentId);
      expect(res.body.data.labAssistant.id).toBe(labAssistantId);
      expect(res.body.data.isActive).toBe(true);
      labId = res.body.data.id;
    });

    it("should deny create for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .post("/api/labs")
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({
          name: "Should Not Be Created",
          roomNo: "TEST-LAB-DUP",
          groupSize: 4,
          departmentId,
        });

      expect(res.status).toBe(403);
    });

    it("should return 409 for a duplicate room number in the same department", async () => {
      const res = await request(app)
        .post("/api/labs")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          name: "Duplicate Room Lab",
          roomNo: "TEST-LAB-101",
          groupSize: 4,
          departmentId,
        });

      expect(res.status).toBe(409);
    });

    it("should allow the same room number in a different department", async () => {
      const res = await request(app)
        .post("/api/labs")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          name: "Same Room Different Department",
          roomNo: "TEST-LAB-101",
          groupSize: 4,
          departmentId: secondDepartmentId,
        });

      expect(res.status).toBe(201);
    });

    it("should return 404 for a non-existent department", async () => {
      const res = await request(app)
        .post("/api/labs")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          name: "Orphan Lab",
          roomNo: "TEST-LAB-102",
          groupSize: 4,
          departmentId: "nonexistent",
        });

      expect(res.status).toBe(404);
    });

    it("should reject a lab assistant that is not a LAB_ASSISTANT", async () => {
      const res = await request(app)
        .post("/api/labs")
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({
          name: "Bad Assistant Lab",
          roomNo: "TEST-LAB-102",
          groupSize: 4,
          departmentId,
          labAssistantId: nonAssistantUserId,
        });

      expect(res.status).toBe(400);
    });
  });

  describe("READ - GET /api/labs", () => {
    it("should allow authenticated users to list labs", async () => {
      const res = await request(app)
        .get("/api/labs")
        .set("Authorization", `Bearer ${centralStoreToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it("should filter labs by department", async () => {
      const res = await request(app)
        .get(`/api/labs?departmentId=${departmentId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (lab: { department: { id: string } }) =>
            lab.department.id === departmentId,
        ),
      ).toBe(true);
    });

    it("should get a lab by ID", async () => {
      const res = await request(app)
        .get(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(labId);
    });

    it("should return 404 for a non-existent lab", async () => {
      const res = await request(app)
        .get("/api/labs/nonexistent")
        .set("Authorization", `Bearer ${systemAdminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("UPDATE - PATCH /api/labs/:id", () => {
    it("should update a lab with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .patch(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ name: "Updated Test Lab", groupSize: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Updated Test Lab");
      expect(res.body.data.groupSize).toBe(5);
    });

    it("should deny update for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .patch(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`)
        .send({ name: "Should Not Change" });

      expect(res.status).toBe(403);
    });

    it("should clear the lab assistant when labAssistantId is set to null", async () => {
      const res = await request(app)
        .patch(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ labAssistantId: null });

      expect(res.status).toBe(200);
      expect(res.body.data.labAssistant).toBeNull();
    });
  });

  describe("DELETE - DELETE /api/labs/:id", () => {
    it("should deny delete for CENTRAL_STORE_OFFICER", async () => {
      const res = await request(app)
        .delete(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${centralStoreToken}`);
      expect(res.status).toBe(403);
    });

    it("should soft delete a lab with SYSTEM_ADMIN role", async () => {
      const res = await request(app)
        .delete(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);
      expect(res.status).toBe(204);

      const deletedLab = await prisma.lab.findUnique({ where: { id: labId } });
      expect(deletedLab).not.toBeNull();
      expect(deletedLab?.isActive).toBe(false);
    });

    it("should return 404 for the soft-deleted lab", async () => {
      const res = await request(app)
        .get(`/api/labs/${labId}`)
        .set("Authorization", `Bearer ${systemAdminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
