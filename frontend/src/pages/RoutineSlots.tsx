import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getLabs } from "../api/lab.api";
import { getSections } from "../api/section.api";
import {
  createRoutineSlot,
  deleteRoutineSlot,
  getRoutineSlots,
  importRoutineSlots,
  updateRoutineSlot,
} from "../api/routine-slot.api";
import { useAuthStore } from "../store/authStore";
import type {
  CreateRoutineSlotRequest,
  ImportRoutineSlotsResult,
  RoutineSlot,
} from "../types";

// UIU's week starts on Sunday, matching dayOfWeek 0 in the schema.
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const CSV_HEADER =
  "courseCode,sectionName,semester,dayOfWeek,startTime,endTime,roomNo,effectiveFrom,effectiveTo";

const STATUS_STYLES: Record<string, string> = {
  created: "bg-green-100 text-green-700",
  skipped: "bg-slate-200 text-slate-600",
  failed: "bg-red-100 text-red-700",
};

interface RoutineSlotFormState {
  sectionId: string;
  labId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const emptyForm: RoutineSlotFormState = {
  sectionId: "",
  labId: "",
  dayOfWeek: "0",
  startTime: "08:30",
  endTime: "11:30",
  effectiveFrom: "",
  effectiveTo: "",
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

// The API returns ISO timestamps; <input type="date"> needs YYYY-MM-DD.
function toDateInputValue(value: string): string {
  return value.slice(0, 10);
}

export default function RoutineSlots() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [labFilter, setLabFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<RoutineSlot | null>(null);

  const [form, setForm] = useState<RoutineSlotFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importResult, setImportResult] =
    useState<ImportRoutineSlotsResult | null>(null);
  const [importError, setImportError] = useState("");

  const limit = 10;
  const canManage = user?.role === "SYSTEM_ADMIN";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["routine-slots", { labFilter, dayFilter, page, limit }],
    queryFn: () =>
      getRoutineSlots({
        labId: labFilter || undefined,
        dayOfWeek: dayFilter === "" ? undefined : Number(dayFilter),
        page,
        limit,
      }),
  });

  const { data: sectionsData } = useQuery({
    queryKey: ["sections", "all"],
    queryFn: () => getSections({ limit: 100 }),
  });

  const { data: labsData } = useQuery({
    queryKey: ["labs", "all"],
    queryFn: () => getLabs({ limit: 100 }),
  });

  const sections = sectionsData?.data ?? [];
  const labs = labsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateRoutineSlotRequest) => {
      if (editingSlot) {
        return updateRoutineSlot(editingSlot.id, payload);
      }

      return createRoutineSlot(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["routine-slots"] });
      closeForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRoutineSlot,
    onSuccess: async () => {
      setDeleteError("");
      await queryClient.invalidateQueries({ queryKey: ["routine-slots"] });
    },
    onError: (mutationError: unknown) => {
      setDeleteError(getErrorMessage(mutationError));
    },
  });

  const importMutation = useMutation({
    mutationFn: importRoutineSlots,
    onSuccess: async (result) => {
      setImportError("");
      setImportResult(result);
      await queryClient.invalidateQueries({ queryKey: ["routine-slots"] });
    },
    // A rejection here means the file itself was unusable. Row-level problems
    // arrive as a successful response with failed rows inside it.
    onError: (mutationError: unknown) => {
      setImportResult(null);
      setImportError(getErrorMessage(mutationError));
    },
  });

  function openCreateForm() {
    setEditingSlot(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(slot: RoutineSlot) {
    setEditingSlot(slot);

    setForm({
      sectionId: slot.sectionId,
      labId: slot.labId,
      dayOfWeek: String(slot.dayOfWeek),
      startTime: slot.startTime,
      endTime: slot.endTime,
      effectiveFrom: toDateInputValue(slot.effectiveFrom),
      effectiveTo: toDateInputValue(slot.effectiveTo),
    });

    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingSlot(null);
    setForm(emptyForm);
    setFormError("");
  }

  function openImport() {
    setCsvText("");
    setImportResult(null);
    setImportError("");
    setIsImportOpen(true);
  }

  function closeImport() {
    setIsImportOpen(false);
    setCsvText("");
    setImportResult(null);
    setImportError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.sectionId) {
      setFormError("Section is required.");
      return;
    }

    if (!form.labId) {
      setFormError("Lab is required.");
      return;
    }

    if (!form.startTime || !form.endTime) {
      setFormError("Start and end times are required.");
      return;
    }

    if (form.startTime >= form.endTime) {
      setFormError("Start time must be before end time.");
      return;
    }

    if (!form.effectiveFrom || !form.effectiveTo) {
      setFormError("Effective dates are required.");
      return;
    }

    if (form.effectiveFrom > form.effectiveTo) {
      setFormError(
        "Effective from date must be on or before the effective to date.",
      );
      return;
    }

    const payload: CreateRoutineSlotRequest = {
      sectionId: form.sectionId,
      labId: form.labId,
      dayOfWeek: Number(form.dayOfWeek),
      startTime: form.startTime,
      endTime: form.endTime,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo,
    };

    saveMutation.mutate(payload);
  }

  function handleDelete(slot: RoutineSlot) {
    const confirmed = window.confirm(
      `Delete the ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime} slot for ${slot.section.course.code} Section ${slot.section.name}?`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");
    deleteMutation.mutate(slot.id);
  }

  function handleImport() {
    setImportError("");

    if (!csvText.trim()) {
      setImportError("Paste some CSV content first.");
      return;
    }

    importMutation.mutate(csvText);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Routine Slots</h2>
          <p className="mt-1 text-sm text-slate-500">
            Weekly lab timetable — which section meets in which lab, and when.
          </p>
        </div>

        {canManage && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={openImport}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Import CSV
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Add Routine Slot
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="sm:w-64">
            <label
              htmlFor="routine-lab-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Lab
            </label>

            <select
              id="routine-lab-filter"
              value={labFilter}
              onChange={(event) => {
                setLabFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All labs</option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name} ({lab.roomNo})
                </option>
              ))}
            </select>
          </div>

          <div className="sm:w-56">
            <label
              htmlFor="routine-day-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Day
            </label>

            <select
              id="routine-day-filter"
              value={dayFilter}
              onChange={(event) => {
                setDayFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All days</option>
              {DAY_NAMES.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {deleteError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading routine slots...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No routine slots found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Day
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
                    Effective
                  </th>
                  {canManage && (
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((slot) => (
                  <tr key={slot.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-semibold text-slate-900">
                        {DAY_NAMES[slot.dayOfWeek]}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {slot.startTime} – {slot.endTime}
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">
                        {slot.section.course.code}
                      </span>{" "}
                      · Section {slot.section.name}
                      <div className="text-xs text-slate-500">
                        {slot.section.semester}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {slot.lab.name}
                      <div className="text-xs text-slate-500">
                        Room {slot.lab.roomNo} · {slot.lab.department.code}
                      </div>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {toDateInputValue(slot.effectiveFrom)} →{" "}
                      {toDateInputValue(slot.effectiveTo)}
                    </td>

                    {canManage && (
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(slot)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(slot)}
                            disabled={deleteMutation.isPending}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} routine slot{total === 1 ? "" : "s"}
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

      {isImportOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Import Routine CSV
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Paste the routine below. Each row is imported independently —
                  one bad row will not stop the rest.
                </p>
              </div>

              <button
                type="button"
                onClick={closeImport}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close import panel"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="routine-csv"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  CSV content
                </label>

                <textarea
                  id="routine-csv"
                  rows={10}
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  spellCheck={false}
                  placeholder={`${CSV_HEADER}\nCSE 3216,A,Spring 2026,2,08:30,11:30,302,2026-08-01,2026-12-20`}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-xs outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600">
                <p className="mb-1 font-semibold text-slate-800">Format</p>
                <p className="mb-2 break-all font-mono">{CSV_HEADER}</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Day of week: 0 = Sunday through 6 = Saturday</li>
                  <li>Times: 24-hour, zero padded, e.g. 08:30</li>
                  <li>Dates: YYYY-MM-DD</li>
                  <li>
                    Courses, sections and rooms must already exist — the import
                    looks them up, it does not create them
                  </li>
                  <li>Values containing commas are not supported</li>
                </ul>
              </div>

              {importError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {importError}
                </div>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
                      {importResult.total} row
                      {importResult.total === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-lg bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700">
                      {importResult.created} created
                    </span>
                    <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">
                      {importResult.skipped} skipped
                    </span>
                    <span className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700">
                      {importResult.failed} failed
                    </span>
                    {importResult.warnings > 0 && (
                      <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
                        {importResult.warnings} warning
                        {importResult.warnings === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                            Line
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                            Row
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                            Detail
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 bg-white">
                        {importResult.rows.map((row) => (
                          <tr key={row.line}>
                            <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                              {row.line}
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              {row.courseCode ?? "—"}
                              {row.sectionName ? ` · ${row.sectionName}` : ""}
                              {row.roomNo ? (
                                <span className="text-xs text-slate-500">
                                  {" "}
                                  · Room {row.roomNo}
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-4 py-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[row.status]}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {row.message}
                              {row.warning && (
                                <div className="mt-1 text-xs text-amber-700">
                                  {row.warning}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeImport}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importMutation.isPending ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingSlot ? "Edit Routine Slot" : "Add Routine Slot"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {editingSlot
                    ? "Update the weekly timetable entry."
                    : "Schedule a section into a lab for a weekly time slot."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close routine slot form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="routine-section"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Section
                </label>

                <select
                  id="routine-section"
                  value={form.sectionId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sectionId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a section</option>
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.course.code} — Section {section.name} (
                      {section.semester})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="routine-lab"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Lab
                </label>

                <select
                  id="routine-lab"
                  value={form.labId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      labId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a lab</option>
                  {labs.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name} (Room {lab.roomNo})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="routine-day"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Day of Week
                </label>

                <select
                  id="routine-day"
                  value={form.dayOfWeek}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dayOfWeek: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {DAY_NAMES.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="routine-start"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Start Time
                  </label>

                  <input
                    id="routine-start"
                    type="time"
                    value={form.startTime}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="routine-end"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    End Time
                  </label>

                  <input
                    id="routine-end"
                    type="time"
                    value={form.endTime}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="routine-effective-from"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Effective From
                  </label>

                  <input
                    id="routine-effective-from"
                    type="date"
                    value={form.effectiveFrom}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        effectiveFrom: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="routine-effective-to"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Effective To
                  </label>

                  <input
                    id="routine-effective-to"
                    type="date"
                    value={form.effectiveTo}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        effectiveTo: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingSlot
                      ? "Save Changes"
                      : "Create Routine Slot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
