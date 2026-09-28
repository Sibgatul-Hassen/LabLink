import axios from "axios";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCourses } from "../api/course.api";
import { getExperiments } from "../api/experiment.api";
import { getLabs } from "../api/lab.api";
import {
  assignSessionExperiment,
  generateSessions,
  getSessions,
} from "../api/session.api";
import { useAuthStore } from "../store/authStore";
import LiveOrderModal from "../components/LiveOrderModal";
import type { ClassSession, SessionStatus } from "../types";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const STATUS_STYLES: Record<SessionStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  RUNNING: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-slate-200 text-slate-600",
};

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

function toDateValue(value: string): string {
  return value.slice(0, 10);
}

export default function ClassSessions() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [labFilter, setLabFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [page, setPage] = useState(1);

  const [horizonDays, setHorizonDays] = useState("21");
  const [generateMessage, setGenerateMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [orderSession, setOrderSession] = useState<ClassSession | null>(null);
  const [orderMessage, setOrderMessage] = useState("");

  const limit = 15;
  const canGenerate = user?.role === "CENTRAL_STORE_OFFICER";
  const isInstructor = user?.role === "INSTRUCTOR";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "sessions",
      { labFilter, courseFilter, fromFilter, toFilter, page, limit },
    ],
    queryFn: () =>
      getSessions({
        labId: labFilter || undefined,
        courseId: courseFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        page,
        limit,
      }),
  });

  const { data: labsData } = useQuery({
    queryKey: ["labs", "all"],
    queryFn: () => getLabs({ limit: 100 }),
  });

  const { data: coursesData } = useQuery({
    queryKey: ["courses", "all"],
    queryFn: () => getCourses({ limit: 100 }),
  });

  const { data: experimentsData } = useQuery({
    queryKey: ["experiments", "all"],
    queryFn: () => getExperiments({ limit: 100 }),
  });

  const labs = labsData?.data ?? [];
  const courses = coursesData?.data ?? [];
  const experiments = experimentsData?.data ?? [];

  const generateMutation = useMutation({
    mutationFn: generateSessions,
    onSuccess: async (result) => {
      setActionError("");
      setGenerateMessage(
        `Generated ${result.created} new session${result.created === 1 ? "" : "s"} for ${result.from} to ${result.to}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (mutationError: unknown) => {
      setGenerateMessage("");
      setActionError(getErrorMessage(mutationError));
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({
      sessionId,
      experimentId,
    }: {
      sessionId: string;
      experimentId: string | null;
    }) => assignSessionExperiment(sessionId, experimentId),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (mutationError: unknown) => {
      setActionError(getErrorMessage(mutationError));
    },
  });

  // Mirrors the server rule: an admin may assign anywhere, an instructor only
  // on sections they teach. The server enforces this regardless; hiding the
  // control just avoids offering an action that would be refused.
  function canAssign(session: ClassSession): boolean {
    if (isInstructor) {
      return session.routineSlot.section.instructorId === user?.id;
    }

    return false;
  }

  function canOrder(session: ClassSession): boolean {
    return (
      canAssign(session) &&
      session.status !== "CANCELLED" &&
      session.status !== "COMPLETED" &&
      new Date(session.endsAt).getTime() > Date.now() &&
      (!session.requisition || session.requisition.status === "DRAFT")
    );
  }

  function handleGenerate() {
    setGenerateMessage("");
    setActionError("");

    const horizon = Number(horizonDays);

    if (!Number.isInteger(horizon) || horizon <= 0) {
      setActionError("Horizon must be a positive whole number of days.");
      return;
    }

    generateMutation.mutate(horizon);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Class Sessions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Dated classes generated from the weekly routine, and the experiment
            each one runs.
          </p>
        </div>

        {canGenerate && (
          <div className="flex items-end gap-3">
            <div className="w-32">
              <label
                htmlFor="session-horizon"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Horizon (days)
              </label>

              <input
                id="session-horizon"
                type="number"
                min={1}
                value={horizonDays}
                onChange={(event) => setHorizonDays(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generateMutation.isPending
                ? "Generating..."
                : "Generate Sessions"}
            </button>
          </div>
        )}
      </div>

      {orderMessage && (
        <div role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {orderMessage}
        </div>
      )}

      {generateMessage && (
        <div
          role="status"
          className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          {generateMessage}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="session-lab-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Lab
            </label>

            <select
              id="session-lab-filter"
              value={labFilter}
              onChange={(event) => {
                setLabFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">All labs</option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name} ({lab.roomNo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="session-course-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Course
            </label>

            <select
              id="session-course-filter"
              value={courseFilter}
              onChange={(event) => {
                setCourseFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="session-from"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              From
            </label>

            <input
              id="session-from"
              type="date"
              value={fromFilter}
              onChange={(event) => {
                setFromFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label
              htmlFor="session-to"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              To
            </label>

            <input
              id="session-to"
              type="date"
              value={toFilter}
              onChange={(event) => {
                setToFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading class sessions...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No class sessions found.{" "}
            {canGenerate
              ? "Use Generate Sessions to create them from the routine."
              : ""}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Course / Section
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lab
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Experiment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  {isInstructor && (
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Order
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((session) => {
                  const courseExperiments = experiments.filter(
                    (experiment) =>
                      experiment.course.id ===
                      session.routineSlot.section.course.id,
                  );

                  return (
                    <tr key={session.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="font-semibold text-slate-900">
                          {toDateValue(session.date)}
                        </span>
                        <div className="text-xs text-slate-500">
                          {DAY_NAMES[session.routineSlot.dayOfWeek]}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {session.routineSlot.startTime} –{" "}
                        {session.routineSlot.endTime}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        <span className="font-medium text-slate-900">
                          {session.routineSlot.section.course.code}
                        </span>{" "}
                        · Section {session.routineSlot.section.name}
                        <div className="text-xs text-slate-500">
                          {session.routineSlot.section.studentCount} students
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {session.routineSlot.lab.name}
                        <div className="text-xs text-slate-500">
                          Room {session.routineSlot.lab.roomNo}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {canAssign(session) ? (
                          <select
                            aria-label={`Experiment for ${session.routineSlot.section.course.code} on ${toDateValue(session.date)}`}
                            value={session.experimentId ?? ""}
                            onChange={(event) =>
                              assignMutation.mutate({
                                sessionId: session.id,
                                experimentId: event.target.value || null,
                              })
                            }
                            disabled={assignMutation.isPending}
                            className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Not assigned</option>
                            {courseExperiments.map((experiment) => (
                              <option key={experiment.id} value={experiment.id}>
                                {experiment.number}. {experiment.title}
                              </option>
                            ))}
                          </select>
                        ) : session.experiment ? (
                          <>
                            <span className="font-medium text-slate-900">
                              {session.experiment.number}.
                            </span>{" "}
                            {session.experiment.title}
                          </>
                        ) : (
                          <span className="text-slate-400">Not assigned</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[session.status]}`}
                        >
                          {session.status}
                        </span>
                      </td>
                      {isInstructor && (
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          {canOrder(session) ? (
                            <button
                              type="button"
                              onClick={() => { setOrderMessage(""); setOrderSession(session); }}
                              className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
                            >
                              {session.requisition ? "Replace draft" : "Order components"}
                            </button>
                          ) : session.requisition ? (
                            <span className="text-slate-500">Already ordered</span>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} class session{total === 1 ? "" : "s"}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>

            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {orderSession && (
        <LiveOrderModal
          key={orderSession.id}
          session={orderSession}
          onClose={() => setOrderSession(null)}
          onOrdered={async (requisition) => {
            setOrderSession(null);
            setOrderMessage(
              "Class order placed: " + requisition.status.replace(/_/g, " ") + ".",
            );
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["sessions"] }),
              queryClient.invalidateQueries({ queryKey: ["requisitions"] }),
            ]);
          }}
        />
      )}
    </div>
  );
}
