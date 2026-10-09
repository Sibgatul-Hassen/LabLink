import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { canOpenPage } from "../../auth/permissions";
import type { User } from "../../types";

export type Metric = {
  title: string;
  value?: number | string;
  detail: string;
  path: string;
  icon: LucideIcon;
  loading?: boolean;
  error?: boolean;
};

export type ChartDatum = { name: string; value: number };
export type Activity = { id: string; title: string; detail: string; badge: string };
export type QuickLink = { title: string; detail: string; path: string; icon: LucideIcon };

export function DashboardFrame({ user, description, children }: {
  user: User; description: string; children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return <motion.section
    initial={reducedMotion ? false : { opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
    transition={{ duration: .24 }}
    className="space-y-6"
  >
    <header className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-sm sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--app-accent)]">{user.role.replace(/_/g, " ")} workspace</p>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-[var(--app-ink)]">Welcome back, {user.fullName.split(" ")[0]}</h2>
      <p className="mt-2 text-sm text-[var(--app-muted)]">{description}</p>
      <span className="mt-4 inline-flex rounded-full bg-[var(--app-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--app-accent)]">{user.departmentCode ?? "University-wide"}</span>
    </header>
    {children}
  </motion.section>;
}

export function MetricGrid({ items, user }: { items: Metric[]; user: User }) {
  const reducedMotion = useReducedMotion();
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Dashboard metrics">
    {items.filter((item) => canOpenPage(user.role, item.path)).map((item, index) => <motion.div
      key={item.title}
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : index * .055, duration: .24 }}
      whileHover={reducedMotion ? undefined : { y: -3 }}
    >
      <Link to={item.path} className="group block h-full rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm transition-colors hover:border-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]">
        <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-[var(--app-muted)]">{item.title}</p><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><item.icon size={19} /></span></div>
        {item.loading ? <div className="mt-4 h-9 w-20 animate-pulse rounded-lg bg-[var(--app-surface-soft)]" aria-label={`Loading ${item.title}`} />
          : <p className="mt-3 text-3xl font-bold tabular-nums text-[var(--app-ink)]">{item.error ? "—" : item.value ?? 0}</p>}
        <p className="mt-1 text-xs text-[var(--app-muted)]">{item.error ? "Unable to load. Open the page to retry." : item.detail}</p>
      </Link>
    </motion.div>)}
  </div>;
}

export function DashboardPanel({ title, description, action, children }: {
  title: string; description: string; action?: ReactNode; children: ReactNode;
}) {
  return <section className="min-w-0 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-base font-bold text-[var(--app-ink)]">{title}</h3>
        <p className="mt-1 text-xs text-[var(--app-muted)]">{description}</p></div>
      {action}
    </div>
    <div className="mt-5">{children}</div>
  </section>;
}

export function BreakdownChart({ title, description, data, loading, error }: {
  title: string; description: string; data: ChartDatum[]; loading: boolean; error: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return <DashboardPanel title={title} description={description}>
    {loading ? <div className="h-60 animate-pulse rounded-xl bg-[var(--app-surface-soft)]" aria-label={`Loading ${title}`} />
      : error ? <p role="alert" className="py-16 text-center text-sm text-[var(--app-muted)]">Unable to load chart data.</p>
        : data.length === 0 || data.every((item) => item.value === 0) ? <p className="py-16 text-center text-sm text-[var(--app-muted)]">No activity in this view yet.</p>
          : <><div className="h-60 w-full min-w-0" role="img" aria-label={`${title}: ${data.map((item) => `${item.name} ${item.value}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, left: -25, bottom: 10 }}>
              <CartesianGrid stroke="var(--app-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "var(--app-muted)", fontSize: 11 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--app-muted)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, color: "var(--app-ink)" }} />
              <Bar dataKey="value" name="Count" fill="var(--app-accent)" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={!reducedMotion} />
            </BarChart></ResponsiveContainer>
          </div><ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--app-muted)]">{data.map((item) => <li key={item.name}>{item.name}: <strong className="text-[var(--app-ink)]">{item.value}</strong></li>)}</ul></>}
  </DashboardPanel>;
}

export function ActivityContent({ items, path, loading, error, emptyText = "Nothing to show yet." }: {
  items: Activity[]; path: string; loading: boolean; error: boolean; emptyText?: string;
}) {
  return <>
    {loading ? <div className="space-y-3" aria-label="Loading activity">{[0, 1, 2].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-[var(--app-surface-soft)]" />)}</div>
      : error ? <p role="alert" className="py-12 text-center text-sm text-[var(--app-muted)]">Unable to load this activity.</p>
        : items.length === 0 ? <p className="py-12 text-center text-sm text-[var(--app-muted)]">{emptyText}</p>
          : <ul className="divide-y divide-[var(--app-border)]">{items.slice(0, 5).map((item) => <li key={item.id} className="py-3 first:pt-0 last:pb-0">
            <Link to={path} className="group flex items-center justify-between gap-3 rounded-lg py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--app-accent)]">
              <span className="min-w-0"><strong className="block truncate text-sm text-[var(--app-ink)] group-hover:text-[var(--app-accent)]">{item.title}</strong><small className="block truncate text-xs text-[var(--app-muted)]">{item.detail}</small></span>
              <span className="shrink-0 rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--app-accent)]">{item.badge.replace(/_/g, " ")}</span>
            </Link>
          </li>)}</ul>}
  </>;
}

export function ActivityPanel({ title, description, items, path, loading, error, emptyText }: {
  title: string; description: string; items: Activity[]; path: string; loading: boolean; error: boolean; emptyText?: string;
}) {
  return <DashboardPanel title={title} description={description}>
    <ActivityContent items={items} path={path} loading={loading} error={error} emptyText={emptyText} />
  </DashboardPanel>;
}

export function QuickLinks({ items, user }: { items: QuickLink[]; user: User }) {
  const visible = items.filter((item) => canOpenPage(user.role, item.path));
  if (!visible.length) return null;
  return <section aria-label="Quick actions"><h3 className="mb-3 text-lg font-bold text-[var(--app-ink)]">Your workspace</h3>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{visible.map((item) => <Link key={item.path} to={item.path} className="group flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--app-accent)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><item.icon size={18} /></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--app-ink)]">{item.title}</strong><small className="block text-xs text-[var(--app-muted)]">{item.detail}</small></span>
      <ArrowUpRight size={16} className="shrink-0 text-[var(--app-muted)] transition group-hover:text-[var(--app-accent)]" />
    </Link>)}</div>
  </section>;
}
