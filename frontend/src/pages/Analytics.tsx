import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getShortageFrequency,
  getLendingNetwork,
  type ShortageFrequencyItem,
  type LendingNetworkEdge,
  type LendingNetworkNode,
} from "../api/analytics.api";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";

function canViewAnalytics(role: Role | undefined): boolean {
  return (
    role === "DEPT_STORE_HEAD" ||
    role === "CENTRAL_STORE_OFFICER" ||
    role === "OFFICE_ADMIN" ||
    role === "SYSTEM_ADMIN"
  );
}

// ─── shortage bar ─────────────────────────────────────────────────────────────

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
      <div className="w-48 flex-shrink-0">
        <p className="truncate text-sm font-medium text-slate-800">
          {item.componentName}
        </p>
        <p className="text-xs text-slate-400">{item.componentCode}</p>
      </div>
      <div className="relative flex-1">
        <div className="h-7 w-full rounded-md bg-slate-100">
          <div
            className={`h-7 rounded-md transition-all duration-500 ${barColour}`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      </div>
      <div className="w-36 flex-shrink-0 text-right text-sm">
        <span className="font-bold text-slate-800">{item.shortageCount}×</span>
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

// ─── summary card ─────────────────────────────────────────────────────────────

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

// ─── lending network view ────────────────────────────────────────────────────

const DEPT_COLOURS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function DeptBadge({
  code,
  colourClass,
}: {
  code: string;
  colourClass: string;
}) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${colourClass}`}
    >
      {code.slice(0, 3)}
    </span>
  );
}

function LendingNetworkView({
  nodes,
  edges,
}: {
  nodes: LendingNetworkNode[];
  edges: LendingNetworkEdge[];
}) {
  const colourMap = new Map<string, string>();
  nodes.forEach((n, i) => {
    colourMap.set(n.id, DEPT_COLOURS[i % DEPT_COLOURS.length]);
  });

  const totalRequests = edges.reduce((s, e) => s + e.requestCount, 0);
  const totalQty = edges.reduce((s, e) => s + e.totalQtyBorrowed, 0);
  const maxRequests = edges.length > 0 ? edges[0].requestCount : 1;

  if (edges.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-slate-400">
        <span className="mb-2 text-4xl">🤝</span>
        <p className="text-sm font-medium">No lending activity yet</p>
        <p className="mt-1 text-xs">
          Completed cross-department borrows will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Departments involved"
          value={nodes.length}
          colour="bg-blue-50 border-blue-200 text-blue-900"
        />
        <SummaryCard
          label="Total borrow requests"
          value={totalRequests}
          sub="completed borrows"
          colour="bg-purple-50 border-purple-200 text-purple-900"
        />
        <SummaryCard
          label="Total units lent"
          value={totalQty}
          sub="across all borrows"
          colour="bg-green-50 border-green-200 text-green-900"
        />
      </div>

      {/* Department legend */}
      <div className="flex flex-wrap gap-3">
        {nodes.map((n) => (
          <span key={n.id} className="flex items-center gap-2 text-sm">
            <DeptBadge
              code={n.code}
              colourClass={colourMap.get(n.id) ?? "bg-slate-400"}
            />
            <span className="text-slate-600">{n.name}</span>
          </span>
        ))}
      </div>

      {/* Edge list — flow diagram style */}
      <div className="space-y-3">
        {edges.map((edge, idx) => {
          const pct =
            maxRequests > 0 ? (edge.requestCount / maxRequests) * 100 : 0;
          const lenderColour =
            colourMap.get(edge.lenderDeptId) ?? "bg-slate-400";
          const borrowerColour =
            colourMap.get(edge.borrowerDeptId) ?? "bg-slate-400";

          return (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              {/* Lender */}
              <div className="flex w-24 flex-shrink-0 flex-col items-center gap-1">
                <DeptBadge
                  code={edge.lenderCode}
                  colourClass={lenderColour}
                />
                <span className="text-center text-xs font-semibold text-slate-700">
                  {edge.lenderCode}
                </span>
                <span className="text-[10px] text-slate-400">lender</span>
              </div>

              {/* Flow bar */}
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{edge.requestCount} request{edge.requestCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{edge.totalQtyBorrowed} units</span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-500"
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                  {/* Arrow indicator */}
                  <span className="absolute right-0 top-0 flex h-3 w-5 items-center justify-center text-[8px] text-slate-500">
                    ▶
                  </span>
                </div>
              </div>

              {/* Borrower */}
              <div className="flex w-24 flex-shrink-0 flex-col items-center gap-1">
                <DeptBadge
                  code={edge.borrowerCode}
                  colourClass={borrowerColour}
                />
                <span className="text-center text-xs font-semibold text-slate-700">
                  {edge.borrowerCode}
                </span>
                <span className="text-[10px] text-slate-400">borrower</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Full lending matrix
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Lender</th>
                <th className="px-4 py-3 text-left">Borrower</th>
                <th className="px-4 py-3 text-right">Requests</th>
                <th className="px-4 py-3 text-right">Units Lent</th>
                <th className="px-4 py-3 text-right">Avg per Request</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {edges.map((edge, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <DeptBadge
                        code={edge.lenderCode}
                        colourClass={
                          colourMap.get(edge.lenderDeptId) ?? "bg-slate-400"
                        }
                      />
                      <span className="text-sm font-medium text-slate-800">
                        {edge.lenderCode}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <DeptBadge
                        code={edge.borrowerCode}
                        colourClass={
                          colourMap.get(edge.borrowerDeptId) ?? "bg-slate-400"
                        }
                      />
                      <span className="text-sm font-medium text-slate-800">
                        {edge.borrowerCode}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-purple-700">
                    {edge.requestCount}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">
                    {edge.totalQtyBorrowed}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-500">
                    {edge.requestCount > 0
                      ? (edge.totalQtyBorrowed / edge.requestCount).toFixed(1)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── shortage frequency view ──────────────────────────────────────────────────

const LIMIT_OPTIONS = [10, 20, 30, 50];

function ShortageFrequencyView() {
  const [limit, setLimit] = useState(20);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["shortage-frequency", limit],
    queryFn: () => getShortageFrequency({ limit }),
  });

  const items = data?.data ?? [];
  const maxCount = items.length > 0 ? items[0].shortageCount : 1;
  const totalShortages = items.reduce((s, i) => s + i.shortageCount, 0);
  const totalQtyShort = items.reduce((s, i) => s + i.totalQtyShort, 0);
  const worstComponent = items[0];

  return (
    <div className="space-y-6">
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

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Shortage frequency by component
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Number of times each component had unmet demand after the
              resolver ran all tiers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="limit-select" className="text-sm text-slate-600">
              Show top:
            </label>
            <select
              id="limit-select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

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

        <div className="divide-y divide-slate-50">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
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
                Shortages appear here once requisitions have been resolved.
              </p>
            </div>
          )}
          {items.map((item) => (
            <ShortageBar key={item.componentId} item={item} maxCount={maxCount} />
          ))}
        </div>
      </div>

      {!isLoading && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                  <tr key={item.componentId} className="hover:bg-slate-50">
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

// ─── main page ───────────────────────────────────────────────────────────────

type Tab = "shortage" | "lending";

export default function Analytics() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("shortage");

  const { data: lendingData, isLoading: lendingLoading } = useQuery({
    queryKey: ["lending-network"],
    queryFn: () => getLendingNetwork(),
    enabled: canViewAnalytics(user?.role) && tab === "lending",
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

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Insights to help manage inventory, quotas, and inter-department
          borrowing effectively.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
        <button
          id="tab-shortage"
          type="button"
          onClick={() => setTab("shortage")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            tab === "shortage"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📊 Shortage Frequency
        </button>
        <button
          id="tab-lending"
          type="button"
          onClick={() => setTab("lending")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
            tab === "lending"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🤝 Lending Network
        </button>
      </div>

      {/* Tab content */}
      {tab === "shortage" && (
        <ShortageFrequencyView />
      )}

      {tab === "lending" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-slate-900">
              Lending network — who lends to whom
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Completed cross-department borrows (status: Handed Over or
              Returned). Thicker flow = more requests.
            </p>
          </div>

          {lendingLoading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          )}

          {!lendingLoading && lendingData && (
            <LendingNetworkView
              nodes={lendingData.nodes}
              edges={lendingData.edges}
            />
          )}
        </div>
      )}
    </div>
  );
}
