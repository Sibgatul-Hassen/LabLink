import { useQuery } from "@tanstack/react-query";

import { getComponents } from "../api/component.api";
import { useAuthStore } from "../store/authStore";
import type { Role } from "../types";

function formatRole(role: Role): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

interface StatCardProps {
  title: string;
  value: number;
  description: string;
}

function StatCard({ title, value, description }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>

      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>

      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-5 h-8 w-16 rounded bg-slate-200" />
          <div className="mt-4 h-3 w-36 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);

  const {
    data: componentResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["components", "dashboard"],
    queryFn: getComponents,
  });

  if (!user) {
    return null;
  }

  const components = componentResponse?.data ?? [];

  const totalComponents = componentResponse?.total ?? 0;

  const expensiveComponents = components.filter(
    (component) => component.sizeClass === "EXPENSIVE",
  ).length;

  const smallComponents = components.filter(
    (component) => component.sizeClass === "SMALL",
  ).length;

  const lowStockComponents = components.filter(
    (component) =>
      component.stock !== null &&
      component.stock !== undefined &&
      component.stock.onHand <= component.stock.reorderPoint,
  ).length;

  const departmentLabel =
    user.departmentCode ??
    (user.departmentId ? "Assigned Department" : "All Departments");

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Welcome, {user.fullName}
        </h2>

        <p className="mt-2 text-slate-600">
          Here is an overview of the LabLink inventory.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
            {formatRole(user.role)}
          </span>

          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            {departmentLabel}
          </span>
        </div>
      </div>

      {isLoading && <DashboardSkeleton />}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Unable to load component statistics.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Total Components"
            value={totalComponents}
            description="Active components in inventory"
          />

          <StatCard
            title="Expensive Components"
            value={expensiveComponents}
            description="Components classified as expensive"
          />

          <StatCard
            title="Small Components"
            value={smallComponents}
            description="Components classified as small"
          />

          <StatCard
            title="Low Stock"
            value={lowStockComponents}
            description="Stock at or below reorder point"
          />
        </div>
      )}
    </section>
  );
}
