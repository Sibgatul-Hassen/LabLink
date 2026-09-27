import { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../types";

/** Record successful API writes without persisting request bodies or credentials. */
export function auditSuccessfulWrites(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) { next(); return; }
  res.on("finish", () => {
    if (!req.user || res.statusCode < 200 || res.statusCode >= 300) return;
    const path = req.path;
    void prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: `${req.method} ${path}`,
        entityType: path.split("/").filter(Boolean)[0] ?? "api",
        entityId: path,
        after: { httpStatus: res.statusCode },
      },
    }).catch((error: unknown) => console.error("Could not record API audit entry", error));
  });
  next();
}
