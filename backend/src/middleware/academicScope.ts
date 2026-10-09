import { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../types";

type Resource = "department" | "course" | "section" | "lab" | "routine" | "experiment";
type Source = "params" | "body";

/** Check the actual target record, not a caller-supplied department filter. */
export function requireAcademicScope(resource: Resource, key: string, source: Source = "params", optional = false) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const value: unknown = source === "params" ? req.params[key] : req.body?.[key];
    if (optional && (value === undefined || value === null)) { next(); return; }
    if (typeof value !== "string" || !value) {
      res.status(400).json({ error: `${key} is required` });
      return;
    }
    if (!req.user?.departmentId) {
      res.status(403).json({ error: "Department assignment required" });
      return;
    }
    try {
      let departmentId: string | null | undefined;
      switch (resource) {
        case "department": departmentId = (await prisma.department.findUnique({ where: { id: value }, select: { id: true } }))?.id; break;
        case "course": departmentId = (await prisma.course.findUnique({ where: { id: value }, select: { departmentId: true } }))?.departmentId; break;
        case "section": departmentId = (await prisma.section.findUnique({ where: { id: value }, select: { course: { select: { departmentId: true } } } }))?.course.departmentId; break;
        case "lab": departmentId = (await prisma.lab.findUnique({ where: { id: value }, select: { departmentId: true } }))?.departmentId; break;
        case "routine": departmentId = (await prisma.routineSlot.findUnique({ where: { id: value }, select: { section: { select: { course: { select: { departmentId: true } } } } } }))?.section.course.departmentId; break;
        case "experiment": departmentId = (await prisma.experiment.findUnique({ where: { id: value }, select: { course: { select: { departmentId: true } } } }))?.course.departmentId; break;
      }
      if (!departmentId) {
        const label = resource === "department" ? "Department" : resource === "routine" ? "Routine slot" : resource.charAt(0).toUpperCase() + resource.slice(1);
        res.status(404).json({ error: `${label} not found` });
      } else if (departmentId !== req.user.departmentId) {
        res.status(403).json({ error: "Resource belongs to another department" });
      } else {
        next();
      }
    } catch (error) {
      next(error);
    }
  };
}
