import bcryptjs from "bcryptjs";
import express from "express";
import request from "supertest";
import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import penaltyRouter from "./penalty.routes";
import requisitionRouter from "./requisition.routes";

const app = express();
app.use(express.json());
app.use("/api", authRouter, penaltyRouter, requisitionRouter);

const studentEmail = "penalty-gate-student@test.com";
const adminEmail = "penalty-gate-admin@test.com";
const departmentCode = "TEST-PENALTY-GATE";
const window = {
  neededFrom: "2027-09-10T09:00:00.000Z",
  neededTo: "2027-09-10T11:00:00.000Z",
};

describe("personal requisition penalty threshold API", () => {
  let studentId: string;
  let studentToken: string;
  let adminToken: string;
  let priorRates: Awaited<ReturnType<typeof prisma.penaltyRate.findMany>>;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { email: { in: [studentEmail, adminEmail] } }, select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.penalty.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.requisition.deleteMany({ where: { requestedById: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.department.deleteMany({ where: { code: departmentCode } });
  }

  beforeAll(async () => {
    priorRates = await prisma.penaltyRate.findMany();
    await cleanup();
    const department = await prisma.department.create({
      data: { code: departmentCode, name: "Penalty Gate Test" },
    });
    const passwordHash = await bcryptjs.hash("Password123!", 10);
    const student = await prisma.user.create({ data: {
      email: studentEmail, fullName: "Penalty Student", passwordHash,
      role: "STUDENT", departmentId: department.id,
    } });
    studentId = student.id;
    await prisma.user.create({ data: {
      email: adminEmail, fullName: "Penalty Admin", passwordHash,
      role: "SYSTEM_ADMIN",
    } });
    const studentLogin = await request(app).post("/api/auth/login")
      .send({ email: studentEmail, password: "Password123!" });
    const adminLogin = await request(app).post("/api/auth/login")
      .send({ email: adminEmail, password: "Password123!" });
    studentToken = studentLogin.body.token as string;
    adminToken = adminLogin.body.token as string;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.penaltyRate.deleteMany();
    for (const rate of priorRates) await prisma.penaltyRate.create({ data: rate });
    await prisma.$disconnect();
  });

  it("blocks at the combined total and unblocks after a threshold change or payment", async () => {
    const createBody = { type: "PERSONAL", ...window };
    const firstDraft = await request(app).post("/api/requisitions")
      .set("Authorization", `Bearer ${studentToken}`).send(createBody);
    expect(firstDraft.status).toBe(201);

    const lateRate = await request(app).put("/api/penalty-rates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "LATE", ratePerDay: 10, blockThreshold: 50 });
    expect(lateRate.status).toBe(200);
    const damagedRate = await request(app).put("/api/penalty-rates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "DAMAGED", costFraction: 0.5, blockThreshold: 50 });
    expect(damagedRate.status).toBe(200);

    const late = await prisma.penalty.create({
      data: { userId: studentId, type: "LATE", amount: "30.00" },
    });
    await prisma.penalty.create({
      data: { userId: studentId, type: "DAMAGED", amount: "20.00" },
    });
    const blocked = await request(app).get("/api/penalties/block-status")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(blocked.status).toBe(200);
    expect(blocked.body).toEqual({
      blocked: true, outstandingTotal: "50.00", threshold: "50.00",
    });
    const deniedCreate = await request(app).post("/api/requisitions")
      .set("Authorization", `Bearer ${studentToken}`).send(createBody);
    expect(deniedCreate.status).toBe(403);
    const deniedSubmit = await request(app).post(`/api/requisitions/${firstDraft.body.data.id}/submit`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(deniedSubmit.status).toBe(403);

    const raised = await request(app).put("/api/penalty-rates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "LATE", ratePerDay: 10, blockThreshold: 60 });
    expect(raised.status).toBe(200);
    const rates = await prisma.penaltyRate.findMany();
    expect(rates.every((rate) => rate.blockThreshold.toFixed(2) === "60.00")).toBe(true);
    const belowThreshold = await request(app).get("/api/penalties/block-status")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(belowThreshold.body.blocked).toBe(false);

    await request(app).put("/api/penalty-rates")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ type: "LATE", ratePerDay: 10, blockThreshold: 50 });
    const paid = await request(app).post(`/api/penalties/${late.id}/pay`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ receiptRef: "TEST-RECEIPT" });
    expect(paid.status).toBe(200);
    const unblocked = await request(app).get("/api/penalties/block-status")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(unblocked.body).toEqual({
      blocked: false, outstandingTotal: "20.00", threshold: "50.00",
    });
    const allowed = await request(app).post("/api/requisitions")
      .set("Authorization", `Bearer ${studentToken}`).send(createBody);
    expect(allowed.status).toBe(201);
  });
});
