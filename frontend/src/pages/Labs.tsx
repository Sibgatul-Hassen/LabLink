import axios from "axios";
import { useAppDialog } from "../components/ui/dialog";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getDepartments } from "../api/department.api";
import { getSectionAssignees } from "../api/section.api";
import { createLab, deleteLab, getLabs, updateLab } from "../api/lab.api";
import { useAuthStore } from "../store/authStore";
import type { CreateLabRequest, Lab } from "../types";

interface LabFormState {
  name: string;
  roomNo: string;
  groupSize: string;
  departmentId: string;
  labAssistantId: string;
}

const emptyForm: LabFormState = {
  name: "",
  roomNo: "",
  groupSize: "4",
  departmentId: "",
  labAssistantId: "",
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

export default function Labs() {
  const { confirm } = useAppDialog();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);

  const [form, setForm] = useState<LabFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const limit = 10;
  const canManage = user?.role === "SYSTEM_ADMIN";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["labs", { search, departmentFilter, page, limit }],
    queryFn: () =>
      getLabs({
        search: search.trim() || undefined,
        departmentId: departmentFilter || undefined,
        page,
        limit,
      }),
  });

  const { data: departmentsData } = useQuery({
    queryKey: ["departments", "all"],
    queryFn: () => getDepartments({ limit: 100 }),
  });

  const { data: labAssistants } = useQuery({
    queryKey: ["section-assignees", "LAB_ASSISTANT"],
    queryFn: () => getSectionAssignees("LAB_ASSISTANT"),
  });

  const departments = departmentsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateLabRequest) => {
      if (editingLab) {
        return updateLab(editingLab.id, payload);
      }
      return createLab(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["labs"] });
      closeForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLab,
    onSuccess: async () => {
      setDeleteError("");
      await queryClient.invalidateQueries({ queryKey: ["labs"] });
    },
    onError: (mutationError: unknown) => {
      setDeleteError(getErrorMessage(mutationError));
    },
  });

  function openCreateForm() {
    setEditingLab(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(lab: Lab) {
    setEditingLab(lab);
    setForm({
      name: lab.name,
      roomNo: lab.roomNo,
      groupSize: String(lab.groupSize),
      departmentId: lab.departmentId,
      labAssistantId: lab.labAssistantId ?? "",
    });
    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingLab(null);
    setForm(emptyForm);
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!form.roomNo.trim()) {
      setFormError("Room number is required.");
      return;
    }
    if (!form.departmentId) {
      setFormError("Department is required.");
      return;
    }

    const groupSize = Number(form.groupSize);
    if (!Number.isInteger(groupSize) || groupSize <= 0) {
      setFormError("Group size must be a positive whole number.");
      return;
    }

    const payload: CreateLabRequest = {
      name: form.name.trim(),
      roomNo: form.roomNo.trim(),
      groupSize,
      departmentId: form.departmentId,
      labAssistantId: form.labAssistantId || null,
    };

    saveMutation.mutate(payload);
  }

  async function handleDelete(lab: Lab) {
    const confirmed = await confirm(
      `Delete lab "${lab.name} (${lab.roomNo})"?`,
    );
    if (!confirmed) return;
    setDeleteError("");
    deleteMutation.mutate(lab.id);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Labs</h2>
          <p className="mt-1 text-sm text-slate-500">
            View and manage laboratory rooms and their assigned staff.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Add Lab
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="max-w-md flex-1">
            <label
              htmlFor="lab-search"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>
            <input
              id="lab-search"
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or room number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="sm:w-56">
            <label
              htmlFor="lab-department-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Department
            </label>
            <select
              id="lab-department-filter"
              value={departmentFilter}
              onChange={(event) => {
                setDepartmentFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code}
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
            Loading labs...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No labs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Room
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lab Assistant
                  </th>
                  {canManage && (
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((lab) => (
                  <tr key={lab.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-semibold text-slate-900">
                        {lab.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {lab.roomNo}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {lab.department.code}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {lab.groupSize}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {lab.labAssistant ? lab.labAssistant.fullName : "—"}
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditForm(lab)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(lab)}
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
            {total} lab{total === 1 ? "" : "s"}
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

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingLab ? "Edit Lab" : "Add Lab"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {editingLab
                    ? "Update the lab information."
                    : "Create a new laboratory room."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close lab form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="lab-name"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Name
                </label>
                <input
                  id="lab-name"
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Example: Digital Systems Lab"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label
                  htmlFor="lab-room"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Room Number
                </label>
                <input
                  id="lab-room"
                  type="text"
                  value={form.roomNo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      roomNo: event.target.value,
                    }))
                  }
                  placeholder="Example: 302"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label
                  htmlFor="lab-group-size"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Group Size
                </label>
                <input
                  id="lab-group-size"
                  type="number"
                  min={1}
                  value={form.groupSize}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      groupSize: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label
                  htmlFor="lab-department"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Department
                </label>
                <select
                  id="lab-department"
                  value={form.departmentId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      departmentId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Select a department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code} — {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="lab-assistant"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Lab Assistant
                </label>
                <select
                  id="lab-assistant"
                  value={form.labAssistantId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      labAssistantId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Unassigned</option>
                  {(labAssistants ?? []).map((assistant) => (
                    <option key={assistant.id} value={assistant.id}>
                      {assistant.fullName} ({assistant.email})
                    </option>
                  ))}
                </select>
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
                    : editingLab
                      ? "Save Changes"
                      : "Create Lab"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
