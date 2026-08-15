import { Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { AuthenticatedRequest } from "../types";

const UNSCOPED_ROLES: Role[] = ["CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"];

export function departmentScope(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (UNSCOPED_ROLES.includes(req.user.role)) {
    req.scope = {};
  } else {
    req.scope = { departmentId: req.user.departmentId };
  }

  next();
}
