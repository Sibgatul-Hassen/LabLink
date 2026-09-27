import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getComponents } from "../api/component.api";
import { getDepartments } from "../api/department.api";
import {
  getQuotaHistory,
  getQuotas,
  updateQuota,
} from "../api/quota.api";
import { useAuthStore } from "../store/authStore";
import QuotaSuggestionDialog from "../components/QuotaSuggestionDialog";
import type {
  DepartmentQuota,
  UpdateQuotaRequest,
} from "../types";

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

export default function Quotas() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [page, setPage] = useState(1);

  const [editingQuota, setEditingQuota] =
    useState<DepartmentQuota | null>(null);
  const [creatingQuota, setCreatingQuota] = useState(false);

  const [formDepartmentId, setFormDepartmentId] = useState("");
  const [formComponentId, setFormComponentId] = useState("");
  const [qty, setQty] = useState("");
  const [suggestedQty, setSuggestedQty] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

  const [historyQuota, setHistoryQuota] =
    useState<DepartmentQuota | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const limit = 10;

  const canManage =
    user?.role === "CENTRAL_STORE_OFFICER";

  const canViewAllDepartments =
    user?.role === "CENTRAL_STORE_OFFICER" ||
    user?.role === "OFFICE_ADMIN";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "quotas",
      {
        search,
        category,
        departmentId,
        page,
        limit,
      },
    ],
    queryFn: () =>
      getQuotas({
        search: search.trim() || undefined,
        category: category || undefined,
        departmentId:
          canViewAllDepartments && departmentId
            ? departmentId
            : undefined,
        page,
        limit,
      }),
  });

  const { data: componentData } = useQuery({
    queryKey: ["quota-components"],
    queryFn: () =>
      getComponents({
        page: 1,
        limit: 100,
      }),
  });

  const { data: departmentData } = useQuery({
    queryKey: ["quota-departments"],
    queryFn: () =>
      getDepartments({
        page: 1,
        limit: 100,
      }),
    enabled: canViewAllDepartments,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: [
      "quota-history",
      historyQuota?.departmentId,
      historyQuota?.componentId,
    ],
    queryFn: () =>
      getQuotaHistory(
        historyQuota!.departmentId,
        historyQuota!.componentId,
        {
          page: 1,
          limit: 20,
        },
      ),
    enabled: Boolean(historyQuota),
  });

  const components = (componentData?.data ?? []).filter(
    (component) => component.isActive,
  );

  const departments = (departmentData?.data ?? []).filter(
    (department) => department.isActive,
  );

  const categories = Array.from(
    new Set(components.map((component) => component.category)),
  ).sort((a, b) => a.localeCompare(b));

  const quotaMutation = useMutation({
    mutationFn: ({
      targetDepartmentId,
      targetComponentId,
      requestData,
    }: {
      targetDepartmentId: string;
      targetComponentId: string;
      requestData: UpdateQuotaRequest;
    }) =>
      updateQuota(
        targetDepartmentId,
        targetComponentId,
        requestData,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["quotas"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["quota-history"],
      });

      closeQuotaForm();
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  function resetFormValues() {
    setFormDepartmentId("");
    setFormComponentId("");
    setQty("");
    setSuggestedQty("");
    setReason("");
    setFormError("");
  }

  function openCreateForm() {
    setEditingQuota(null);
    setCreatingQuota(true);
    setFormDepartmentId(departmentId || departments[0]?.id || "");
    setFormComponentId(components[0]?.id || "");
    setQty("");
    setSuggestedQty("");
    setReason("");
    setFormError("");
  }

  function openEditForm(quota: DepartmentQuota) {
    setCreatingQuota(false);
    setEditingQuota(quota);
    setFormDepartmentId(quota.departmentId);
    setFormComponentId(quota.componentId);
    setQty(String(quota.qty));
    setSuggestedQty(String(quota.suggestedQty));
    setReason("");
    setFormError("");
  }

  function closeQuotaForm() {
    setEditingQuota(null);
    setCreatingQuota(false);
    resetFormValues();
  }

  function submitQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetDepartmentId = editingQuota
      ? editingQuota.departmentId
      : formDepartmentId;

    const targetComponentId = editingQuota
      ? editingQuota.componentId
      : formComponentId;

    if (!targetDepartmentId || !targetComponentId) {
      setFormError("Department and component are required.");
      return;
    }

    const requestData: UpdateQuotaRequest = {};

    if (qty.trim() !== "") {
      const parsedQty = Number(qty);

      if (!Number.isInteger(parsedQty) || parsedQty < 0) {
        setFormError(
          "Confirmed quota must be a non-negative integer.",
        );
        return;
      }

      requestData.qty = parsedQty;
    }

    if (suggestedQty.trim() !== "") {
      const parsedSuggestedQty = Number(suggestedQty);

      if (
        !Number.isInteger(parsedSuggestedQty) ||
        parsedSuggestedQty < 0
      ) {
        setFormError(
          "Suggested quota must be a non-negative integer.",
        );
        return;
      }

      requestData.suggestedQty = parsedSuggestedQty;
    }

    if (
      requestData.qty === undefined &&
      requestData.suggestedQty === undefined
    ) {
      setFormError("Enter at least one quota value.");
      return;
    }

    const oldQty = editingQuota?.qty ?? 0;

    if (
      requestData.qty !== undefined &&
      requestData.qty !== oldQty &&
      !reason.trim()
    ) {
      setFormError(
        "Reason is required when confirmed quota changes.",
      );
      return;
    }

    if (reason.trim()) {
      requestData.reason = reason.trim();
    }

    setFormError("");

    quotaMutation.mutate({
      targetDepartmentId,
      targetComponentId,
      requestData,
    });
  }

  if (!user) {
    return null;
  }

  const quotas = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const quotaFormOpen = creatingQuota || editingQuota !== null;

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            Department Quotas
          </h2>

          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            View suggested and confirmed component quota caps for each
            department. Physical stock remains tracked separately in Stock
            Management.
          </p>
        </div>

        {canManage && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSuggestionsOpen(true)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Generate Suggestions</button>
          <button type="button" onClick={openCreateForm} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Set New Quota</button>
        </div>}
      </div>

      <div
        className={`mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${
          canViewAllDepartments
            ? "sm:grid-cols-3"
            : "sm:grid-cols-2"
        }`}
      >
        <div>
          <label
            htmlFor="quota-search"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Search
          </label>

          <input
            id="quota-search"
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Department or component"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="quota-category"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Category
          </label>

          <select
            id="quota-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Categories</option>

            {categories.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {categoryName}
              </option>
            ))}
          </select>
        </div>

        {canViewAllDepartments && (
          <div>
            <label
              htmlFor="quota-department"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Department
            </label>

            <select
              id="quota-department"
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">All Departments</option>

              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} — {department.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading quotas...
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {getErrorMessage(error)}
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Department",
                    "Code",
                    "Component",
                    "Category",
                    "Suggested",
                    "Confirmed",
                    "On Hand",
                    "Spare",
                    "Confirmed At",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {quotas.map((quota) => (
                  <tr key={quota.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900">
                      {quota.department.code}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-900">
                      {quota.component.code}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-800">
                      {quota.component.name}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {quota.component.category}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {quota.suggestedQty}
                    </td>

                    <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                      {quota.qty}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {quota.component.stock?.onHand ?? "—"}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {quota.component.stock?.spareQty ?? "—"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                      {quota.confirmedAt
                        ? new Date(quota.confirmedAt).toLocaleString()
                        : "Not confirmed"}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setHistoryQuota(quota)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          History
                        </button>

                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openEditForm(quota)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {quotas.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No quota records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600">
              Showing {quotas.length} of {total} quota records
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                Previous
              </button>

              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {quotaFormOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submitQuota}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-xl font-bold text-slate-900">
              {editingQuota ? "Edit Department Quota" : "Set New Quota"}
            </h3>

            <p className="mt-1 text-sm text-slate-600">
              Confirmed quota is a department cap. It does not reserve or
              deduct physical stock immediately.
            </p>

            {formError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <label
              htmlFor="quota-form-department"
              className="mt-5 block text-sm font-medium text-slate-700"
            >
              Department
            </label>

            {editingQuota ? (
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {editingQuota.department.code} —{" "}
                {editingQuota.department.name}
              </div>
            ) : (
              <select
                id="quota-form-department"
                value={formDepartmentId}
                onChange={(event) =>
                  setFormDepartmentId(event.target.value)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select department</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.code} — {department.name}
                  </option>
                ))}
              </select>
            )}

            <label
              htmlFor="quota-form-component"
              className="mt-4 block text-sm font-medium text-slate-700"
            >
              Component
            </label>

            {editingQuota ? (
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {editingQuota.component.code} —{" "}
                {editingQuota.component.name}
              </div>
            ) : (
              <select
                id="quota-form-component"
                value={formComponentId}
                onChange={(event) =>
                  setFormComponentId(event.target.value)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Select component</option>

                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.code} — {component.name}
                  </option>
                ))}
              </select>
            )}

            <label
              htmlFor="quota-suggested"
              className="mt-4 block text-sm font-medium text-slate-700"
            >
              Suggested quota
            </label>

            <input
              id="quota-suggested"
              type="number"
              min="0"
              step="1"
              value={suggestedQty}
              onChange={(event) =>
                setSuggestedQty(event.target.value)
              }
              placeholder="Optional"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <label
              htmlFor="quota-confirmed"
              className="mt-4 block text-sm font-medium text-slate-700"
            >
              Confirmed quota
            </label>

            <input
              id="quota-confirmed"
              type="number"
              min="0"
              step="1"
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <label
              htmlFor="quota-reason"
              className="mt-4 block text-sm font-medium text-slate-700"
            >
              Reason for confirmed quota change
            </label>

            <textarea
              id="quota-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required only when confirmed quota changes"
              className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeQuotaForm}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={quotaMutation.isPending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {quotaMutation.isPending ? "Saving..." : "Save Quota"}
              </button>
            </div>
          </form>
        </div>
      )}

      {historyQuota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Quota History
                </h3>

                <p className="mt-1 text-sm text-slate-600">
                  {historyQuota.department.code} ·{" "}
                  {historyQuota.component.code} —{" "}
                  {historyQuota.component.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryQuota(null)}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            {historyLoading ? (
              <p className="mt-6 text-sm text-slate-500">
                Loading history...
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {(historyData?.data ?? []).map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row">
                      <span className="font-semibold text-slate-900">
                        {entry.oldQty} → {entry.newQty}
                      </span>

                      <span className="text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-700">
                      {entry.reason}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Changed by{" "}
                      {entry.changedBy?.fullName ??
                        entry.changedById}
                    </p>
                  </div>
                ))}

                {(historyData?.data ?? []).length === 0 && (
                  <p className="text-sm text-slate-500">
                    No confirmed quota changes recorded.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {canManage && <QuotaSuggestionDialog open={suggestionsOpen} onClose={() => setSuggestionsOpen(false)} departments={departments} components={components} defaultDepartmentId={departmentId} />}
    </section>
  );
}
