import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, List } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Component } from "../../types";
import { ActivityContent, DashboardPanel, type ChartDatum } from "./Shared";

const categoryColors = ["#4f46e5", "#0f9f82", "#f59e0b", "#5b8def", "#9b71d6", "#e67298"];
type StockedComponent = Component & { stock: NonNullable<Component["stock"]> };

export function InventoryCategoryChart({ data, loading, error }: {
  data: ChartDatum[]; loading: boolean; error: boolean;
}) {
  const reducedMotion = useReducedMotion();
  return <DashboardPanel title="Inventory by category" description="Distribution of active components">
    {loading ? <div className="h-64 animate-pulse rounded-xl bg-[var(--app-surface-soft)]" aria-label="Loading inventory categories" />
      : error ? <p role="alert" className="py-16 text-center text-sm text-[var(--app-muted)]">Unable to load inventory categories.</p>
        : data.length === 0 ? <p className="py-16 text-center text-sm text-[var(--app-muted)]">No active components yet.</p>
          : <><div className="h-64 w-full min-w-0" role="img" aria-label={`Inventory by category: ${data.map((item) => `${item.name} ${item.value}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%"><PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={64} outerRadius={100} paddingAngle={2} stroke="var(--app-surface)" strokeWidth={2} isAnimationActive={!reducedMotion}>
                {data.map((item, index) => <Cell key={item.name} fill={categoryColors[index % categoryColors.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, color: "var(--app-ink)" }} />
            </PieChart></ResponsiveContainer>
          </div><ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--app-muted)]">{data.map((item, index) => <li key={item.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} />
            {item.name}: <strong className="text-[var(--app-ink)]">{item.value}</strong>
          </li>)}</ul></>}
  </DashboardPanel>;
}

export function StockAttentionPanel({ items, lowStockCount, loading, error }: {
  items: StockedComponent[]; lowStockCount: number; loading: boolean; error: boolean;
}) {
  const [view, setView] = useState<"list" | "chart">("list");
  const reducedMotion = useReducedMotion();
  const chartData = items.map((item) => ({ code: item.code, onHand: item.stock.onHand, reorderPoint: item.stock.reorderPoint }));
  const activity = items.map((item) => {
    const { onHand, reorderPoint } = item.stock;
    const margin = onHand - reorderPoint;
    return { id: item.id, title: item.name, detail: `${item.code} · ${onHand} on hand · reorder at ${reorderPoint}`, badge: margin <= 0 ? "Reorder now" : `${margin} above` };
  });
  const nextView = view === "list" ? "chart" : "list";
  const description = loading ? "Checking current stock levels"
    : error ? "Stock levels are temporarily unavailable"
      : items.length === 0 ? "No stock records are available yet"
        : lowStockCount ? "Low stock first, then items nearest their reorder point"
          : "No low-stock items; showing the nearest to reorder point";
  return <DashboardPanel title="Stock attention"
    description={description}
    action={<button type="button" onClick={() => setView(nextView)} aria-label={`Show stock ${nextView}`} aria-pressed={view === "chart"}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[var(--app-ink)] transition-colors hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]">
      {view === "list" ? <BarChart3 size={16} /> : <List size={16} />}{view === "list" ? "Show chart" : "Show list"}
    </button>}
  >
      <motion.div key={view} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>
        {view === "list" ? <ActivityContent items={activity} path="/stocks" loading={loading} error={error} emptyText="No stock records are available yet." />
          : loading ? <div className="h-64 animate-pulse rounded-xl bg-[var(--app-surface-soft)]" aria-label="Loading stock chart" />
            : error ? <p role="alert" className="py-16 text-center text-sm text-[var(--app-muted)]">Unable to load stock chart.</p>
              : chartData.length === 0 ? <p className="py-16 text-center text-sm text-[var(--app-muted)]">No stock records are available yet.</p>
                : <><div className="h-64 w-full min-w-0" role="img" aria-label={`Stock attention: ${chartData.map((item) => `${item.code} ${item.onHand} on hand, reorder at ${item.reorderPoint}`).join("; ")}`}>
                  <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 6, right: 4, left: -25, bottom: 28 }}>
                    <CartesianGrid stroke="var(--app-border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="code" tick={{ fill: "var(--app-muted)", fontSize: 10 }} angle={-28} textAnchor="end" height={56} interval={0} tickFormatter={(code: string) => code.length > 12 ? `${code.slice(0, 11)}…` : code} />
                    <YAxis allowDecimals={false} tick={{ fill: "var(--app-muted)", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, color: "var(--app-ink)" }} />
                    <Bar dataKey="onHand" name="On hand" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reducedMotion} />
                    <Bar dataKey="reorderPoint" name="Reorder point" fill="#0f9f82" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reducedMotion} />
                  </BarChart></ResponsiveContainer>
                </div><div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--app-muted)]">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#4f46e5]" />On hand</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#0f9f82]" />Reorder point</span>
                </div></>}
      </motion.div>
  </DashboardPanel>;
}
