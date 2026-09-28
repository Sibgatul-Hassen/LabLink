import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity, Boxes, CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight,
  ClipboardList, Command, FlaskConical, GraduationCap, Layers3, LayoutDashboard,
  LogOut, Moon, Package, Search, Settings2, ShieldCheck, Sun, Users,
  Warehouse, Wrench, X, type LucideIcon,
} from "lucide-react";
import NotificationBell from "./NotificationBell";
import ThemeLogo from "./ThemeLogo";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";
import { canShowInNavigation } from "../auth/permissions";

type Item = { label: string; to: string; icon: LucideIcon };
type Group = { title: string; items: Item[] };
const groups: Group[] = [
  { title: "Overview", items: [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
    { label: "Analytics", to: "/analytics", icon: ChartNoAxesCombined },
  ] },
  { title: "Inventory", items: [
    { label: "Components", to: "/components", icon: Boxes },
    { label: "Stock Management", to: "/stocks", icon: Warehouse },
    { label: "Department Quotas", to: "/quotas", icon: Layers3 },
    { label: "Suggestions", to: "/suggestions", icon: Activity },
  ] },
  { title: "Operations", items: [
    { label: "Requisitions", to: "/requisitions", icon: ClipboardList },
    { label: "Purchase Requests", to: "/purchase-requests", icon: Package },
    { label: "Borrow Requests", to: "/borrow-requests", icon: ChevronRight },
    { label: "Damage Reports", to: "/damage-reports", icon: Wrench },
    { label: "Penalties", to: "/penalties", icon: ShieldCheck },
  ] },
  { title: "Academics", items: [
    { label: "Courses", to: "/courses", icon: GraduationCap },
    { label: "Sections", to: "/sections", icon: Users },
    { label: "Labs", to: "/labs", icon: FlaskConical },
    { label: "Routine Slots", to: "/routine-slots", icon: CalendarDays },
    { label: "Experiments", to: "/experiments", icon: Settings2 },
    { label: "Class Sessions", to: "/sessions", icon: ClipboardList },
    { label: "Peak Class Load", to: "/peak-classes", icon: ChartNoAxesCombined },
  ] },
  { title: "Administration", items: [
    { label: "Departments", to: "/departments", icon: Warehouse },
    { label: "Users", to: "/users", icon: Users },
    { label: "Audit Logs", to: "/audit-logs", icon: ShieldCheck },
  ] },
];

function formatRole(role: Role): string {
  return role.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function getTheme(): "light" | "dark" {
  try { return localStorage.getItem("lablink-theme") === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export default function Layout() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(getTheme);
  const role = user?.role;
  const visibleGroups = useMemo(() => groups.map((group) => ({ ...group,
    items: group.items.filter((item) => canShowInNavigation(role, item.to)).map((item) => ({
      ...item,
      label: item.to === "/requisitions" && role === "STUDENT" ? "My Requisitions"
        : item.to === "/requisitions" && role === "INSTRUCTOR" ? "My Class Orders"
        : item.to === "/requisitions" && role === "LAB_ASSISTANT" ? "Class Requisitions"
        : item.to === "/purchase-requests" && role === "DEPT_STORE_HEAD" ? "Purchase Approval · Rung 1"
        : item.to === "/purchase-requests" && role === "CENTRAL_STORE_OFFICER" ? "Purchase Approval · Rung 2"
        : item.to === "/purchase-requests" && role === "OFFICE_ADMIN" ? "Purchase Approval · Rung 3"
        : item.to === "/penalties" && role === "SYSTEM_ADMIN" ? "Penalty Configuration"
        : item.label,
    })),
  })).filter((group) => group.items.length), [role]);
  const items = visibleGroups.flatMap((group) => group.items);
  const current = items.find((item) => item.to === location.pathname);
  const results = items.filter((item) => item.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lablink-theme", theme); } catch { /* Preference is optional. */ }
  }, [theme]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  if (!user) return null;

  function signOut() { logout(); navigate("/login", { replace: true }); }
  function goTo(to: string) { navigate(to); setSearchOpen(false); setSearch(""); }

  return <div className="app-shell flex">
    {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}
    <aside id="app-navigation" className={`app-sidebar fixed inset-y-0 left-0 z-50 transition-all duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${collapsed ? "w-[264px] lg:w-[76px]" : "w-[264px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-full flex-col">
        <div className={`flex h-[76px] items-center justify-between gap-2 border-b border-slate-700/60 px-4 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <NavLink to="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="LabLink dashboard">
            <ThemeLogo className="w-11 shrink-0 object-contain" />
            <span className={collapsed ? "lg:hidden" : ""}><strong className="font-display block text-[17px] font-bold tracking-tight"><span className="text-brand-500">Lab</span><span className="text-slate-50">Link</span></strong><small className="block text-[10px] font-semibold uppercase tracking-[.17em] text-slate-400">Lab operations</small></span>
          </NavLink>
          <button type="button" className="rounded-lg p-1.5 text-slate-300 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>
        <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {visibleGroups.map((group) => <div key={group.title}>
            <p className={`app-nav-label mb-2 px-3 ${collapsed ? "lg:hidden" : ""}`}>{group.title}</p>
            <div className="space-y-1">{group.items.map(({ icon: Icon, ...item }) =>
              <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined}
                className={({ isActive }) => `relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${collapsed ? "lg:justify-center" : ""} ${isActive ? "bg-brand-500/15 text-white" : "hover:bg-slate-700/60"}`}>
                <Icon size={18} strokeWidth={1.9} className="shrink-0" /><span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
              </NavLink>)}</div>
          </div>)}
        </nav>
        <div className="border-t border-slate-700/60 p-3"><div className={`flex items-center gap-3 rounded-xl bg-slate-700/40 p-2.5 ${collapsed ? "lg:justify-center" : ""}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-400 font-bold text-slate-950">{user.fullName[0].toUpperCase()}</span>
          <span className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}><strong className="block truncate text-xs text-slate-50">{user.fullName}</strong><small className="block truncate text-[11px] text-slate-300">{formatRole(user.role)}</small></span>
        </div></div>
      </div>
    </aside>
    <div className="flex min-h-screen min-w-0 flex-1 flex-col">
      <header className="app-topbar sticky top-0 z-30 flex h-[76px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" className="app-icon-button" onClick={() => (isDesktop ? setCollapsed((value) => !value) : setMobileOpen(true))} aria-label={isDesktop ? (collapsed ? "Expand sidebar" : "Collapse sidebar") : "Open navigation"} aria-controls="app-navigation" aria-expanded={isDesktop ? !collapsed : mobileOpen}>{isDesktop && !collapsed ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}</button>
          <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.13em] text-[var(--app-muted)]">Workspace / {current?.label ?? "LabLink"}</p><h1 className="truncate text-base font-bold text-[var(--app-ink)] sm:text-lg">{current?.label ?? "Workspace"}</h1></div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => { setSearch(""); setSearchOpen(true); }} className="hidden min-w-[210px] items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 py-2 text-sm text-[var(--app-muted)] transition hover:border-brand-300 md:flex" aria-label="Search pages"><Search size={16} /><span className="flex-1 text-left">Search pages</span><kbd className="rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[10px]">Ctrl K</kbd></button>
          <button type="button" onClick={() => setSearchOpen(true)} className="app-icon-button md:hidden" aria-label="Search pages"><Search size={18} /></button>
          <button type="button" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")} className="app-icon-button" aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          <NotificationBell />
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button type="button" className="app-icon-button hidden !w-auto gap-2 px-2.5 sm:inline-flex" aria-label="Open profile menu"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--app-accent-soft)] text-xs font-bold text-[var(--app-accent)]">{user.fullName[0].toUpperCase()}</span><span className="hidden max-w-24 truncate text-xs font-semibold text-[var(--app-ink)] xl:inline">{user.fullName.split(" ")[0]}</span></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="z-[70] min-w-56 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-[var(--app-ink)] shadow-xl">
              <div className="border-b border-[var(--app-border)] px-3 py-2"><p className="text-sm font-semibold">{user.fullName}</p><p className="text-xs text-[var(--app-muted)]">{formatRole(user.role)} · {user.departmentCode ?? "All departments"}</p></div>
              <DropdownMenu.Item onSelect={() => setTheme((value) => value === "light" ? "dark" : "light")} className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)]">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />} {theme === "light" ? "Dark mode" : "Light mode"}</DropdownMenu.Item>
              <DropdownMenu.Item onSelect={signOut} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-[var(--app-surface-soft)] focus:bg-[var(--app-surface-soft)]"><LogOut size={16} /> Sign out</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button type="button" onClick={signOut} className="flex h-10 items-center gap-1.5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-xs font-semibold text-[var(--app-ink)] transition hover:bg-[var(--app-accent-soft)]" aria-label="Logout"><LogOut size={15} /><span className="hidden sm:inline">Logout</span></button>
        </div>
      </header>
      <main className="app-content flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <AnimatePresence mode="sync" initial={false}><motion.div key={location.pathname}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8, pointerEvents: "none" }} transition={{ duration: .2, ease: "easeOut" }}>{outlet}</motion.div></AnimatePresence>
      </main>
      <footer className="border-t border-[var(--app-border)] px-6 py-4 text-xs text-[var(--app-muted)]">LabLink · Laboratory resource management</footer>
    </div>
    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/50 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-[14vh] z-[81] w-[min(92vw,560px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-ink)] shadow-2xl focus:outline-none">
        <Dialog.Title className="sr-only">Search pages</Dialog.Title>
        <div className="flex items-center gap-3 border-b border-[var(--app-border)] px-4"><Command size={19} className="text-[var(--app-accent)]" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) goTo(results[0].to); }} placeholder="Search pages..." className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--app-muted)]" /><Dialog.Close className="rounded-lg p-1 text-[var(--app-muted)]" aria-label="Close search"><X size={18} /></Dialog.Close></div>
        <div className="max-h-[50vh] overflow-y-auto p-2">{results.length ? results.map(({ icon: Icon, ...item }) => <button key={item.to} type="button" onClick={() => goTo(item.to)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[var(--app-accent-soft)]"><Icon size={17} className="text-[var(--app-accent)]" />{item.label}</button>) : <p className="px-3 py-8 text-center text-sm text-[var(--app-muted)]">No matching page</p>}</div>
        <p className="border-t border-[var(--app-border)] px-4 py-2 text-xs text-[var(--app-muted)]">Use Ctrl + K to open this menu</p>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </div>;
}
