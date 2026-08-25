import axios from "axios";
import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  adjustStock,
  getStockMovements,
  getStocks,
  updateReorderPoint,
} from "../api/stock.api";
import { useAuthStore } from "../store/authStore";
import type { Stock } from "../types";

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

export default function Stocks() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [adjustingStock, setAdjustingStock] = useState<Stock | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustError, setAdjustError] = useState("");

  const [reorderStock, setReorderStock] = useState<Stock | null>(null);
  const [reorderPoint, setReorderPoint] = useState("");
  const [reorderError, setReorderError] = useState("");

  const [historyStock, setHistoryStock] = useState<Stock | null>(null);

  const limit = 10;

  const canManage =
    user?.role === "CENTRAL_STORE_OFFICER" ||
    user?.role === "SYSTEM_ADMIN";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "stocks",
      {
        search,
        category,
        lowStockOnly,
        page,
        limit,
      },
    ],
    queryFn: () =>
      getStocks({
        search: search.trim() || undefined,
        category: category.trim() || undefined,
        lowStockOnly: lowStockOnly || undefined,
        page,
        limit,
      }),
  });

  const { data: categoryData } = useQuery({
    queryKey: ["stocks", "categories"],
    queryFn: () =>
      getStocks({
        page: 1,
        limit: 100,
      }),
  });

  const { data: movementData, isLoading: movementsLoading } = useQuery({
    queryKey: ["stock-movements", historyStock?.componentId],
    queryFn: () =>
      getStockMovements(historyStock!.componentId, {
        page: 1,
        limit: 20,
      }),
    enabled: Boolean(historyStock),
  });

  const categories = Array.from(
    new Set((categoryData?.data ?? []).map((stock) => stock.component.category)),
  ).sort((a, b) => a.localeCompare(b));

  const adjustMutation = useMutation({
    mutationFn: ({
      componentId,
      qty,
      note,
    }: {
      componentId: string;
      qty: number;
      note?: string;
    }) =>
      adjustStock(componentId, {
        qty,
        note,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stocks"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["components"],
      });

      closeAdjustForm();
    },
    onError: (mutationError: unknown) => {
      setAdjustError(getErrorMessage(mutationError));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({
      componentId,
      value,
    }: {
      componentId: string;
      value: number;
    }) =>
      updateReorderPoint(componentId, {
        reorderPoint: value,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["stocks"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["components"],
      });

      closeReorderForm();
    },
    onError: (mutationError: unknown) => {
      setReorderError(getErrorMessage(mutationError));
    },
  });

  function openAdjustForm(stock: Stock) {
    setAdjustingStock(stock);
    setAdjustQty("");
    setAdjustNote("");
    setAdjustError("");
  }

  function closeAdjustForm() {
    setAdjustingStock(null);
    setAdjustQty("");
    setAdjustNote("");
    setAdjustError("");
  }

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!adjustingStock) {
      return;
    }

    const qty = Number(adjustQty);

    if (!Number.isInteger(qty) || qty === 0) {
      setAdjustError("Quantity must be a non-zero integer.");
      return;
    }

    setAdjustError("");

    adjustMutation.mutate({
      componentId: adjustingStock.componentId,
      qty,
      note: adjustNote.trim() || undefined,
    });
  }

  function openReorderForm(stock: Stock) {
    setReorderStock(stock);
    setReorderPoint(String(stock.reorderPoint));
    setReorderError("");
  }

  function closeReorderForm() {
    setReorderStock(null);
    setReorderPoint("");
    setReorderError("");
  }

  function submitReorderPoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reorderStock) {
      return;
    }

    const value = Number(reorderPoint);

    if (!Number.isInteger(value) || value < 0) {
      setReorderError("Reorder point must be a non-negative integer.");
      return;
    }

    setReorderError("");

    reorderMutation.mutate({
      componentId: reorderStock.componentId,
      value,
    });
  }

  if (!user) {
    return null;
  }

  const stocks = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">
          Stock Management
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          View physical inventory, spare quantities, reorder levels and stock
          adjustment history.
        </p>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div>
          <label
            htmlFor="stock-search"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Search
          </label>

          <input
            id="stock-search"
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by code or name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="stock-category"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Category
          </label>

          <select
            id="stock-category"
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

        <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(event) => {
              setLowStockOnly(event.target.checked);
              setPage(1);
            }}
          />
          Low stock only
        </label>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading stock...
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
                    "Code",
                    "Component",
                    "Category",
                    "On Hand",
                    "Spare",
                    "Reorder",
                    "Status",
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
                {stocks.map((stock) => {
                  const low = stock.onHand <= stock.reorderPoint;

                  return (
                    <tr key={stock.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                        {stock.component.code}
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-800">
                        {stock.component.name}
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-600">
                        {stock.component.category}
                      </td>

                      <td className="px-4 py-4 text-sm font-semibold text-slate-900">
                        {stock.onHand}
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-600">
                        {stock.spareQty}
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-600">
                        {stock.reorderPoint}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            low
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {low ? "Low stock" : "In stock"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setHistoryStock(stock)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            History
                          </button>

                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => openAdjustForm(stock)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Adjust
                              </button>

                              <button
                                type="button"
                                onClick={() => openReorderForm(stock)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Reorder
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {stocks.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      No stock records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Showing {stocks.length} of {total} stock records
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

      {adjustingStock && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submitAdjustment}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-xl font-bold text-slate-900">
              Adjust Stock
            </h3>

            <p className="mt-1 text-sm text-slate-600">
              {adjustingStock.component.code} —{" "}
              {adjustingStock.component.name}
            </p>

            {adjustError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {adjustError}
              </div>
            )}

            <label className="mt-5 block text-sm font-medium text-slate-700">
              Quantity adjustment
            </label>

            <input
              type="number"
              value={adjustQty}
              onChange={(event) => setAdjustQty(event.target.value)}
              placeholder="Example: 5 or -3"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <label className="mt-4 block text-sm font-medium text-slate-700">
              Note
            </label>

            <textarea
              value={adjustNote}
              onChange={(event) => setAdjustNote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeAdjustForm}>
                Cancel
              </button>

              <button
                type="submit"
                disabled={adjustMutation.isPending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Save Adjustment
              </button>
            </div>
          </form>
        </div>
      )}

      {reorderStock && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submitReorderPoint}
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-xl font-bold text-slate-900">
              Update Reorder Point
            </h3>

            {reorderError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {reorderError}
              </div>
            )}

            <input
              type="number"
              min="0"
              value={reorderPoint}
              onChange={(event) => setReorderPoint(event.target.value)}
              className="mt-5 w-full rounded-lg border border-slate-300 px-3 py-2"
            />

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={closeReorderForm}>
                Cancel
              </button>

              <button
                type="submit"
                disabled={reorderMutation.isPending}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {historyStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Stock Movement History
                </h3>

                <p className="text-sm text-slate-600">
                  {historyStock.component.code}
                </p>
              </div>

              <button type="button" onClick={() => setHistoryStock(null)}>
                Close
              </button>
            </div>

            {movementsLoading ? (
              <p className="mt-6 text-sm text-slate-500">
                Loading history...
              </p>
            ) : (
              <div className="mt-6 space-y-3">
                {(movementData?.data ?? []).map((movement) => (
                  <div
                    key={movement.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex justify-between gap-4">
                      <span className="font-semibold text-slate-900">
                        {movement.type} {movement.qty > 0 ? "+" : ""}
                        {movement.qty}
                      </span>

                      <span className="text-xs text-slate-500">
                        {new Date(movement.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      By {movement.performedBy.fullName}
                    </p>

                    {movement.note && (
                      <p className="mt-1 text-sm text-slate-600">
                        {movement.note}
                      </p>
                    )}
                  </div>
                ))}

                {(movementData?.data ?? []).length === 0 && (
                  <p className="text-sm text-slate-500">
                    No movement history found.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}