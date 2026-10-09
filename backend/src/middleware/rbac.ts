import { Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { AuthenticatedRequest } from "../types";

export const ALL_ROLES = [
  "STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD",
  "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN",
] as const satisfies readonly Role[];

export function requireRole(...allowed: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
