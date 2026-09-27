import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ClipboardList, CalendarDays, Package, ShieldCheck, Users, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { getRequisitions } from "../api/requisition.api";
import { getSessions } from "../api/session.api";
import { getPurchaseRequestQueue } from "../api/purchase.api";
import { getPenalties } from "../api/penalty.api";
import { getUsers } from "../api/user.api";
import { getDepartments } from "../api/department.api";
import { useAuthStore } from "../store/authStore";
import { canOpenPage } from "../auth/permissions";
import type { Role } from "../types";

type Card = { title: string; detail: string; path: string; icon: typeof ClipboardList; value?: number; loading?: boolean; error?: boolean };

const introductions: Record<Role, string> = {
  STUDENT: "Track your own requests, returns, and penalties.",
  INSTRUCTOR: "Plan your assigned classes and follow live lab orders.",
  LAB_ASSISTANT: "Prepare assigned labs, reconcile returns, and report damage.",
  DEPT_STORE_HEAD: "Manage your department's academic work and approval queue.",
  CENTRAL_STORE_OFFICER: "Manage central inventory and operational handovers.",
  OFFICE_ADMIN: "Review final purchase approvals and university activity.",
  SYSTEM_ADMIN: "Manage accounts, assignments, and system configuration.",
};

const quickLinks: Record<Role, { title: string; path: string }[]> = {
  STUDENT: [{ title: "My requisitions", path: "/requisitions" }, { title: "My penalties", path: "/penalties" }, { title: "Component availability", path: "/components" }, { title: "Slot suggestions", path: "/suggestions" }],
  INSTRUCTOR: [{ title: "My class sessions", path: "/sessions" }, { title: "My sections", path: "/sections" }, { title: "Experiments", path: "/experiments" }, { title: "Live requisitions", path: "/requisitions" }],
  LAB_ASSISTANT: [{ title: "Assigned labs", path: "/labs" }, { title: "Class sessions", path: "/sessions" }, { title: "Class requisitions", path: "/requisitions" }, { title: "Damage and maintenance", path: "/damage-reports" }],
  DEPT_STORE_HEAD: [{ title: "Purchase approval · Rung 1", path: "/purchase-requests" }, { title: "Borrow requests", path: "/borrow-requests" }, { title: "Courses and sections", path: "/courses" }, { title: "Department analytics", path: "/analytics" }],
  CENTRAL_STORE_OFFICER: [{ title: "Stock management", path: "/stocks" }, { title: "Issue and return", path: "/requisitions" }, { title: "Purchase approval · Rung 2", path: "/purchase-requests" }, { title: "Penalty payments", path: "/penalties" }],
  OFFICE_ADMIN: [{ title: "Purchase approval · Rung 3", path: "/purchase-requests" }, { title: "University analytics", path: "/analytics" }, { title: "Operational oversight", path: "/requisitions" }],
  SYSTEM_ADMIN: [{ title: "Users and assignments", path: "/users" }, { title: "Departments", path: "/departments" }, { title: "Audit logs", path: "/audit-logs" }, { title: "Penalty configuration", path: "/penalties" }],
};

export default function RoleDashboard() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const requisitions = useQuery({ queryKey: ["dashboard", role, "requisitions"], queryFn: () => getRequisitions({ page: 1, limit: 1 }), enabled: !!role && ["STUDENT", "INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD", "OFFICE_ADMIN"].includes(role) });
  const sessions = useQuery({ queryKey: ["dashboard", role, "sessions"], queryFn: () => getSessions({ page: 1, limit: 1 }), enabled: !!role && ["INSTRUCTOR", "LAB_ASSISTANT", "DEPT_STORE_HEAD"].includes(role) });
  const approvals = useQuery({ queryKey: ["dashboard", role, "approvals"], queryFn: getPurchaseRequestQueue, enabled: !!role && ["DEPT_STORE_HEAD", "OFFICE_ADMIN"].includes(role) });
  const penalties = useQuery({ queryKey: ["dashboard", role, "penalties"], queryFn: () => getPenalties({ status: "OUTSTANDING", page: 1, limit: 1 }), enabled: !!role && ["STUDENT", "DEPT_STORE_HEAD"].includes(role) });
  const users = useQuery({ queryKey: ["dashboard", "users"], queryFn: () => getUsers({ page: 1, limit: 1 }), enabled: role === "SYSTEM_ADMIN" });
  const departments = useQuery({ queryKey: ["dashboard", "departments"], queryFn: () => getDepartments({ page: 1, limit: 1 }), enabled: role === "SYSTEM_ADMIN" });
  if (!user || !role) return null;

  const cards: Card[] = [];
  if (requisitions.isEnabled) cards.push({ title: role === "STUDENT" ? "My requisitions" : "Visible requisitions", detail: "Requests in your scope", path: "/requisitions", icon: ClipboardList, value: requisitions.data?.total, loading: requisitions.isLoading, error: requisitions.isError });
  if (sessions.isEnabled) cards.push({ title: "Assigned sessions", detail: "Sessions in your scope", path: "/sessions", icon: CalendarDays, value: sessions.data?.total, loading: sessions.isLoading, error: sessions.isError });
  if (approvals.isEnabled) cards.push({ title: "Awaiting your approval", detail: role === "DEPT_STORE_HEAD" ? "Department purchase rung 1" : "Final purchase rung 3", path: "/purchase-requests", icon: Package, value: approvals.data?.length, loading: approvals.isLoading, error: approvals.isError });
  if (penalties.isEnabled) cards.push({ title: "Outstanding penalties", detail: role === "STUDENT" ? "Your outstanding records" : "Within your department", path: "/penalties", icon: ShieldCheck, value: penalties.data?.total, loading: penalties.isLoading, error: penalties.isError });
  if (users.isEnabled) cards.push({ title: "User accounts", detail: "System account records", path: "/users", icon: Users, value: users.data?.total, loading: users.isLoading, error: users.isError });
  if (departments.isEnabled) cards.push({ title: "Departments", detail: "Structural records", path: "/departments", icon: Building2, value: departments.data?.total, loading: departments.isLoading, error: departments.isError });

  return <section className="space-y-7">
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-700">{role.replace(/_/g, " ")} workspace</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-[var(--app-ink)]">Welcome back, {user.fullName.split(" ")[0]}</h2>
      <p className="mt-2 text-sm text-[var(--app-muted)]">{introductions[role]}</p>
      <span className="mt-4 inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">{user.departmentCode ?? "University-wide"}</span>
    </div>
    {cards.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(({ title, detail, path, icon: Icon, value, loading, error }) =>
      <Link key={title} to={path} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
        <div className="flex items-start justify-between"><span className="text-sm font-semibold text-[var(--app-muted)]">{title}</span><Icon size={19} className="text-indigo-600" /></div>
        <p className="mt-4 text-3xl font-bold text-[var(--app-ink)]">{loading ? "…" : error ? "—" : value ?? 0}</p><p className="mt-1 text-xs text-[var(--app-muted)]">{error ? "Unable to load; open the page to retry" : detail}</p>
      </Link>)}</div>}
    <div><h3 className="mb-4 text-lg font-bold text-[var(--app-ink)]">Your workspace</h3><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {quickLinks[role].filter((item) => canOpenPage(role, item.path)).map((item) => <Link key={item.path} to={item.path} className="flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-4 text-sm font-semibold text-[var(--app-ink)] shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300">{item.title}<ArrowUpRight size={16} className="text-indigo-600" /></Link>)}
    </div></div>
  </section>;
}
