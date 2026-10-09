import axios from "axios";
import { useAppDialog } from "../components/ui/dialog";
import { Fragment, type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addComponentSubstitute,
  createComponent,
  deleteComponent,
  deleteComponentSubstitute,
  getComponents,
  getComponentSubstitutes,
  updateComponent,
  downloadComponentsCsv,
} from "../api/component.api";
import { useAuthStore } from "../store/authStore";
import type { Component, CreateComponentRequest } from "../types";

interface ComponentFormState {
  code: string;
  name: string;
  category: string;
  sizeClass: "EXPENSIVE" | "SMALL";
  unit: string;
  unitCost: string;
  description: string;
  isReturnable: boolean;
}

type SortField = "code" | "name" | "category" | "sizeClass" | "unitCost" | "stock";

const emptyForm: ComponentFormState = {
  code: "",
  name: "",
  category: "",
  sizeClass: "SMALL",
  unit: "pcs",
  unitCost: "",
  description: "",
  isReturnable: true,
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

function getStockStatus(component: Component): string {
  if (!component.stock) {
    return "No stock record";
  }
  if (component.stock.onHand <= component.stock.reorderPoint) {
    return "Low stock";
  }
  return "In stock";
}

export default function Components() {
  const { confirm } = useAppDialog();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(
    null,
  );
  const [form, setForm] = useState<ComponentFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newSubstituteId, setNewSubstituteId] = useState("");
  const [newSubstituteRatio, setNewSubstituteRatio] = useState("1");
  const [newSubstituteNotes, setNewSubstituteNotes] = useState("");
  const [substituteError, setSubstituteError] = useState("");

  const limit = 10;
  const canManage =
    user?.role === "CENTRAL_STORE_OFFICER";
  const canDelete = user?.role === "CENTRAL_STORE_OFFICER";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["components", { search, category, page, limit }],
    queryFn: () =>
      getComponents({
        search: search.trim() || undefined,
        category: category.trim() || undefined,
        page,
        limit,
      }),
  });

  const { data: categoryData } = useQuery({
    queryKey: ["components", "categories"],
    queryFn: () => getComponents({ page: 1, limit: 100 }),
  });

  const { data: substitutesData } = useQuery({
    queryKey: ["substitutes", expandedId],
    queryFn: () => getComponentSubstitutes(expandedId!),
    enabled: expandedId !== null,
  });

  const { data: allComponentsData } = useQuery({
    queryKey: ["components", "all"],
    queryFn: () => getComponents({ limit: 100 }),
    enabled: expandedId !== null,
  });

  const categories = Array.from(
    new Set((categoryData?.data ?? []).map((c) => c.category)),
  ).sort((a, b) => a.localeCompare(b));

  const substitutes = substitutesData?.data ?? [];
  const allComponents = allComponentsData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateComponentRequest) => {
      if (editingComponent) {
        return updateComponent(editingComponent.id, payload);
      }
      return createComponent(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      closeForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteComponent,
    onSuccess: async () => {
      setDeleteError("");
      await queryClient.invalidateQueries({ queryKey: ["components"] });
    },
    onError: (mutationError: unknown) => {
      setDeleteError(getErrorMessage(mutationError));
    },
  });

  const addSubstituteMutation = useMutation({
    mutationFn: ({
      componentId,
      data,
    }: {
      componentId: string;
      data: { substituteId: string; ratio: number; notes?: string | null };
    }) => addComponentSubstitute(componentId, data),
    onSuccess: async () => {
      setSubstituteError("");
      setNewSubstituteId("");
      setNewSubstituteRatio("1");
      setNewSubstituteNotes("");
      await queryClient.invalidateQueries({
        queryKey: ["substitutes", expandedId],
      });
    },
    onError: (mutationError: unknown) => {
      setSubstituteError(getErrorMessage(mutationError));
    },
  });

  const deleteSubstituteMutation = useMutation({
    mutationFn: ({
      componentId,
      subId,
    }: {
      componentId: string;
      subId: string;
    }) => deleteComponentSubstitute(componentId, subId),
    onSuccess: async () => {
      setSubstituteError("");
      await queryClient.invalidateQueries({
        queryKey: ["substitutes", expandedId],
      });
    },
    onError: (mutationError: unknown) => {
      setSubstituteError(getErrorMessage(mutationError));
    },
  });

  function toggleExpanded(componentId: string) {
    setSubstituteError("");
    setNewSubstituteId("");
    setNewSubstituteRatio("1");
    setNewSubstituteNotes("");
    setExpandedId((current) => (current === componentId ? null : componentId));
  }

  function handleAddSubstitute(componentId: string) {
    setSubstituteError("");
    if (!newSubstituteId) {
      setSubstituteError("Select a substitute component.");
      return;
    }
    const ratio = Number(newSubstituteRatio);
    if (!Number.isInteger(ratio) || ratio <= 0) {
      setSubstituteError("Ratio must be a positive whole number.");
      return;
    }
    addSubstituteMutation.mutate({
      componentId,
      data: {
        substituteId: newSubstituteId,
        ratio,
        notes: newSubstituteNotes.trim() || null,
      },
    });
  }

  function openCreateForm() {
    setEditingComponent(null);
    setForm(emptyForm);
    setFormError("");
    setIsFormOpen(true);
  }

  function openEditForm(component: Component) {
    setEditingComponent(component);
    setForm({
      code: component.code,
      name: component.name,
      category: component.category,
      sizeClass: component.sizeClass,
      unit: component.unit,
      unitCost: component.unitCost === null ? "" : String(component.unitCost),
      description: component.description ?? "",
      isReturnable: component.isReturnable,
    });
    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingComponent(null);
    setForm(emptyForm);
    setFormError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!form.code.trim()) {
      setFormError("Code is required.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!form.category.trim()) {
      setFormError("Category is required.");
      return;
    }
    if (!form.unit.trim()) {
      setFormError("Unit is required.");
      return;
    }

    let unitCost: number | null = null;
    if (form.unitCost.trim()) {
      unitCost = Number(form.unitCost);
      if (Number.isNaN(unitCost) || unitCost < 0) {
        setFormError("Unit cost must be a non-negative number.");
        return;
      }
    }

    saveMutation.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      sizeClass: form.sizeClass,
      unit: form.unit.trim(),
      unitCost,
      description: form.description.trim() || null,
      isReturnable: form.isReturnable,
    });
  }

  async function handleDelete(component: Component) {
    const confirmed = await confirm(
      `Delete ${component.name} (${component.code})?`,
    );
    if (!confirmed) return;
    setDeleteError("");
    deleteMutation.mutate(component.id);
  }

  if (!user) return null;

  const components = data?.data ?? [];
  const sortedComponents = [...components].sort((left, right) => {
    const value = (item: Component): string | number => {
      if (sortField === "stock") return item.stock?.onHand ?? -1;
      if (sortField === "unitCost") return item.unitCost === null ? -1 : Number(item.unitCost);
      return item[sortField];
    };
    const a = value(left);
    const b = value(right);
    const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return sortDirection === "ascending" ? result : -result;
  });
  function sortBy(field: SortField) {
    if (field === sortField) setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
    else { setSortField(field); setSortDirection("ascending"); }
  }
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Components
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            View and manage LabLink inventory components.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              downloadComponentsCsv({
                search: search.trim() || undefined,
                category: category.trim() || undefined,
              }).catch(() => alert("Failed to download CSV"));
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Export CSV
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Add Component
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <div>
          <label
            htmlFor="component-search"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Search
          </label>
          <input
            id="component-search"
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by code or name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </div>
        <div>
          <label
            htmlFor="category-filter"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Category
          </label>
          <select
            id="category-filter"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          >
            <option value="">All Categories</option>
            {categories.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {categoryName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {deleteError}
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading components...
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {getErrorMessage(error)}
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-12 px-4 py-3" />
                  {([ ["code", "Code"], ["name", "Name"], ["category", "Category"], ["sizeClass", "Size"], ["unitCost", "Unit Cost"], ["stock", "Stock"] ] as const).map(([field, label]) => (
                    <th key={field} aria-sort={sortField === field ? sortDirection : "none"} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <button type="button" onClick={() => sortBy(field)} className="inline-flex items-center gap-1 hover:text-[var(--app-accent)]" title={`Sort visible rows by ${label}`}>
                        {label}<span aria-hidden="true" className="text-[10px]">{sortField === field ? sortDirection === "ascending" ? "↑" : "↓" : "↕"}</span>
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  {canManage && (
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {sortedComponents.map((component) => (
                  <Fragment key={component.id}>
                    <tr key={component.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(component.id)}
                          aria-expanded={expandedId === component.id}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          {expandedId === component.id ? "−" : "+"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900">
                        {component.code}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-800">
                        {component.name}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {component.category}
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {component.sizeClass}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                        {component.unitCost === null
                          ? "—"
                          : `${component.unitCost}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                        {component.stock ? component.stock.onHand : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            component.stock &&
                            component.stock.onHand <=
                              component.stock.reorderPoint
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {getStockStatus(component)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditForm(component)}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                              Edit
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                disabled={deleteMutation.isPending}
                                onClick={() => handleDelete(component)}
                                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {expandedId === component.id && (
                      <tr
                        key={`${component.id}-substitutes`}
                        className="bg-slate-50"
                      >
                        <td colSpan={canManage ? 9 : 8} className="px-6 py-5">
                          <h4 className="mb-3 text-sm font-semibold text-slate-800">
                            Substitute components
                          </h4>

                          {substitutes.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No substitutes defined yet.
                            </p>
                          ) : (
                            <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                              {substitutes.map((sub) => (
                                <li
                                  key={sub.id}
                                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                                >
                                  <span className="min-w-0 flex-1 text-sm text-slate-700">
                                    <span className="font-medium text-slate-900">
                                      {sub.substitute.code}
                                    </span>
                                    {" — "}
                                    {sub.substitute.name}
                                    <span className="ml-2 text-xs text-slate-500">
                                      ratio: {sub.ratio}
                                    </span>
                                    {sub.notes && (
                                      <span className="ml-2 text-xs text-slate-400">
                                        ({sub.notes})
                                      </span>
                                    )}
                                  </span>
                                  {canManage && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        deleteSubstituteMutation.mutate({
                                          componentId: component.id,
                                          subId: sub.id,
                                        })
                                      }
                                      disabled={
                                        deleteSubstituteMutation.isPending
                                      }
                                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {canManage && (
                            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
                              <div className="min-w-[16rem] flex-1">
                                <label
                                  htmlFor={`sub-component-${component.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Substitute Component
                                </label>
                                <select
                                  id={`sub-component-${component.id}`}
                                  value={newSubstituteId}
                                  onChange={(e) =>
                                    setNewSubstituteId(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                >
                                  <option value="">Select a component</option>
                                  {allComponents
                                    .filter((c) => c.id !== component.id)
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.code} — {c.name}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="w-24">
                                <label
                                  htmlFor={`sub-ratio-${component.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Ratio
                                </label>
                                <input
                                  id={`sub-ratio-${component.id}`}
                                  type="number"
                                  min={1}
                                  value={newSubstituteRatio}
                                  onChange={(e) =>
                                    setNewSubstituteRatio(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                />
                              </div>

                              <div className="min-w-[12rem] flex-1">
                                <label
                                  htmlFor={`sub-notes-${component.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Notes (optional)
                                </label>
                                <input
                                  id={`sub-notes-${component.id}`}
                                  type="text"
                                  value={newSubstituteNotes}
                                  onChange={(e) =>
                                    setNewSubstituteNotes(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleAddSubstitute(component.id)
                                }
                                disabled={addSubstituteMutation.isPending}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Add Substitute
                              </button>
                            </div>
                          )}

                          {substituteError && (
                            <div
                              role="alert"
                              className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                            >
                              {substituteError}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {components.length === 0 && (
                  <tr>
                    <td
                      colSpan={canManage ? 9 : 8}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No components found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-600">
              Showing {components.length} of {total} component
              {total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-xl font-bold text-slate-900">
                {editingComponent ? "Edit Component" : "Add Component"}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md px-3 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {formError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="code"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Code
                  </label>
                  <input
                    id="code"
                    type="text"
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="name"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="category"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Category
                  </label>
                  <input
                    id="category"
                    type="text"
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sizeClass"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Size Class
                  </label>
                  <select
                    id="sizeClass"
                    value={form.sizeClass}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        sizeClass: event.target.value as "EXPENSIVE" | "SMALL",
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="SMALL">Small</option>
                    <option value="EXPENSIVE">Expensive</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="unit"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Unit
                  </label>
                  <input
                    id="unit"
                    type="text"
                    value={form.unit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="unitCost"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Unit Cost
                  </label>
                  <input
                    id="unitCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitCost}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        unitCost: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isReturnable}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isReturnable: event.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Returnable component
              </label>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : editingComponent
                      ? "Save Changes"
                      : "Create Component"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
