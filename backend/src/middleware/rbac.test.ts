import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { requireRole } from "./rbac";
import { AuthenticatedRequest } from "../types";

describe("RBAC Middleware", () => {
  let req: Partial<AuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it("should allow authenticated user with allowed role", () => {
    req.user = {
      id: "user-1",
      role: "STUDENT" as Role,
      departmentId: "dept-1",
    };

    const middleware = requireRole("STUDENT", "INSTRUCTOR");
    middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should deny authenticated user with forbidden role", () => {
    req.user = {
      id: "user-1",
      role: "STUDENT" as Role,
      departmentId: "dept-1",
    };

    const middleware = requireRole("CENTRAL_STORE_OFFICER", "SYSTEM_ADMIN");
    middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should deny unauthenticated request", () => {
    req.user = undefined;

    const middleware = requireRole("STUDENT");
    middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should allow system admin when allowed", () => {
    req.user = {
      id: "admin-1",
      role: "SYSTEM_ADMIN" as Role,
      departmentId: null,
    };

    const middleware = requireRole("SYSTEM_ADMIN", "OFFICE_ADMIN");
    middleware(req as AuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should deny central store officer when not allowed", () => {
    req.user = {
      id: "officer-1",
      role: "CENTRAL_STORE_OFFICER" as Role,
      departmentId: "office-dept",
    };

    const middleware = requireRole("STUDENT", "INSTRUCTOR", "LAB_ASSISTANT");
    middleware(req as AuthenticatedRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    expect(next).not.toHaveBeenCalled();
  });
});
