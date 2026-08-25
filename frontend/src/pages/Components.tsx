import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createComponent,
  deleteComponent,
  getComponents,
  updateComponent,
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
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(
    null,
  );

  const [form, setForm] = useState<ComponentFormState>(emptyForm);

  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const limit = 10;

  const canManage =
    user?.role === "CENTRAL_STORE_OFFICER" || user?.role === "SYSTEM_ADMIN";

  const canDelete = user?.role === "SYSTEM_ADMIN";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "components",
      {
        search,
        category,
        page,
        limit,
      },
    ],
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
    queryFn: () =>
      getComponents({
        page: 1,
        limit: 100,
      }),
  });

  const categories = Array.from(
    new Set((categoryData?.data ?? []).map((component) => component.category)),
  ).sort((a, b) => a.localeCompare(b));

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateComponentRequest) => {
      if (editingComponent) {
        return updateComponent(editingComponent.id, payload);
      }

      return createComponent(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["components"],
      });

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

      await queryClient.invalidateQueries({
        queryKey: ["components"],
      });
    },
    onError: (mutationError: unknown) => {
      setDeleteError(getErrorMessage(mutationError));
    },
  });

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

    const payload: CreateComponentRequest = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      sizeClass: form.sizeClass,
      unit: form.unit.trim(),
      unitCost,
      description: form.description.trim() || null,
      isReturnable: form.isReturnable,
    };

    saveMutation.mutate(payload);
  }

  function handleDelete(component: Component) {
    const confirmed = window.confirm(
      `Delete ${component.name} (${component.code})?`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");
    deleteMutation.mutate(component.id);
  }

  if (!user) {
    return null;
  }

  const components = data?.data ?? [];
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Code
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Name
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Category
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Size
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Unit Cost
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Stock
                  </th>

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
                {components.map((component) => (
                  <tr key={component.id} className="hover:bg-slate-50">
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
                          component.stock.onHand <= component.stock.reorderPoint
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
                ))}

                {components.length === 0 && (
                  <tr>
                    <td
                      colSpan={canManage ? 8 : 7}
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
