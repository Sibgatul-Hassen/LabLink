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

function getSidebarLinks(role: Role): SidebarLink[] {
  const basicLinks: SidebarLink[] = [
    { label: "Dashboard", to: "/dashboard" },
    { label: "Components", to: "/components" },
    { label: "Courses", to: "/courses" },
    { label: "Sections", to: "/sections" },
    { label: "Labs", to: "/labs" },
  ];

  if (role === "SYSTEM_ADMIN") {
    return [
      ...basicLinks,
      { label: "Departments", to: "/departments" },
      { label: "Users", to: "/users" },
    ];
  }

  return basicLinks;
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
