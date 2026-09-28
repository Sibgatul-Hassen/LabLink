import { AnimatePresence } from "framer-motion";
import { useAuthStore } from "../store/authStore";
import type { User } from "../types";
import {
  CentralDashboard, DepartmentDashboard, InstructorDashboard, LabAssistantDashboard,
  OfficeDashboard, StudentDashboard, SystemDashboard,
} from "./dashboard/RoleViews";

function RoleView({ user }: { user: User }) {
  switch (user.role) {
    case "STUDENT": return <StudentDashboard user={user} />;
    case "INSTRUCTOR": return <InstructorDashboard user={user} />;
    case "LAB_ASSISTANT": return <LabAssistantDashboard user={user} />;
    case "DEPT_STORE_HEAD": return <DepartmentDashboard user={user} />;
    case "CENTRAL_STORE_OFFICER": return <CentralDashboard user={user} />;
    case "OFFICE_ADMIN": return <OfficeDashboard user={user} />;
    case "SYSTEM_ADMIN": return <SystemDashboard user={user} />;
    default: return <section role="alert" className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-8 text-[var(--app-ink)]">
      <h2 className="text-xl font-bold">Dashboard unavailable</h2>
      <p className="mt-2 text-sm text-[var(--app-muted)]">This account has an unrecognized role. Contact your system administrator.</p>
    </section>;
  }
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  return <AnimatePresence mode="wait" initial={false}><RoleView key={`${user.id}:${user.role}`} user={user} /></AnimatePresence>;
}
