import axios from "axios";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getPeakClasses } from "../api/analytics.api";
import type { DepartmentPeak } from "../types";

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

function formatMoment(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  const day = date.toISOString().slice(0, 10);
  const time = date.toISOString().slice(11, 16);

  return `${day} at ${time}`;
}

function PeakCard({ entry }: { entry: DepartmentPeak }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {entry.department.code}
          </h3>
          <p className="text-sm text-slate-500">{entry.department.name}</p>
        </div>

        <p className="text-sm text-slate-500">
          {entry.totalSessions} session{entry.totalSessions === 1 ? "" : "s"} in
          range
        </p>
      </div>

      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-600">
            Peak simultaneous classes
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{entry.peak}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatMoment(entry.peakAt)}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-600">
            Peak simultaneous groups
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-900">
            {entry.peakGroups}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatMoment(entry.peakGroupsAt)}
          </p>
        </div>
      </div>

      {entry.peakSessions.length > 0 && (
        <div className="border-t border-slate-100 px-6 py-5">
          <h4 className="mb-3 text-sm font-semibold text-slate-800">
            Running at the busiest moment
          </h4>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {entry.peakSessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="text-slate-700">
                  <span className="font-medium text-slate-900">
                    {session.courseCode}
                  </span>{" "}
                  · Section {session.sectionName}
                  <span className="ml-2 text-xs text-slate-500">
                    {session.labName} (Room {session.roomNo})
                  </span>
                </span>

                <span className="text-xs text-slate-500">
                  {session.studentCount} students ÷ {session.groupSize} ={" "}
                  <span className="font-semibold text-slate-700">
                    {session.groups} groups
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PeakClasses() {
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["peak-classes", { fromFilter, toFilter }],
    queryFn: () =>
      getPeakClasses({
        from: fromFilter || undefined,
        to: toFilter || undefined,
      }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Peak Class Load</h2>
        <p className="mt-1 text-sm text-slate-500">
          The busiest moment in each department's timetable — the figure that
          sizes component quotas.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:w-1/2">
          <div>
            <label
              htmlFor="peak-from"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              From
            </label>

            <input
              id="peak-from"
              type="date"
              value={fromFilter}
              onChange={(event) => setFromFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="peak-to"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              To
            </label>

            <input
              id="peak-to"
              type="date"
              value={toFilter}
              onChange={(event) => setToFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Leave both blank to consider every generated session.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Calculating peak load...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-red-600 shadow-sm">
          {getErrorMessage(error)}
        </div>
      ) : data?.data.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No class sessions in this range. Generate sessions from the Class
          Sessions page first.
        </div>
      ) : (
        <div className="space-y-6">
          {data?.data.map((entry) => (
            <PeakCard key={entry.department.id} entry={entry} />
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-800">How this is used</p>
        <p>
          A department's quota for a component is sized from the busiest moment
          in its timetable: the number of groups running at once, multiplied by
          how many units each group needs. Peak groups is the figure that
          matters — components are issued per group, not per class, so two large
          classes can demand more than three small ones.
        </p>
      </div>
    </div>
  );
}
