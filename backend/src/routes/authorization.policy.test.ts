import express from "express";
import request from "supertest";
import { Role } from "@prisma/client";
import { AuthService } from "../services/auth.service";
import { prisma } from "../lib/prisma";
import stockRouter from "./stock.routes";
import quotaRouter from "./quota.routes";
import requisitionRouter from "./requisition.routes";
import borrowRouter from "./borrow.routes";
import purchaseRouter from "./purchase.routes";
import penaltyRouter from "./penalty.routes";
import suggestionRouter from "./suggestion.routes";
import courseRouter from "./course.routes";
import auditRouter from "./audit.routes";
import damageRouter from "./damage.routes";

const app = express();
app.use(express.json());
for (const router of [stockRouter, quotaRouter, requisitionRouter, borrowRouter,
  purchaseRouter, penaltyRouter, suggestionRouter, courseRouter, auditRouter, damageRouter]) app.use("/api", router);

function authenticateAs(role: Role, departmentId: string | null = "cse") {
  jest.spyOn(AuthService, "verifyToken").mockReturnValue({ sub: "account", role: "SYSTEM_ADMIN", departmentId: null });
  jest.spyOn(AuthService, "getUserById").mockResolvedValue({
    id: "account", fullName: "Test Account", email: "test@uiu.ac.bd",
    role, departmentId, departmentCode: departmentId ?? undefined,
  });
}

afterEach(() => jest.restoreAllMocks());

describe("authorization policy at API routes", () => {
  const forbiddenActions: Array<{ method: "post" | "patch" | "put"; path: string }> = [
    { method: "post", path: "/api/stocks/component/adjust" },
    { method: "post", path: "/api/stocks/transfer" },
    { method: "patch", path: "/api/quotas/cse/component" },
    { method: "post", path: "/api/requisitions/request/issue" },
    { method: "post", path: "/api/requisitions/request/return" },
    { method: "post", path: "/api/borrow-requests/request/approve" },
    { method: "post", path: "/api/purchase-requests/request/decide" },
    { method: "post", path: "/api/purchase-requests/request/receive" },
    { method: "post", path: "/api/penalties/penalty/pay" },
    { method: "post", path: "/api/penalties/penalty/waive" },
    { method: "patch", path: "/api/suggestions/suggestion/decision" },
    { method: "patch", path: "/api/damage-reports/damage" },
  ];

  test.each(forbiddenActions)("system admin cannot $method $path", async ({ method, path }) => {
    authenticateAs("SYSTEM_ADMIN", null);
    const response = await request(app)[method](path).set("Authorization", "Bearer token").send({});
    expect(response.status).toBe(403);
  });

  it("returns 401 before role evaluation without a token", async () => {
    expect((await request(app).post("/api/purchase-requests/request/decide")).status).toBe(401);
  });

  it.each([
    ["STUDENT", "post", "/api/stocks/component/adjust"],
    ["INSTRUCTOR", "patch", "/api/quotas/cse/component"],
    ["LAB_ASSISTANT", "post", "/api/borrow-requests/request/approve"],
    ["OFFICE_ADMIN", "post", "/api/requisitions/request/issue"],
    ["CENTRAL_STORE_OFFICER", "post", "/api/courses"],
    ["CENTRAL_STORE_OFFICER", "patch", "/api/damage-reports/damage"],
  ] as const)("rejects %s from %s %s", async (role, method, path) => {
    authenticateAs(role);
    expect((await request(app)[method](path).set("Authorization", "Bearer token").send({})).status).toBe(403);
  });

  it("uses the live account role rather than a stale token role", async () => {
    authenticateAs("STUDENT");
    expect((await request(app).post("/api/stocks/component/adjust")
      .set("Authorization", "Bearer token").send({})).status).toBe(403);
  });

  it("returns 401 when an account was deactivated after token issuance", async () => {
    authenticateAs("CENTRAL_STORE_OFFICER");
    jest.spyOn(AuthService, "getUserById").mockRejectedValue(new Error("User not found"));
    expect((await request(app).post("/api/stocks/component/adjust")
      .set("Authorization", "Bearer token").send({})).status).toBe(401);
  });

  it("allows system administrators to read audit metadata while denying business roles", async () => {
    jest.spyOn(prisma.auditLog, "findMany").mockResolvedValue([]);
    jest.spyOn(prisma.auditLog, "count").mockResolvedValue(0);
    authenticateAs("SYSTEM_ADMIN", null);
    const allowed = await request(app).get("/api/audit-logs").set("Authorization", "Bearer token");
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ data: [], total: 0 });
    authenticateAs("CENTRAL_STORE_OFFICER");
    const denied = await request(app).get("/api/audit-logs").set("Authorization", "Bearer token");
    expect(denied.status).toBe(403);
  });
});
