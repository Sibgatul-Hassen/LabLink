import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Boxes, CircleAlert, Cpu, ArrowUpRight, Layers3, ClipboardList, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getComponents } from "../api/component.api";
import { useAuthStore } from "../store/authStore";
import type { Component } from "../types";
import RoleDashboard from "./RoleDashboard";

const colours = ["#4f46e5", "#16a785", "#f59e0b", "#6395e8", "#9f78d8", "#e27791"];

async function loadInventory(): Promise<Component[]> {
  const first = await getComponents({ page: 1, limit: 100 });
  const pages = Math.ceil(first.total / 100);
  if (pages <= 1) return first.data;
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getComponents({ page: index + 2, limit: 100 })));
  return [first, ...rest].flatMap((page) => page.data);
}

function StatCard({ label, value, description, icon: Icon, tone, index }: {
  label: string; value: number; description: string; icon: typeof Boxes; tone: string; index: number;
}) {
  const reduceMotion = useReducedMotion();
  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}
    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between"><p className="text-sm font-semibold text-slate-600">{label}</p><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon size={20} /></span></div>
    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value.toLocaleString()}</p>
    <p className="mt-1 text-xs text-slate-500">{description}</p>
  </motion.div>;
}

function ChartSkeleton() {
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-200" />)}</div><div className="grid gap-5 xl:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-slate-200" /><div className="h-80 animate-pulse rounded-2xl bg-slate-200" /></div></div>;
}

function InventoryDashboard() {
  const user = useAuthStore((state) => state.user);
  const { data: components = [], isLoading, isError } = useQuery({ queryKey: ["components", "dashboard"], queryFn: loadInventory });
  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    components.forEach((component) => counts.set(component.category, (counts.get(component.category) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
  }, [components]);
  const stockData = useMemo(() => components.filter((item) => item.stock).sort((a, b) => (a.stock?.onHand ?? 0) - (b.stock?.onHand ?? 0)).slice(0, 6)
    .map((item) => ({ name: item.code, onHand: item.stock?.onHand ?? 0, reorder: item.stock?.reorderPoint ?? 0 })), [components]);
  const expensive = components.filter((component) => component.sizeClass === "EXPENSIVE").length;
  const low = components.filter((component) => component.stock && component.stock.onHand <= component.stock.reorderPoint).length;
  if (!user) return null;

  return <section className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-indigo-700">Workspace overview</p><h2 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back, {user.fullName.split(" ")[0]}</h2><p className="mt-2 text-sm text-slate-600">A live view of your laboratory inventory and activity.</p>
        <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">{user.role.replace(/_/g, " ")}</span><span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{user.departmentCode ?? "All departments"}</span></div>
      </div>
      <Link to="/requisitions" className="inline-flex w-fit items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700">View requisitions <ArrowUpRight size={16} /></Link>
    </div>

    {isLoading ? <ChartSkeleton /> : isError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Unable to load inventory statistics. Please try again.</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total components" value={components.length} description="Active catalogue items" icon={Boxes} tone="bg-indigo-100 text-indigo-700" index={0} />
        <StatCard label="Expensive items" value={expensive} description="Boards and instruments" icon={Cpu} tone="bg-emerald-100 text-emerald-700" index={1} />
        <StatCard label="Small items" value={components.length - expensive} description="Consumables and accessories" icon={Layers3} tone="bg-sky-100 text-sky-700" index={2} />
        <StatCard label="Low stock" value={low} description="At or below reorder point" icon={CircleAlert} tone="bg-amber-100 text-amber-800" index={3} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-bold text-slate-900">Inventory by category</h3><p className="mt-1 text-xs text-slate-500">Distribution of active components</p></div><BarChart3 size={19} className="text-indigo-600" /></div>
          {categoryData.length ? <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={94} paddingAngle={3} stroke="none" isAnimationActive>{categoryData.map((entry, index) => <Cell key={entry.name} fill={colours[index % colours.length]} />)}</Pie><Tooltip formatter={(count, name) => [`${count} components`, name]} /></PieChart></ResponsiveContainer></div> : <p className="py-20 text-center text-sm text-slate-500">No components yet</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{categoryData.map((entry, index) => <span key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colours[index % colours.length] }} />{entry.name} · {entry.count}</span>)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5"><h3 className="text-base font-bold text-slate-900">Stock attention</h3><p className="mt-1 text-xs text-slate-500">Lowest on-hand quantities and reorder points</p></div>
          {stockData.length ? <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={stockData} margin={{ top: 8, right: 6, left: -24, bottom: 18 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce3ed" /><XAxis dataKey="name" angle={-27} textAnchor="end" height={58} tick={{ fontSize: 10, fill: "#64748b" }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} /><Tooltip /><Bar dataKey="onHand" name="On hand" fill="#4f46e5" radius={[5, 5, 0, 0]} maxBarSize={28} /><Bar dataKey="reorder" name="Reorder point" fill="#16a785" radius={[5, 5, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer></div> : <p className="py-20 text-center text-sm text-slate-500">No stock records yet</p>}
        </div>
      </div>
    </>}
    <div className="grid gap-4 md:grid-cols-3"><Link to="/components" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><Boxes size={20} /></span><span className="flex-1"><strong className="block text-sm text-slate-900">Browse components</strong><small className="text-xs text-slate-500">Search the catalogue</small></span><ArrowUpRight size={16} className="text-slate-400" /></Link><Link to="/sessions" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><CalendarDays size={20} /></span><span className="flex-1"><strong className="block text-sm text-slate-900">Class sessions</strong><small className="text-xs text-slate-500">Upcoming lab schedule</small></span><ArrowUpRight size={16} className="text-slate-400" /></Link><Link to="/requisitions" className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1"><span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-100 text-sky-700"><ClipboardList size={20} /></span><span className="flex-1"><strong className="block text-sm text-slate-900">Requisitions</strong><small className="text-xs text-slate-500">Follow requests and returns</small></span><ArrowUpRight size={16} className="text-slate-400" /></Link></div>
  </section>;
}

export default function Dashboard() {
  const role = useAuthStore((state) => state.user?.role);
  return role === "CENTRAL_STORE_OFFICER" ? <InventoryDashboard /> : <RoleDashboard />;
}
