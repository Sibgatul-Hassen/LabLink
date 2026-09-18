import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";

interface LayoutProps {
  children: ReactNode;
}

interface SidebarLink {
  label: string;
  to: string;
}

// Links every authenticated role sees, regardless of role-specific extras below.
const COMMON_LINKS: SidebarLink[] = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Components", to: "/components" },
  { label: "Stock Management", to: "/stocks" },
  { label: "Department Quotas", to: "/quotas" },
  { label: "Courses", to: "/courses" },
  { label: "Sections", to: "/sections" },
  { label: "Labs", to: "/labs" },
  { label: "Routine Slots", to: "/routine-slots" },
  { label: "Experiments", to: "/experiments" },
  { label: "Class Sessions", to: "/sessions" },
  { label: "Requisitions", to: "/requisitions" },
];

const PEAK_CLASS_LOAD_LINK: SidebarLink = {
  label: "Peak Class Load",
  to: "/peak-classes",
};

const PURCHASE_REQUESTS_LINK: SidebarLink = {
  label: "Purchase Requests",
  to: "/purchase-requests",
};

const BORROW_REQUESTS_LINK: SidebarLink = {
  label: "Borrow Requests",
  to: "/borrow-requests",
};

const DEPARTMENTS_LINK: SidebarLink = {
  label: "Departments",
  to: "/departments",
};
const USERS_LINK: SidebarLink = { label: "Users", to: "/users" };

// Explicit per-role link lists, never a rank — CENTRAL_STORE_OFFICER has
// university-wide data scope but low approval authority, so ordering roles
// on a single scale (and deriving access from that rank) would be wrong.
const SIDEBAR_LINKS_BY_ROLE: Record<Role, SidebarLink[]> = {
  STUDENT: [...COMMON_LINKS],
  INSTRUCTOR: [...COMMON_LINKS],
  LAB_ASSISTANT: [...COMMON_LINKS],
  DEPT_STORE_HEAD: [
    ...COMMON_LINKS,
    PEAK_CLASS_LOAD_LINK,
    PURCHASE_REQUESTS_LINK,
    BORROW_REQUESTS_LINK,
  ],
  CENTRAL_STORE_OFFICER: [
    ...COMMON_LINKS,
    PEAK_CLASS_LOAD_LINK,
    PURCHASE_REQUESTS_LINK,
    BORROW_REQUESTS_LINK,
  ],
  OFFICE_ADMIN: [...COMMON_LINKS, PEAK_CLASS_LOAD_LINK, PURCHASE_REQUESTS_LINK],
  SYSTEM_ADMIN: [
    ...COMMON_LINKS,
    PEAK_CLASS_LOAD_LINK,
    PURCHASE_REQUESTS_LINK,
    BORROW_REQUESTS_LINK,
    DEPARTMENTS_LINK,
    USERS_LINK,
  ],
};

function getSidebarLinks(role: Role): SidebarLink[] {
  return SIDEBAR_LINKS_BY_ROLE[role] ?? COMMON_LINKS;
}

function formatRole(role: Role): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  if (!user) {
    return null;
  }

  const sidebarLinks = getSidebarLinks(user.role);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex h-16 items-center justify-between border-b bg-white px-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">LabLink</h1>

        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">
              {user.fullName}
            </p>
            <p className="text-xs text-slate-500">{formatRole(user.role)}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <aside className="w-64 border-r bg-slate-900 p-4">
          <nav className="space-y-2">
            {sidebarLinks.map((link) => (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  `block rounded-md px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
