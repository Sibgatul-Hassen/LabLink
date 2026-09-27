import type { Role } from "../types";

/** UI affordances mirror the API guards; the API remains the authority. */
export const pageRoles: Record<string, readonly Role[]> = {
  "/dashboard": ["STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/components": ["STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/stocks": ["CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/quotas": ["DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/departments": ["SYSTEM_ADMIN"],
  "/courses": ["INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/sections": ["INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/labs": ["LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/routine-slots": ["INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/experiments": ["INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/sessions": ["INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/peak-classes": ["DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN"],
  "/analytics": ["DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN"],
  "/requisitions": ["STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN"],
  "/penalties": ["STUDENT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN", "SYSTEM_ADMIN"],
  "/suggestions": ["STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER"],
  "/damage-reports": ["LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER"],
  "/purchase-requests": ["LAB_ASSISTANT", "DEPT_STORE_HEAD", "CENTRAL_STORE_OFFICER", "OFFICE_ADMIN"],
  "/borrow-requests": ["DEPT_STORE_HEAD"],
  "/users": ["SYSTEM_ADMIN"],
  "/audit-logs": ["SYSTEM_ADMIN"],
};

export function canOpenPage(role: Role | undefined, path: string): boolean {
  return !!role && !!pageRoles[path]?.includes(role);
}

const systemNavigation = new Set(["/dashboard", "/users", "/departments", "/labs", "/penalties", "/audit-logs"]);

export function canShowInNavigation(role: Role | undefined, path: string): boolean {
  return canOpenPage(role, path) && (role !== "SYSTEM_ADMIN" || systemNavigation.has(path));
}
