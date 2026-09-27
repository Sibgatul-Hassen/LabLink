import axios from "axios";
import { useAppDialog } from "../components/ui/dialog";
import { Fragment, type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decidePurchaseRequest,
  getPurchaseRequestQueue,
  getPurchaseRequests,
  receivePurchaseGoods,
} from "../api/purchase.api";
import { useAuthStore } from "../store/authStore";
import PurchaseActions from "../components/PurchaseActions";
import type {
  ApprovalDecision,
  ApprovalStep,
  PurchaseRequest,
  PurchaseStatus,
  Role,
  Urgency,
} from "../types";

const STATUS_STYLES: Record<PurchaseStatus, string> = {
  PENDING: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  RECEIVED: "bg-slate-200 text-slate-600",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

// Per the brief: CRITICAL=red, HIGH=orange, NORMAL=yellow, LOW=green.
const URGENCY_STYLES: Record<Urgency, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  NORMAL: "bg-yellow-100 text-yellow-700",
  LOW: "bg-green-100 text-green-700",
};

const DECISION_STYLES: Record<ApprovalDecision, string> = {
  PENDING: "bg-slate-200 text-slate-600",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  ESCALATED: "bg-amber-100 text-amber-800",
};

/**
 * Mirrors GET /purchase-requests/queue's requireRole guard.
 */
function canViewQueue(role: Role | undefined): boolean {
  return (
    role === "CENTRAL_STORE_OFFICER" ||
    role === "DEPT_STORE_HEAD" ||
    role === "OFFICE_ADMIN"
  );
}

/** The step actually awaiting a decision right now, if any. */
function currentStepFor(
  purchaseRequest: PurchaseRequest,
): ApprovalStep | undefined {
  return purchaseRequest.steps.find(
    (step) =>
      step.level === purchaseRequest.currentLevel &&
      step.decision === "PENDING",
  );
}

/**
 * Mirrors PurchaseService.decidePurchaseRequest exactly: the actor's role
 * must match the current rung's approverRole, with no SYSTEM_ADMIN
 * override — since no rung is ever assigned to SYSTEM_ADMIN, that role
 * never sees a Decide button here either (matches the backend, which
 * would 403 it).
 */
function canDecide(
  purchaseRequest: PurchaseRequest,
  role: Role | undefined,
): boolean {
  if (purchaseRequest.status !== "PENDING") {
    return false;
  }

  const step = currentStepFor(purchaseRequest);
  return step !== undefined && step.approverRole === role;
}

function canReceive(
  purchaseRequest: PurchaseRequest,
  role: Role | undefined,
): boolean {
  return (
    purchaseRequest.status === "APPROVED" &&
    role === "CENTRAL_STORE_OFFICER"
  );
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Please try again.";
}

function formatDate(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

interface ReceiveDraft {
  poNumber: string;
  qtyReceived: string;
}

function PurchaseRequestRow({
  purchaseRequest,
  expanded,
  onToggleExpand,
  onDecide,
  onOpenReceive,
  isDeciding,
}: {
  purchaseRequest: PurchaseRequest;
  expanded: boolean;
  onToggleExpand: () => void;
  onDecide: (
    purchaseRequest: PurchaseRequest,
    action: "APPROVE" | "REJECT",
  ) => void;
  onOpenReceive: (purchaseRequest: PurchaseRequest) => void;
  isDeciding: boolean;
}) {
  const user = useAuthStore((state) => state.user);

  return (
    <Fragment>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-4">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide approval steps" : "Show approval steps"}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            {expanded ? "−" : "+"}
          </button>
        </td>

        <td className="px-6 py-4 text-sm text-slate-700">
          <span className="font-medium text-slate-900">
            {purchaseRequest.component.code}
          </span>{" "}
          — {purchaseRequest.component.name}
        </td>

        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
          {purchaseRequest.qtyNeeded} {purchaseRequest.component.unit}
        </td>

        <td className="whitespace-nowrap px-6 py-4">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${URGENCY_STYLES[purchaseRequest.urgency]}`}
          >
            {purchaseRequest.urgency}
          </span>
        </td>

        <td className="whitespace-nowrap px-6 py-4">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[purchaseRequest.status]}`}
          >
            {purchaseRequest.status === "APPROVED" ? "AWAITING RECEIPT" : purchaseRequest.status}
          </span>
        </td>

        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
          {purchaseRequest.status === "PENDING"
            ? `Rung ${purchaseRequest.currentLevel} — ${
                currentStepFor(purchaseRequest)?.approverRole.replace(/_/g, " ") ??
                "—"
              }`
            : "—"}
        </td>

        <td className="whitespace-nowrap px-6 py-4 text-right">
          <div className="flex justify-end gap-2">
            {canDecide(purchaseRequest, user?.role) && (
              <>
                <button
                  type="button"
                  onClick={() => onDecide(purchaseRequest, "APPROVE")}
                  disabled={isDeciding}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Approve
                </button>

                <button
                  type="button"
                  onClick={() => onDecide(purchaseRequest, "REJECT")}
                  disabled={isDeciding}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}

            {canReceive(purchaseRequest, user?.role) && (
              <button
                type="button"
                onClick={() => onOpenReceive(purchaseRequest)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Receive Goods
              </button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-6 py-5">
            <h4 className="mb-3 text-sm font-semibold text-slate-800">
              Approval steps
            </h4>

            <ol className="space-y-2">
              {purchaseRequest.steps.map((step) => (
                <li
                  key={step.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <span className="text-sm font-semibold text-slate-900">
                    Rung {step.level}
                  </span>

                  <span className="text-sm text-slate-700">
                    {step.approverRole.replace(/_/g, " ")}
                  </span>

                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${DECISION_STYLES[step.decision]}`}
                  >
                    {step.decision}
                  </span>

                  {step.decidedAt && (
                    <span className="text-xs text-slate-500">
                      Decided {formatDate(step.decidedAt)}
                    </span>
                  )}

                  {step.remarks && (
                    <span className="min-w-0 flex-1 whitespace-pre-line text-xs text-slate-500">
                      {step.remarks}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            {purchaseRequest.poNumber && (
              <p className="mt-3 text-sm text-slate-600">
                PO {purchaseRequest.poNumber} · received{" "}
                {purchaseRequest.receivedQty} {purchaseRequest.component.unit}
              </p>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function PurchaseRequests() {
  const { prompt } = useAppDialog();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [actionError, setActionError] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");

  const [receiveTarget, setReceiveTarget] = useState<PurchaseRequest | null>(
    null,
  );
  const [receiveDraft, setReceiveDraft] = useState<ReceiveDraft>({
    poNumber: "",
    qtyReceived: "",
  });
  const [receiveError, setReceiveError] = useState("");

  const limit = 10;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      "purchase-requests",
      { statusFilter, urgencyFilter, page, limit },
    ],
    queryFn: () =>
      getPurchaseRequests({
        status: (statusFilter || undefined) as PurchaseStatus | undefined,
        urgency: (urgencyFilter || undefined) as Urgency | undefined,
        page,
        limit,
      }),
  });

  const showQueue = canViewQueue(user?.role);
  const canCreate = user?.role === "LAB_ASSISTANT" || user?.role === "DEPT_STORE_HEAD" ||
    user?.role === "CENTRAL_STORE_OFFICER";
  const canAggregate = user?.role === "CENTRAL_STORE_OFFICER";

  const { data: queueData, isLoading: isQueueLoading, isError: isQueueError, error: queueError } = useQuery({
    queryKey: ["purchase-requests-queue"],
    queryFn: getPurchaseRequestQueue,
    enabled: showQueue,
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    await queryClient.invalidateQueries({
      queryKey: ["purchase-requests-queue"],
    });
  }

  const decideMutation = useMutation({
    mutationFn: ({
      id,
      action,
      remarks,
    }: {
      id: string;
      action: "APPROVE" | "REJECT";
      remarks?: string;
    }) => decidePurchaseRequest(id, { action, remarks }),
    onSuccess: async () => {
      setActionError("");
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setActionError(getErrorMessage(mutationError));
    },
  });

  const receiveMutation = useMutation({
    mutationFn: ({
      id,
      poNumber,
      qtyReceived,
    }: {
      id: string;
      poNumber: string;
      qtyReceived: number;
    }) => receivePurchaseGoods(id, { poNumber, qtyReceived }),
    onSuccess: async (received) => {
      await refresh();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["components"] }),
        queryClient.invalidateQueries({ queryKey: ["stocks"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
      ]);
      closeReceiveModal();
      setReceiptMessage(`${received.receivedQty} ${received.component.unit} of ${received.component.code} received. Stock has increased by ${received.receivedQty}.`);
    },
    onError: (mutationError: unknown) => {
      setReceiveError(getErrorMessage(mutationError));
    },
  });

  function toggleExpanded(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  async function handleDecide(
    purchaseRequest: PurchaseRequest,
    action: "APPROVE" | "REJECT",
  ) {
    const remarks = await prompt(
      action === "APPROVE"
        ? "Optional remarks for this approval:"
        : "Optional remarks for this rejection:",
    );

    // Cancelling the prompt aborts the decision entirely; an empty string
    // (OK with nothing typed) still submits, just with no remarks.
    if (remarks === null) {
      return;
    }

    setActionError("");
    decideMutation.mutate({
      id: purchaseRequest.id,
      action,
      remarks: remarks.trim() || undefined,
    });
  }

  function openReceiveModal(purchaseRequest: PurchaseRequest) {
    setReceiptMessage("");
    setReceiveDraft({
      poNumber: "",
      qtyReceived: String(purchaseRequest.qtyNeeded),
    });
    setReceiveError("");
    setReceiveTarget(purchaseRequest);
  }

  function closeReceiveModal() {
    setReceiveTarget(null);
    setReceiveDraft({ poNumber: "", qtyReceived: "" });
    setReceiveError("");
  }

  function handleReceiveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReceiveError("");

    if (!receiveTarget) {
      return;
    }
    setReceiptMessage("");

    if (!receiveDraft.poNumber.trim()) {
      setReceiveError("A PO number is required.");
      return;
    }

    const qtyReceived = Number(receiveDraft.qtyReceived);

    if (!Number.isInteger(qtyReceived) || qtyReceived <= 0) {
      setReceiveError("Quantity received must be at least 1.");
      return;
    }

    receiveMutation.mutate({
      id: receiveTarget.id,
      poNumber: receiveDraft.poNumber.trim(),
      qtyReceived,
    });
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const queue = queueData ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Purchase Requests</h2>
          <p className="mt-1 text-sm text-slate-500">Purchase requests raised for components short of stock, and their 3-rung approval ladder.</p>
        </div>
        {canCreate && <PurchaseActions canAggregate={canAggregate} />}
      </div>

      {data?.data.some((purchaseRequest) => purchaseRequest.status === "APPROVED") && (
        <div role="note" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>Approved requests are awaiting delivery.</strong> Approval does not add stock. When the goods arrive, choose <strong>Receive Goods</strong> and record the PO number and actual quantity received.
        </div>
      )}

      {receiptMessage && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {receiptMessage}
        </div>
      )}

      {showQueue && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Your Approval Queue
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Requests currently waiting on your decision, most urgent first.
            </p>
          </div>

          {isQueueLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Loading queue...
            </div>
          ) : isQueueError ? (
            <div role="alert" className="p-8 text-center text-sm text-red-700">
              Could not load your approval queue: {getErrorMessage(queueError)}
            </div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nothing waiting on you right now.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-12 px-4 py-3" />
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Component
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qty Needed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Urgency
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Rung
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {queue.map((purchaseRequest) => (
                    <PurchaseRequestRow
                      key={purchaseRequest.id}
                      purchaseRequest={purchaseRequest}
                      expanded={expandedId === `queue-${purchaseRequest.id}`}
                      onToggleExpand={() =>
                        toggleExpanded(`queue-${purchaseRequest.id}`)
                      }
                      onDecide={handleDecide}
                      onOpenReceive={openReceiveModal}
                      isDeciding={decideMutation.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="sm:w-56">
            <label
              htmlFor="pur-status-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Status
            </label>

            <select
              id="pur-status-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All statuses</option>
              {Object.keys(STATUS_STYLES).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:w-56">
            <label
              htmlFor="pur-urgency-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Urgency
            </label>

            <select
              id="pur-urgency-filter"
              value={urgencyFilter}
              onChange={(event) => {
                setUrgencyFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All urgencies</option>
              {Object.keys(URGENCY_STYLES).map((urgency) => (
                <option key={urgency} value={urgency}>
                  {urgency}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading purchase requests...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No purchase requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-12 px-4 py-3" />
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Component
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Qty Needed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Urgency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Rung
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((purchaseRequest) => (
                  <PurchaseRequestRow
                    key={purchaseRequest.id}
                    purchaseRequest={purchaseRequest}
                    expanded={expandedId === purchaseRequest.id}
                    onToggleExpand={() => toggleExpanded(purchaseRequest.id)}
                    onDecide={handleDecide}
                    onOpenReceive={openReceiveModal}
                    isDeciding={decideMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} purchase request{total === 1 ? "" : "s"}
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

      {receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Receive Goods
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {receiveTarget.component.code} — {receiveTarget.component.name}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReceiveModal}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close receive form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="receive-po-number"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  PO Number
                </label>

                <input
                  id="receive-po-number"
                  type="text"
                  value={receiveDraft.poNumber}
                  onChange={(event) =>
                    setReceiveDraft((current) => ({
                      ...current,
                      poNumber: event.target.value,
                    }))
                  }
                  placeholder="Example: PO-2027-0142"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="receive-qty"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Quantity Received
                </label>

                <input
                  id="receive-qty"
                  type="number"
                  min={1}
                  value={receiveDraft.qtyReceived}
                  onChange={(event) =>
                    setReceiveDraft((current) => ({
                      ...current,
                      qtyReceived: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-2 text-xs text-slate-500">
                  May differ from the {receiveTarget.qtyNeeded} unit(s)
                  requested — a partial delivery is fine.
                </p>
              </div>

              {receiveError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {receiveError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeReceiveModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={receiveMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {receiveMutation.isPending ? "Saving..." : "Record Receipt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
