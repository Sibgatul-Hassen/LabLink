import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getShortageFrequency,
  type ShortageFrequencyItem,
} from "../api/analytics.api";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";

// Only roles that can view analytics — mirrors /analytics/shortage-frequency
// requireRole guard on the backend.
function canViewAnalytics(role: Role | undefined): boolean {
  return (
    role === "DEPT_STORE_HEAD" ||
    role === "CENTRAL_STORE_OFFICER" ||
    role === "OFFICE_ADMIN" ||
    role === "SYSTEM_ADMIN"
  );
}

// ─── bar chart ───────────────────────────────────────────────────────────────

function ShortageBar({
  item,
  maxCount,
}: {
  item: ShortageFrequencyItem;
  maxCount: number;
}) {
  const pct = maxCount > 0 ? (item.shortageCount / maxCount) * 100 : 0;

  const barColour =
    item.shortageCount >= 5
      ? "bg-red-500"
      : item.shortageCount >= 3
        ? "bg-amber-500"
        : "bg-blue-400";

  return (
    <div className="flex items-center gap-3 py-2">
      {/* Component info */}
      <div className="w-48 flex-shrink-0">
        <p className="truncate text-sm font-medium text-slate-800">
          {item.componentName}
        </p>
        <p className="text-xs text-slate-400">{item.componentCode}</p>
      </div>

      {/* Bar */}
      <div className="relative flex-1">
        <div className="h-7 w-full rounded-md bg-slate-100">
          <div
            className={`h-7 rounded-md transition-all duration-500 ${barColour}`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="w-36 flex-shrink-0 text-right text-sm">
        <span className="font-bold text-slate-800">
          {item.shortageCount}×
        </span>
        <span className="ml-2 text-xs text-slate-400">
          ({item.totalQtyShort} {item.unit} total)
        </span>
      </div>
    </div>
  );
}

// ─── skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-9 w-48 animate-pulse rounded-md bg-slate-100" />
      <div className="h-7 flex-1 animate-pulse rounded-md bg-slate-100" />
      <div className="h-5 w-28 animate-pulse rounded-md bg-slate-100" />
    </div>
  );
}

// ─── summary cards ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  colour,
}: {
  label: string;
  value: string | number;
  sub?: string;
  colour: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${colour}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

const LIMIT_OPTIONS = [10, 20, 30, 50];

export default function Analytics() {
  const user = useAuthStore((s) => s.user);
  const [limit, setLimit] = useState(20);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shortage-frequency", limit],
    queryFn: () => getShortageFrequency({ limit }),
    enabled: canViewAnalytics(user?.role),
  });

  if (!user) return null;

  if (!canViewAnalytics(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500">
        <span className="mb-3 text-5xl">🔒</span>
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="mt-1 text-sm">
          Analytics are available to store heads and office staff only.
        </p>
      </div>
    );
  }

  const items = data?.data ?? [];
  const maxCount = items.length > 0 ? items[0].shortageCount : 1;
  const totalShortages = items.reduce((s, i) => s + i.shortageCount, 0);
  const totalQtyShort = items.reduce((s, i) => s + i.totalQtyShort, 0);
  const worstComponent = items[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Analytics — Shortage Frequency
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Components ranked by how often they ran short across all
          requisitions. Use this to prioritise reorder points and quota
          adjustments.
        </p>
      </div>

      {/* Summary cards */}
      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            label="Components with shortages"
            value={data?.total ?? 0}
            colour="bg-slate-50 border-slate-200 text-slate-800"
          />
          <SummaryCard
            label="Total shortage events"
            value={totalShortages}
            sub="across all components"
            colour="bg-amber-50 border-amber-200 text-amber-900"
          />
          <SummaryCard
            label="Total units short"
            value={totalQtyShort}
            sub="cumulative quantity"
            colour="bg-red-50 border-red-200 text-red-900"
          />
          <SummaryCard
            label="Most problematic"
            value={worstComponent?.componentCode ?? "—"}
            sub={`${worstComponent?.shortageCount ?? 0} shortage events`}
            colour="bg-purple-50 border-purple-200 text-purple-900"
          />
        </div>
      )}

      {/* Chart section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Shortage frequency by component
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Number of times each component had unmet demand after the
              resolver ran all 4 tiers
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="limit-select"
              className="text-sm text-slate-600"
            >
              Show top:
            </label>
            <select
              id="limit-select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Colour legend */}
        <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-red-500" />
            5+ events (critical)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-amber-500" />
            3–4 events (high)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-blue-400" />
            1–2 events (low)
          </span>
        </div>

        {/* Bars */}
        <div className="divide-y divide-slate-50">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}

          {isError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              Failed to load analytics. Please refresh.
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <span className="mb-2 text-4xl">📊</span>
              <p className="text-sm font-medium">No shortage data yet</p>
              <p className="mt-1 text-xs">
                Shortages appear here once requisitions have been submitted
                and resolved.
              </p>
            </div>
          )}

          {items.map((item) => (
            <ShortageBar
              key={item.componentId}
              item={item}
              maxCount={maxCount}
            />
          ))}
        </div>
      </div>

      {/* Detail table */}
      {!isLoading && items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Detailed breakdown
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Component</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Shortage Events</th>
                  <th className="px-4 py-3 text-right">Total Qty Short</th>
                  <th className="px-4 py-3 text-right">Avg per Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => (
                  <tr
                    key={item.componentId}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-slate-400">
                      #{idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {item.componentName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.componentCode}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.category}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-bold ${
                          item.shortageCount >= 5
                            ? "text-red-600"
                            : item.shortageCount >= 3
                              ? "text-amber-600"
                              : "text-blue-600"
                        }`}
                      >
                        {item.shortageCount}×
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">
                      {item.totalQtyShort} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-500">
                      {item.avgQtyShort.toFixed(1)} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
