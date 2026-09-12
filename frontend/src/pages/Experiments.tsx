import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getComponents } from "../api/component.api";
import { getCourses } from "../api/course.api";
import {
  addExperimentItem,
  createExperiment,
  deleteExperiment,
  deleteExperimentItem,
  getExperiments,
  updateExperiment,
  updateExperimentItem,
} from "../api/experiment.api";
import { useAuthStore } from "../store/authStore";
import type { CreateExperimentRequest, Experiment } from "../types";

interface ExperimentFormState {
  courseId: string;
  number: string;
  title: string;
}

const emptyForm: ExperimentFormState = {
  courseId: "",
  number: "",
  title: "",
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

export default function Experiments() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [page, setPage] = useState(1);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExperiment, setEditingExperiment] = useState<Experiment | null>(
    null,
  );
  const [form, setForm] = useState<ExperimentFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const [newItemComponentId, setNewItemComponentId] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [itemError, setItemError] = useState("");

  const [deleteError, setDeleteError] = useState("");

  const limit = 10;
  const canManage = user?.role === "SYSTEM_ADMIN";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["experiments", { search, courseFilter, page, limit }],
    queryFn: () =>
      getExperiments({
        search: search.trim() || undefined,
        courseId: courseFilter || undefined,
        page,
        limit,
      }),
  });

  const { data: coursesData } = useQuery({
    queryKey: ["courses", "all"],
    queryFn: () => getCourses({ limit: 100 }),
  });

  const { data: componentsData } = useQuery({
    queryKey: ["components", "all"],
    queryFn: () => getComponents({ limit: 100 }),
  });

  const courses = coursesData?.data ?? [];
  const components = componentsData?.data ?? [];

  async function refreshExperiments() {
    await queryClient.invalidateQueries({ queryKey: ["experiments"] });
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateExperimentRequest) => {
      if (editingExperiment) {
        return updateExperiment(editingExperiment.id, payload);
      }

      return createExperiment(payload);
    },
    onSuccess: async () => {
      await refreshExperiments();
      closeForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExperiment,
    onSuccess: async () => {
      setDeleteError("");
      await refreshExperiments();
    },
    onError: (mutationError: unknown) => {
      setDeleteError(getErrorMessage(mutationError));
    },
  });

  const addItemMutation = useMutation({
    mutationFn: ({
      experimentId,
      componentId,
      qtyPerGroup,
    }: {
      experimentId: string;
      componentId: string;
      qtyPerGroup: number;
    }) => addExperimentItem(experimentId, { componentId, qtyPerGroup }),
    onSuccess: async () => {
      setItemError("");
      setNewItemComponentId("");
      setNewItemQty("1");
      await refreshExperiments();
    },
    onError: (mutationError: unknown) => {
      setItemError(getErrorMessage(mutationError));
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      experimentId,
      itemId,
      qtyPerGroup,
    }: {
      experimentId: string;
      itemId: string;
      qtyPerGroup: number;
    }) => updateExperimentItem(experimentId, itemId, { qtyPerGroup }),
    onSuccess: async (_result, variables) => {
      setItemError("");
      setItemDrafts((current) => {
        const next = { ...current };
        delete next[variables.itemId];
        return next;
      });
      await refreshExperiments();
    },
    onError: (mutationError: unknown) => {
      setItemError(getErrorMessage(mutationError));
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({
      experimentId,
      itemId,
    }: {
      experimentId: string;
      itemId: string;
    }) => deleteExperimentItem(experimentId, itemId),
    onSuccess: async () => {
      setItemError("");
      await refreshExperiments();
    },
    onError: (mutationError: unknown) => {
      setItemError(getErrorMessage(mutationError));
    },
  });

  function toggleExpanded(experimentId: string) {
    setItemError("");
    setNewItemComponentId("");
    setNewItemQty("1");
    setItemDrafts({});
    setExpandedId((current) =>
      current === experimentId ? null : experimentId,
    );
  }

  function openCreateForm() {
    setEditingExperiment(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(experiment: Experiment) {
    setEditingExperiment(experiment);

    setForm({
      courseId: experiment.courseId,
      number: String(experiment.number),
      title: experiment.title,
    });

    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingExperiment(null);
    setForm(emptyForm);
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.courseId) {
      setFormError("Course is required.");
      return;
    }

    const number = Number(form.number);

    if (!Number.isInteger(number) || number <= 0) {
      setFormError("Experiment number must be a positive whole number.");
      return;
    }

    if (!form.title.trim()) {
      setFormError("Title is required.");
      return;
    }

    saveMutation.mutate({
      courseId: form.courseId,
      number,
      title: form.title.trim(),
    });
  }

  function handleDelete(experiment: Experiment) {
    const confirmed = window.confirm(
      `Delete experiment ${experiment.number} — "${experiment.title}"? Its item list will be removed too.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");
    deleteMutation.mutate(experiment.id);
  }

  function handleAddItem(experimentId: string) {
    setItemError("");

    if (!newItemComponentId) {
      setItemError("Select a component to add.");
      return;
    }

    const qty = Number(newItemQty);

    if (!Number.isInteger(qty) || qty <= 0) {
      setItemError("Quantity per group must be at least 1.");
      return;
    }

    addItemMutation.mutate({
      experimentId,
      componentId: newItemComponentId,
      qtyPerGroup: qty,
    });
  }

  function handleSaveItem(experimentId: string, itemId: string) {
    setItemError("");

    const qty = Number(itemDrafts[itemId]);

    if (!Number.isInteger(qty) || qty <= 0) {
      setItemError("Quantity per group must be at least 1.");
      return;
    }

    updateItemMutation.mutate({ experimentId, itemId, qtyPerGroup: qty });
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Experiments</h2>
          <p className="mt-1 text-sm text-slate-500">
            Experiments per course, and the components each one needs per group.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Add Experiment
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="max-w-md flex-1">
            <label
              htmlFor="experiment-search"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>

            <input
              id="experiment-search"
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by title or course code"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="sm:w-64">
            <label
              htmlFor="experiment-course-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Course
            </label>

            <select
              id="experiment-course-filter"
              value={courseFilter}
              onChange={(event) => {
                setCourseFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code}
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
            Loading experiments...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No experiments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-12 px-4 py-3" />
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    No.
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Items
                  </th>
                  {canManage && (
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((experiment) => (
                  <>
                    <tr key={experiment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(experiment.id)}
                          aria-expanded={expandedId === experiment.id}
                          aria-label={
                            expandedId === experiment.id
                              ? "Hide item list"
                              : "Show item list"
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          {expandedId === experiment.id ? "−" : "+"}
                        </button>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">
                        {experiment.course.code}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {experiment.number}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {experiment.title}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {experiment.items.length}
                      </td>

                      {canManage && (
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditForm(experiment)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(experiment)}
                              disabled={deleteMutation.isPending}
                              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {expandedId === experiment.id && (
                      <tr
                        key={`${experiment.id}-items`}
                        className="bg-slate-50"
                      >
                        <td colSpan={canManage ? 6 : 5} className="px-6 py-5">
                          <h4 className="mb-3 text-sm font-semibold text-slate-800">
                            Item list — quantity per group
                          </h4>

                          {experiment.items.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No components on this item list yet.
                            </p>
                          ) : (
                            <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                              {experiment.items.map((item) => {
                                const draft = itemDrafts[item.id];
                                const isDirty =
                                  draft !== undefined &&
                                  draft !== String(item.qtyPerGroup);

                                return (
                                  <li
                                    key={item.id}
                                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                                  >
                                    <span className="min-w-0 flex-1 text-sm text-slate-700">
                                      <span className="font-medium text-slate-900">
                                        {item.component.code}
                                      </span>{" "}
                                      — {item.component.name}
                                    </span>

                                    {canManage ? (
                                      <>
                                        <input
                                          type="number"
                                          min={1}
                                          aria-label={`Quantity per group for ${item.component.code}`}
                                          value={
                                            draft ?? String(item.qtyPerGroup)
                                          }
                                          onChange={(event) =>
                                            setItemDrafts((current) => ({
                                              ...current,
                                              [item.id]: event.target.value,
                                            }))
                                          }
                                          className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        />

                                        <span className="text-xs text-slate-500">
                                          / group
                                        </span>

                                        {isDirty && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleSaveItem(
                                                experiment.id,
                                                item.id,
                                              )
                                            }
                                            disabled={
                                              updateItemMutation.isPending
                                            }
                                            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Save
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            deleteItemMutation.mutate({
                                              experimentId: experiment.id,
                                              itemId: item.id,
                                            })
                                          }
                                          disabled={
                                            deleteItemMutation.isPending
                                          }
                                          className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Remove
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-sm text-slate-700">
                                        {item.qtyPerGroup} {item.component.unit}{" "}
                                        / group
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {canManage && (
                            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
                              <div className="min-w-[16rem] flex-1">
                                <label
                                  htmlFor={`add-item-component-${experiment.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Component
                                </label>

                                <select
                                  id={`add-item-component-${experiment.id}`}
                                  value={newItemComponentId}
                                  onChange={(event) =>
                                    setNewItemComponentId(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                >
                                  <option value="">Select a component</option>
                                  {components.map((component) => (
                                    <option
                                      key={component.id}
                                      value={component.id}
                                    >
                                      {component.code} — {component.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="w-32">
                                <label
                                  htmlFor={`add-item-qty-${experiment.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Qty / group
                                </label>

                                <input
                                  id={`add-item-qty-${experiment.id}`}
                                  type="number"
                                  min={1}
                                  value={newItemQty}
                                  onChange={(event) =>
                                    setNewItemQty(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleAddItem(experiment.id)}
                                disabled={addItemMutation.isPending}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Add Item
                              </button>
                            </div>
                          )}

                          {itemError && (
                            <div
                              role="alert"
                              className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                            >
                              {itemError}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} experiment{total === 1 ? "" : "s"}
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
                  {editingExperiment ? "Edit Experiment" : "Add Experiment"}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {editingExperiment
                    ? "Update the experiment details."
                    : "Create an experiment, then add its components from the item list."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close experiment form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="experiment-course"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Course
                </label>

                <select
                  id="experiment-course"
                  value={form.courseId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      courseId: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} — {course.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="experiment-number"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Experiment Number
                </label>

                <input
                  id="experiment-number"
                  type="number"
                  min={1}
                  value={form.number}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      number: event.target.value,
                    }))
                  }
                  placeholder="Example: 4"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="experiment-title"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Title
                </label>

                <input
                  id="experiment-title"
                  type="text"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Example: PWM and Servo Control"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
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
                    : editingExperiment
                      ? "Save Changes"
                      : "Create Experiment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
