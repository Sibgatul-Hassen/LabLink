import bcryptjs from "bcryptjs";
import cors from "cors";
import express from "express";
import request from "supertest";

import { prisma } from "../lib/prisma";
import authRouter from "./auth.routes";
import notificationRouter from "./notification.routes";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", authRouter);
app.use("/api", notificationRouter);

const testEmails = ["notif-user-a@test.com", "notif-user-b@test.com"];

async function cleanupTestData() {
  await prisma.notification.deleteMany({
    where: { user: { email: { in: testEmails } } },
  });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
}

describe("Notification API Integration Tests", () => {
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  let userAOwnNotificationId: string;
  let userBNotificationId: string;

  beforeAll(async () => {
    await cleanupTestData();

    const hashedPassword = await bcryptjs.hash("test123", 10);

    const userA = await prisma.user.create({
      data: {
        email: "notif-user-a@test.com",
        passwordHash: hashedPassword,
        fullName: "Notification Test User A",
        role: "STUDENT",
        departmentId: null,
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        email: "notif-user-b@test.com",
        passwordHash: hashedPassword,
        fullName: "Notification Test User B",
        role: "STUDENT",
        departmentId: null,
      },
    });
    userBId = userB.id;

    const notificationA1 = await prisma.notification.create({
      data: {
        userId: userAId,
        title: "First notification",
        body: "Something happened",
        refType: "TEST",
        refId: "ref-1",
      },
    });
    userAOwnNotificationId = notificationA1.id;

    await prisma.notification.create({
      data: {
        userId: userAId,
        title: "Second notification",
        body: "Something else happened",
      },
    });

    const notificationB = await prisma.notification.create({
      data: {
        userId: userBId,
        title: "User B's notification",
        body: "Not user A's business",
      },
    });
    userBNotificationId = notificationB.id;

    async function login(email: string): Promise<string> {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "test123" });
      expect(res.status).toBe(200);
      return res.body.token;
    }

    userAToken = await login("notif-user-a@test.com");
    userBToken = await login("notif-user-b@test.com");
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe("GET /api/notifications", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await request(app).get("/api/notifications");
      expect(res.status).toBe(401);
    });

    it("returns only the requesting user's own notifications", async () => {
      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((n: { id: string }) => n.id);
      expect(ids).toContain(userAOwnNotificationId);
      expect(ids).not.toContain(userBNotificationId);
      expect(res.body.data).toHaveLength(2);
    });

    it("shows a different user only their own, disjoint set", async () => {
      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", `Bearer ${userBToken}`);

      expect(res.status).toBe(200);

      const ids = res.body.data.map((n: { id: string }) => n.id);
      expect(ids).toContain(userBNotificationId);
      expect(ids).not.toContain(userAOwnNotificationId);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe("PATCH /api/notifications/:id/read", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await request(app).patch(
        `/api/notifications/${userAOwnNotificationId}/read`,
      );

      expect(res.status).toBe(401);
    });

    it("marks the caller's own notification as read", async () => {
      const before = await prisma.notification.findUnique({
        where: { id: userAOwnNotificationId },
      });
      expect(before?.isRead).toBe(false);

      const res = await request(app)
        .patch(`/api/notifications/${userAOwnNotificationId}/read`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);

      const after = await prisma.notification.findUnique({
        where: { id: userAOwnNotificationId },
      });
      expect(after?.isRead).toBe(true);
    });

    it("rejects marking another user's notification as read", async () => {
      const res = await request(app)
        .patch(`/api/notifications/${userBNotificationId}/read`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(404);

      const unchanged = await prisma.notification.findUnique({
        where: { id: userBNotificationId },
      });
      expect(unchanged?.isRead).toBe(false);
    });

    it("returns 404 for a nonexistent notification", async () => {
      const res = await request(app)
        .patch("/api/notifications/nonexistent/read")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(404);
    });
  });
});
