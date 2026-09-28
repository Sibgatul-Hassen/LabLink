import type { ChartDatum } from "./Shared";

export function countBy<T>(items: T[], labels: readonly string[], pick: (item: T) => string): ChartDatum[] {
  return labels.map((name) => ({ name, value: items.filter((item) => pick(item) === name).length }));
}

export function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
