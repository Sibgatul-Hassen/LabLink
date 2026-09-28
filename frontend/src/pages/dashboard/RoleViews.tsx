import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity, BarChart3, BookOpen, Boxes, Building2, CalendarDays, CircleAlert,
  ClipboardList, Clock3, CreditCard, FlaskConical, Package, PackageCheck,
  ShieldCheck, Sparkles, Truck, Users, Wrench,
} from "lucide-react";
import { getAuditLogs } from "../../api/audit.api";
import { getShortageFrequency } from "../../api/analytics.api";
import { getIncomingBorrowRequests } from "../../api/borrow.api";
import { getComponents } from "../../api/component.api";
import { getDamageReports } from "../../api/damage.api";
import { getDepartments } from "../../api/department.api";
import { getLabs } from "../../api/lab.api";
import { getPenalties, getPenaltyBlockStatus } from "../../api/penalty.api";
import { getPurchaseRequestQueue, getPurchaseRequests } from "../../api/purchase.api";
import { getRequisitions } from "../../api/requisition.api";
import { getSections } from "../../api/section.api";
import { getSessions } from "../../api/session.api";
import { getSuggestions } from "../../api/suggestion.api";
import { getUsers } from "../../api/user.api";
import type { Component, User } from "../../types";
import {
  ActivityPanel, BreakdownChart, DashboardFrame, MetricGrid, QuickLinks,
  type Activity as DashboardActivity, type ChartDatum,
} from "./Shared";
import { InventoryCategoryChart, StockAttentionPanel } from "./CentralInventoryPanels";
import { auditActivity } from "./auditActivity";
import { countBy, shortDate } from "./data";

const sampleLimit = 100;

function requestActivity(requests: { id: string; type: string; status: string; neededFrom: string }[]): DashboardActivity[] {
  return requests.slice(0, 5).map((request) => ({
    id: request.id, title: `${request.type.toLowerCase()} requisition`,
    detail: `Needed ${shortDate(request.neededFrom)}`, badge: request.status,
  }));
}

function requestStatusChart(requests: { status: string }[]): ChartDatum[] {
  const labels = ["DRAFT", "READY", "ISSUED", "RETURNED"];
  return [
    ...labels.map((status) => ({ name: status.toLowerCase(), value: requests.filter((item) => item.status === status).length })),
    { name: "other", value: requests.filter((item) => !labels.includes(item.status)).length },
  ];
}

function sessionActivity(sessions: { id: string; startsAt: string; status: string; routineSlot: { section: { course: { code: string }; name: string }; lab: { roomNo: string } } }[]): DashboardActivity[] {
  return sessions.slice(0, 5).map((session) => ({
    id: session.id,
    title: `${session.routineSlot.section.course.code} · ${session.routineSlot.section.name}`,
    detail: `${shortDate(session.startsAt)} · Room ${session.routineSlot.lab.roomNo}`,
    badge: session.status,
  }));
}

export function StudentDashboard({ user }: { user: User }) {
  const requests = useQuery({ queryKey: ["dashboard", user.id, "personal-requests"], queryFn: () => getRequisitions({ type: "PERSONAL", page: 1, limit: sampleLimit }) });
  const penalties = useQuery({ queryKey: ["dashboard", user.id, "outstanding-penalties"], queryFn: () => getPenalties({ status: "OUTSTANDING", page: 1, limit: 1 }) });
  const block = useQuery({ queryKey: ["dashboard", user.id, "penalty-block"], queryFn: getPenaltyBlockStatus });
  const hints = useQuery({ queryKey: ["dashboard", user.id, "slot-hints"], queryFn: () => getSuggestions({ type: "SLOT", page: 1, limit: 1 }) });
  const recent = requests.data?.data ?? [];
  return <DashboardFrame user={user} description="Track your own requests, returns, and penalties.">
    {block.data?.blocked && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">Personal requisitions are paused until your outstanding balance is cleared.</p>}
    <MetricGrid user={user} items={[
      { title: "My requests", value: requests.data?.total, detail: "Personal requisitions", path: "/requisitions", icon: ClipboardList, loading: requests.isLoading, error: requests.isError },
      { title: "Active requests", value: recent.filter((item) => !["RETURNED", "CANCELLED", "REJECTED"].includes(item.status)).length, detail: "Among your latest 100 requests", path: "/requisitions", icon: Clock3, loading: requests.isLoading, error: requests.isError },
      { title: "Outstanding penalties", value: penalties.data?.total, detail: "Your records to settle", path: "/penalties", icon: CreditCard, loading: penalties.isLoading, error: penalties.isError },
      { title: "Slot hints", value: hints.data?.total, detail: "Suggestions visible to you", path: "/suggestions", icon: Sparkles, loading: hints.isLoading, error: hints.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownChart title="My request progress" description="Status of your latest 100 personal requests" data={requestStatusChart(recent)} loading={requests.isLoading} error={requests.isError} />
      <ActivityPanel title="Recent requests" description="Your upcoming collections and returns" items={requestActivity(recent)} path="/requisitions" loading={requests.isLoading} error={requests.isError} />
    </div>
    <QuickLinks user={user} items={[
      { title: "Personal requests", detail: "Create or track a request", path: "/requisitions", icon: ClipboardList },
      { title: "Browse components", detail: "Check availability", path: "/components", icon: Boxes },
      { title: "My penalties", detail: "Review your balance", path: "/penalties", icon: CreditCard },
      { title: "Slot suggestions", detail: "See your hints", path: "/suggestions", icon: Sparkles },
    ]} />
  </DashboardFrame>;
}

export function InstructorDashboard({ user }: { user: User }) {
  const sessions = useQuery({ queryKey: ["dashboard", user.id, "instructor-sessions"], queryFn: () => getSessions({ page: 1, limit: sampleLimit }) });
  const sections = useQuery({ queryKey: ["dashboard", user.id, "instructor-sections"], queryFn: () => getSections({ page: 1, limit: 1 }) });
  const requests = useQuery({ queryKey: ["dashboard", user.id, "instructor-requests"], queryFn: () => getRequisitions({ page: 1, limit: sampleLimit }) });
  const recentSessions = sessions.data?.data ?? [];
  const recentRequests = requests.data?.data ?? [];
  return <DashboardFrame user={user} description="Plan your assigned classes and follow live lab orders.">
    <MetricGrid user={user} items={[
      { title: "Assigned sessions", value: sessions.data?.total, detail: "Classes in your scope", path: "/sessions", icon: CalendarDays, loading: sessions.isLoading, error: sessions.isError },
      { title: "Running or scheduled", value: recentSessions.filter((item) => ["RUNNING", "SCHEDULED"].includes(item.status)).length, detail: "Among the latest 100 sessions", path: "/sessions", icon: Clock3, loading: sessions.isLoading, error: sessions.isError },
      { title: "My sections", value: sections.data?.total, detail: "Assigned teaching groups", path: "/sections", icon: BookOpen, loading: sections.isLoading, error: sections.isError },
      { title: "Live orders", value: recentRequests.filter((item) => item.origin === "INSTRUCTOR_LIVE").length, detail: "Among the latest 100 requests", path: "/requisitions", icon: ClipboardList, loading: requests.isLoading, error: requests.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownChart title="Class session progress" description="Status of your latest 100 assigned sessions" data={countBy(recentSessions, ["SCHEDULED", "RUNNING", "COMPLETED", "CANCELLED"], (item) => item.status).map((item) => ({ ...item, name: item.name.toLowerCase() }))} loading={sessions.isLoading} error={sessions.isError} />
      <ActivityPanel title="Assigned class sessions" description="Classes and rooms in your schedule" items={sessionActivity(recentSessions)} path="/sessions" loading={sessions.isLoading} error={sessions.isError} />
    </div>
    <QuickLinks user={user} items={[
      { title: "Class sessions", detail: "Assign experiments or order live", path: "/sessions", icon: CalendarDays },
      { title: "My sections", detail: "View teaching groups", path: "/sections", icon: BookOpen },
      { title: "Experiments", detail: "Review component lists", path: "/experiments", icon: FlaskConical },
      { title: "Requisitions", detail: "Follow class orders", path: "/requisitions", icon: ClipboardList },
      { title: "Item suggestions", detail: "Review class item lists", path: "/suggestions", icon: Sparkles },
    ]} />
  </DashboardFrame>;
}

export function LabAssistantDashboard({ user }: { user: User }) {
  const labs = useQuery({ queryKey: ["dashboard", user.id, "assigned-labs"], queryFn: () => getLabs({ page: 1, limit: 1 }) });
  const sessions = useQuery({ queryKey: ["dashboard", user.id, "lab-sessions"], queryFn: () => getSessions({ page: 1, limit: sampleLimit }) });
  const requests = useQuery({ queryKey: ["dashboard", user.id, "lab-requests"], queryFn: () => getRequisitions({ page: 1, limit: sampleLimit }) });
  const damage = useQuery({ queryKey: ["dashboard", user.id, "lab-damage"], queryFn: () => getDamageReports({ page: 1, limit: sampleLimit }) });
  const recentDamage = damage.data?.data ?? [];
  const recentRequests = requests.data?.data ?? [];
  return <DashboardFrame user={user} description="Prepare assigned labs, reconcile returns, and report damage.">
    <MetricGrid user={user} items={[
      { title: "Assigned labs", value: labs.data?.total, detail: "Rooms in your scope", path: "/labs", icon: FlaskConical, loading: labs.isLoading, error: labs.isError },
      { title: "Class sessions", value: sessions.data?.total, detail: "Sessions to prepare", path: "/sessions", icon: CalendarDays, loading: sessions.isLoading, error: sessions.isError },
      { title: "Class requests", value: recentRequests.filter((item) => item.type === "CLASS").length, detail: "Among the latest 100 requests", path: "/requisitions", icon: ClipboardList, loading: requests.isLoading, error: requests.isError },
      { title: "Open damage reports", value: recentDamage.filter((item) => ["REPORTED", "UNDER_MAINTENANCE"].includes(item.status)).length, detail: "Among the latest 100 reports", path: "/damage-reports", icon: Wrench, loading: damage.isLoading, error: damage.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownChart title="Damage workflow" description="Status of the latest 100 assigned reports" data={countBy(recentDamage, ["REPORTED", "UNDER_MAINTENANCE", "REPAIRED", "WRITTEN_OFF"], (item) => item.status).map((item) => ({ ...item, name: item.name.toLowerCase().replace("under_maintenance", "repairing").replace("written_off", "written off") }))} loading={damage.isLoading} error={damage.isError} />
      <ActivityPanel title="Maintenance attention" description="Reports from your assigned labs" items={recentDamage.filter((item) => ["REPORTED", "UNDER_MAINTENANCE"].includes(item.status)).map((item) => ({ id: item.id, title: item.component.name, detail: `${item.qty} item(s) · ${shortDate(item.createdAt)}`, badge: item.status }))} path="/damage-reports" loading={damage.isLoading} error={damage.isError} emptyText="No damage reports need attention." />
    </div>
    <QuickLinks user={user} items={[
      { title: "Assigned labs", detail: "Check rooms and equipment", path: "/labs", icon: FlaskConical },
      { title: "Class sessions", detail: "Prepare upcoming classes", path: "/sessions", icon: CalendarDays },
      { title: "Class requisitions", detail: "Draft and reconcile", path: "/requisitions", icon: ClipboardList },
      { title: "Damage reports", detail: "Track maintenance", path: "/damage-reports", icon: Wrench },
      { title: "Suggestions", detail: "Review assigned proposals", path: "/suggestions", icon: Sparkles },
    ]} />
  </DashboardFrame>;
}

export function DepartmentDashboard({ user }: { user: User }) {
  const approvals = useQuery({ queryKey: ["dashboard", user.id, "department-purchase-queue"], queryFn: getPurchaseRequestQueue });
  const incoming = useQuery({ queryKey: ["dashboard", user.id, "incoming-borrow"], queryFn: getIncomingBorrowRequests });
  const sessions = useQuery({ queryKey: ["dashboard", user.id, "department-sessions"], queryFn: () => getSessions({ page: 1, limit: 1 }) });
  const penalties = useQuery({ queryKey: ["dashboard", user.id, "department-penalties"], queryFn: () => getPenalties({ status: "OUTSTANDING", page: 1, limit: 1 }) });
  const queue = approvals.data ?? [];
  const borrow = incoming.data ?? [];
  return <DashboardFrame user={user} description="Manage your department's academic work and approval queue.">
    <MetricGrid user={user} items={[
      { title: "Purchase approvals", value: queue.length, detail: "Department rung 1", path: "/purchase-requests", icon: Package, loading: approvals.isLoading, error: approvals.isError },
      { title: "Incoming borrow", value: borrow.filter((item) => item.status === "REQUESTED").length, detail: "Lending decisions", path: "/borrow-requests", icon: Truck, loading: incoming.isLoading, error: incoming.isError },
      { title: "Department sessions", value: sessions.data?.total, detail: "Classes in your department", path: "/sessions", icon: CalendarDays, loading: sessions.isLoading, error: sessions.isError },
      { title: "Outstanding penalties", value: penalties.data?.total, detail: "Department records", path: "/penalties", icon: CreditCard, loading: penalties.isLoading, error: penalties.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownChart title="Purchase urgency" description="Requests waiting for your rung 1 decision" data={countBy(queue, ["LOW", "NORMAL", "HIGH", "CRITICAL"], (item) => item.urgency).map((item) => ({ ...item, name: item.name.toLowerCase() }))} loading={approvals.isLoading} error={approvals.isError} />
      <ActivityPanel title="Your approval queue" description="Department purchases awaiting a decision" items={queue.map((item) => ({ id: item.id, title: item.component.name, detail: `${item.qtyNeeded} ${item.component.unit} · ${shortDate(item.createdAt)}`, badge: item.urgency }))} path="/purchase-requests" loading={approvals.isLoading} error={approvals.isError} emptyText="No purchase requests await your approval." />
    </div>
    <QuickLinks user={user} items={[
      { title: "Purchase approvals", detail: "Review rung 1", path: "/purchase-requests", icon: Package },
      { title: "Borrow requests", detail: "Approve department lending", path: "/borrow-requests", icon: Truck },
      { title: "Courses and sections", detail: "Manage academics", path: "/courses", icon: BookOpen },
      { title: "Department analytics", detail: "Review local trends", path: "/analytics", icon: BarChart3 },
      { title: "Penalty waivers", detail: "Review department records", path: "/penalties", icon: CreditCard },
    ]} />
  </DashboardFrame>;
}

async function loadInventory(): Promise<Component[]> {
  const first = await getComponents({ page: 1, limit: sampleLimit });
  const pages = Math.ceil(first.total / sampleLimit);
  if (pages <= 1) return first.data;
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getComponents({ page: index + 2, limit: sampleLimit })));
  return [first, ...rest].flatMap((page) => page.data);
}

export function CentralDashboard({ user }: { user: User }) {
  const inventory = useQuery({ queryKey: ["dashboard", user.id, "central-inventory"], queryFn: loadInventory });
  const ready = useQuery({ queryKey: ["dashboard", user.id, "ready-to-issue"], queryFn: () => getRequisitions({ status: "READY", page: 1, limit: sampleLimit }) });
  const approvals = useQuery({ queryKey: ["dashboard", user.id, "central-purchase-queue"], queryFn: getPurchaseRequestQueue });
  const receipts = useQuery({ queryKey: ["dashboard", user.id, "awaiting-receipt"], queryFn: () => getPurchaseRequests({ status: "APPROVED", page: 1, limit: 1 }) });
  const components = useMemo(() => inventory.data ?? [], [inventory.data]);
  const stockedComponents = components.filter((item): item is Component & { stock: NonNullable<Component["stock"]> } => item.stock != null);
  const lowStock = stockedComponents.filter((item) => item.stock.onHand <= item.stock.reorderPoint);
  const stockWatch = [...stockedComponents]
    .sort((a, b) => (a.stock.onHand - a.stock.reorderPoint) - (b.stock.onHand - b.stock.reorderPoint) || a.name.localeCompare(b.name))
    .slice(0, 5);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    components.forEach((item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [components]);
  return <DashboardFrame user={user} description="Manage central inventory, issue requests, and receive approved purchases.">
    <MetricGrid user={user} items={[
      { title: "Catalogue items", value: components.length, detail: "Active components", path: "/components", icon: Boxes, loading: inventory.isLoading, error: inventory.isError },
      { title: "Low stock", value: lowStock.length, detail: "At or below reorder point", path: "/stocks", icon: CircleAlert, loading: inventory.isLoading, error: inventory.isError },
      { title: "Ready to issue", value: ready.data?.total, detail: "Requisitions awaiting handover", path: "/requisitions", icon: PackageCheck, loading: ready.isLoading, error: ready.isError },
      { title: "Purchase approvals", value: approvals.data?.length, detail: "Central rung 2", path: "/purchase-requests", icon: Package, loading: approvals.isLoading, error: approvals.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <InventoryCategoryChart data={categories} loading={inventory.isLoading} error={inventory.isError} />
      <StockAttentionPanel items={stockWatch} lowStockCount={lowStock.length} loading={inventory.isLoading} error={inventory.isError} />
    </div>
    <QuickLinks user={user} items={[
      { title: "Stock management", detail: "Adjust and transfer stock", path: "/stocks", icon: Boxes },
      { title: "Issue and return", detail: "Handle requisitions", path: "/requisitions", icon: ClipboardList },
      { title: "Purchasing", detail: `${receipts.data?.total ?? 0} approved for receipt`, path: "/purchase-requests", icon: Package },
      { title: "Quota management", detail: "Confirm allocations", path: "/quotas", icon: BarChart3 },
      { title: "Suggestions", detail: "Review operational proposals", path: "/suggestions", icon: Sparkles },
      { title: "Penalty payments", detail: "Record settlements", path: "/penalties", icon: CreditCard },
    ]} />
  </DashboardFrame>;
}

export function OfficeDashboard({ user }: { user: User }) {
  const approvals = useQuery({ queryKey: ["dashboard", user.id, "office-purchase-queue"], queryFn: getPurchaseRequestQueue });
  const requests = useQuery({ queryKey: ["dashboard", user.id, "office-requisitions"], queryFn: () => getRequisitions({ page: 1, limit: 1 }) });
  const shortages = useQuery({ queryKey: ["dashboard", user.id, "shortage-frequency"], queryFn: () => getShortageFrequency({ limit: 6 }) });
  const purchases = useQuery({ queryKey: ["dashboard", user.id, "office-purchases"], queryFn: () => getPurchaseRequests({ status: "APPROVED", page: 1, limit: 1 }) });
  const queue = approvals.data ?? [];
  const shortageItems = shortages.data?.data ?? [];
  return <DashboardFrame user={user} description="Review final purchase approvals and university activity.">
    <MetricGrid user={user} items={[
      { title: "Final approvals", value: queue.length, detail: "Office rung 3", path: "/purchase-requests", icon: ShieldCheck, loading: approvals.isLoading, error: approvals.isError },
      { title: "Approved purchases", value: purchases.data?.total, detail: "Awaiting central receipt", path: "/purchase-requests", icon: PackageCheck, loading: purchases.isLoading, error: purchases.isError },
      { title: "Visible requisitions", value: requests.data?.total, detail: "University oversight", path: "/requisitions", icon: ClipboardList, loading: requests.isLoading, error: requests.isError },
      { title: "Shortage incidents", value: shortageItems.reduce((sum, item) => sum + item.shortageCount, 0), detail: "Across six most frequent items", path: "/analytics", icon: CircleAlert, loading: shortages.isLoading, error: shortages.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownChart title="Frequent shortages" description="Incidents for the six most affected components" data={shortageItems.map((item) => ({ name: item.componentCode, value: item.shortageCount }))} loading={shortages.isLoading} error={shortages.isError} />
      <ActivityPanel title="Final approval queue" description="Purchases awaiting office review" items={queue.map((item) => ({ id: item.id, title: item.component.name, detail: `${item.qtyNeeded} ${item.component.unit} · ${shortDate(item.createdAt)}`, badge: item.urgency }))} path="/purchase-requests" loading={approvals.isLoading} error={approvals.isError} emptyText="No final approvals are waiting." />
    </div>
    <QuickLinks user={user} items={[
      { title: "Final approvals", detail: "Review rung 3", path: "/purchase-requests", icon: ShieldCheck },
      { title: "University analytics", detail: "Inspect operational trends", path: "/analytics", icon: BarChart3 },
      { title: "Requisitions", detail: "Read university activity", path: "/requisitions", icon: ClipboardList },
      { title: "Peak classes", detail: "Review lab demand", path: "/peak-classes", icon: CalendarDays },
    ]} />
  </DashboardFrame>;
}

const roleNames = [
  ["STUDENT", "Student"], ["INSTRUCTOR", "Instructor"], ["LAB_ASSISTANT", "Lab"],
  ["DEPT_STORE_HEAD", "Dept"], ["CENTRAL_STORE_OFFICER", "Central"],
  ["OFFICE_ADMIN", "Office"], ["SYSTEM_ADMIN", "Admin"],
] as const;

export function SystemDashboard({ user }: { user: User }) {
  const users = useQuery({ queryKey: ["dashboard", user.id, "system-users"], queryFn: () => getUsers({ page: 1, limit: sampleLimit }) });
  const departments = useQuery({ queryKey: ["dashboard", user.id, "system-departments"], queryFn: () => getDepartments({ page: 1, limit: 1 }) });
  const audits = useQuery({ queryKey: ["dashboard", user.id, "audit-events"], queryFn: () => getAuditLogs(1) });
  const labs = useQuery({ queryKey: ["dashboard", user.id, "structural-labs"], queryFn: () => getLabs({ page: 1, limit: 1 }) });
  const accounts = users.data?.data ?? [];
  return <DashboardFrame user={user} description="Manage accounts, assignments, and system configuration.">
    <MetricGrid user={user} items={[
      { title: "User accounts", value: users.data?.total, detail: "Platform identities", path: "/users", icon: Users, loading: users.isLoading, error: users.isError },
      { title: "Departments", value: departments.data?.total, detail: "Structural records", path: "/departments", icon: Building2, loading: departments.isLoading, error: departments.isError },
      { title: "Labs", value: labs.data?.total, detail: "Configured rooms", path: "/labs", icon: FlaskConical, loading: labs.isLoading, error: labs.isError },
      { title: "Audit entries", value: audits.data?.total, detail: "Recorded API actions", path: "/audit-logs", icon: Activity, loading: audits.isLoading, error: audits.isError },
    ]} />
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownChart title="Accounts by role" description="Role mix among the first 100 accounts" data={roleNames.map(([role, name]) => ({ name, value: accounts.filter((account) => account.role === role).length }))} loading={users.isLoading} error={users.isError} />
      <ActivityPanel title="Recent audit events" description="Latest recorded actions; open Audit Logs for exact request details" items={(audits.data?.data ?? []).map(auditActivity)} path="/audit-logs" loading={audits.isLoading} error={audits.isError} emptyText="No audit events have been recorded yet." />
    </div>
    <QuickLinks user={user} items={[
      { title: "Users", detail: "Manage accounts", path: "/users", icon: Users },
      { title: "Departments", detail: "Manage structure", path: "/departments", icon: Building2 },
      { title: "Audit logs", detail: "Review changes", path: "/audit-logs", icon: Activity },
      { title: "Penalty settings", detail: "Configure rates", path: "/penalties", icon: CreditCard },
    ]} />
  </DashboardFrame>;
}
