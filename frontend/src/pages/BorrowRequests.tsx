import axios from "axios";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveBorrowRequest,
  getIncomingBorrowRequests,
  getOutgoingBorrowRequests,
  handOverBorrowRequest,
  rejectBorrowRequest,
  returnBorrowRequest,
} from "../api/borrow.api";
import { useAuthStore } from "../store/authStore";
import type { BorrowLine, BorrowRequest, BorrowStatus, Role } from "../types";

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<BorrowStatus, string> = {
  REQUESTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-amber-100 text-amber-700",
  HANDED_OVER: "bg-purple-100 text-purple-700",
  RETURNED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

const STATUS_LABELS: Record<BorrowStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  HANDED_OVER: "Handed Over",
  RETURNED: "Returned",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

// Only these roles can manage borrow requests — mirrors borrow.routes.ts guards.
function canManageBorrows(role: Role | undefined): boolean {
  return (
    role === "DEPT_STORE_HEAD"
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sumRequested(lines: BorrowLine[]): number {
  return lines.reduce((s, l) => s + l.qtyRequested, 0);
}

function sumApproved(lines: BorrowLine[]): number {
  return lines.reduce((s, l) => s + (l.qtyApproved ?? 0), 0);
}

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BorrowStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── approve modal ────────────────────────────────────────────────────────────

function ApproveModal({
  request,
  onClose,
  onSuccess,
}: {
  request: BorrowRequest;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(request.lines.map((l) => [l.id, l.qtyRequested])),
  );
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(approvedQtys).reduce((s, v) => s + v, 0);

  const mutation = useMutation({
    mutationFn: () => approveBorrowRequest(request.id, { approvedQty: total }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["borrow-incoming"] });
      void queryClient.invalidateQueries({ queryKey: ["borrow-outgoing"] });
      onSuccess("Borrow request approved.");
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        axios.isAxiosError(err)
          ? ((err.response?.data as { error?: string })?.error ?? err.message)
          : "An unexpected error occurred.",
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Approve Borrow Request
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            Borrower:{" "}
            <strong className="text-slate-900">
              {request.borrower.code} — {request.borrower.name}
            </strong>
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Component</th>
                  <th className="px-4 py-2 text-right">Requested</th>
                  <th className="px-4 py-2 text-right">Approve Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {request.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{line.component.name}</p>
                      <p className="text-xs text-slate-400">{line.component.code}</p>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {line.qtyRequested} {line.component.unit}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        id={`approve-qty-${line.id}`}
                        type="number"
                        min={1}
                        max={line.qtyRequested}
                        value={approvedQtys[line.id]}
                        onChange={(e) =>
                          setApprovedQtys((prev) => ({
                            ...prev,
                            [line.id]: Number(e.target.value),
                          }))
                        }
                        className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            id="confirm-approve-borrow"
            type="button"
            disabled={mutation.isPending || total < 1}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Approving…" : `Approve (${total} pcs)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── reject modal ─────────────────────────────────────────────────────────────

function RejectModal({
  request,
  onClose,
  onSuccess,
}: {
  request: BorrowRequest;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => rejectBorrowRequest(request.id, { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["borrow-incoming"] });
      void queryClient.invalidateQueries({ queryKey: ["borrow-outgoing"] });
      onSuccess("Borrow request rejected.");
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        axios.isAxiosError(err)
          ? ((err.response?.data as { error?: string })?.error ?? err.message)
          : "An unexpected error occurred.",
      );
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Reject Borrow Request</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">
            You are rejecting a request from{" "}
            <strong className="text-slate-900">{request.borrower.code} — {request.borrower.name}</strong>.
          </p>
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-slate-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="State the reason for rejection…"
            />
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            id="confirm-reject-borrow"
            type="button"
            disabled={mutation.isPending || reason.trim().length === 0}
            onClick={() => mutation.mutate()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── borrow card ──────────────────────────────────────────────────────────────

type ActiveModal =
  | { type: "approve"; request: BorrowRequest }
  | { type: "reject"; request: BorrowRequest }
  | null;

function BorrowCard({
  request,
  side,
  canManage,
  onModal,
  onSuccess,
}: {
  request: BorrowRequest;
  side: "incoming" | "outgoing";
  canManage: boolean;
  onModal: (m: ActiveModal) => void;
  onSuccess: (msg: string) => void;
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleError = (err: unknown) => {
    setActionError(
      axios.isAxiosError(err)
        ? ((err.response?.data as { error?: string })?.error ?? err.message)
        : "Action failed.",
    );
  };

  const handOverMut = useMutation({
    mutationFn: () => handOverBorrowRequest(request.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["borrow-incoming"] });
      void queryClient.invalidateQueries({ queryKey: ["borrow-outgoing"] });
      onSuccess("Components handed over successfully.");
    },
    onError: handleError,
  });

  const returnMut = useMutation({
    mutationFn: () => returnBorrowRequest(request.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["borrow-incoming"] });
      void queryClient.invalidateQueries({ queryKey: ["borrow-outgoing"] });
      onSuccess("Components returned successfully.");
    },
    onError: handleError,
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={request.status} />
            {request.requisition && (
              <span className="rounded-full bg-[var(--app-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--app-accent)]">
                Via Requisition
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-mono">{request.id.slice(0, 8)}…</p>
        </div>

        <div className="text-right text-sm">
          {side === "incoming" ? (
            <p className="text-slate-500">
              From:{" "}
              <strong className="text-slate-800">
                {request.borrower.code} — {request.borrower.name}
              </strong>
            </p>
          ) : (
            <p className="text-slate-500">
              Lender:{" "}
              <strong className="text-slate-800">
                {request.lender.code} — {request.lender.name}
              </strong>
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">{fmt(request.createdAt)}</p>
        </div>
      </div>

      {/* component lines */}
      <div className="overflow-x-auto px-5 py-3">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-slate-400">
              <th className="pb-1 text-left">Component</th>
              <th className="pb-1 text-right">Requested</th>
              <th className="pb-1 text-right">Approved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {request.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5 pr-4">
                  <p className="font-medium text-slate-800">{line.component.name}</p>
                  <p className="text-xs text-slate-400">{line.component.code}</p>
                </td>
                <td className="py-1.5 text-right text-slate-600">
                  {line.qtyRequested} {line.component.unit}
                </td>
                <td className="py-1.5 text-right">
                  {line.qtyApproved !== null ? (
                    <span className="font-semibold text-green-700">
                      {line.qtyApproved} {line.component.unit}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-100 text-xs text-slate-500">
            <tr>
              <td className="pt-2 font-medium">Total</td>
              <td className="pt-2 text-right font-medium">{sumRequested(request.lines)}</td>
              <td className="pt-2 text-right font-semibold text-green-700">
                {sumApproved(request.lines) > 0 ? sumApproved(request.lines) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* rejection reason */}
      {request.rejectionReason && (
        <div className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <strong>Reason:</strong> {request.rejectionReason}
        </div>
      )}

      {/* return deadline */}
      {request.returnDeadline && request.status === "HANDED_OVER" && (
        <div className="mx-5 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <strong>Return by:</strong> {fmt(request.returnDeadline)}
        </div>
      )}

      {/* action error */}
      {actionError && (
        <div className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* actions */}
      {canManage && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          {/* INCOMING lender actions */}
          {side === "incoming" && request.status === "REQUESTED" && (
            <>
              <button
                id={`approve-borrow-${request.id}`}
                type="button"
                onClick={() => onModal({ type: "approve", request })}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                ✓ Approve
              </button>
              <button
                id={`reject-borrow-${request.id}`}
                type="button"
                onClick={() => onModal({ type: "reject", request })}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                ✕ Reject
              </button>
            </>
          )}

          {side === "incoming" && request.status === "APPROVED" && (
            <button
              id={`handover-borrow-${request.id}`}
              type="button"
              disabled={handOverMut.isPending}
              onClick={() => handOverMut.mutate()}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {handOverMut.isPending ? "Handing over…" : "📦 Hand Over"}
            </button>
          )}

          {/* OUTGOING borrower action */}
          {side === "outgoing" && request.status === "HANDED_OVER" && (
            <button
              id={`return-borrow-${request.id}`}
              type="button"
              disabled={returnMut.isPending}
              onClick={() => returnMut.mutate()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {returnMut.isPending ? "Returning…" : "↩ Return"}
            </button>
          )}

          {(request.status === "RETURNED" ||
            request.status === "REJECTED" ||
            request.status === "CANCELLED") && (
            <span className="text-sm italic text-slate-400">No actions available</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-slate-400">
      <span className="mb-3 text-5xl">📭</span>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: BorrowStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "REQUESTED", label: "Requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "HANDED_OVER", label: "Handed Over" },
  { value: "RETURNED", label: "Returned" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function BorrowRequests() {
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">("incoming");
  const [statusFilter, setStatusFilter] = useState<BorrowStatus | "ALL">("ALL");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [toast, setToast] = useState<string | null>(null);

  const incomingQuery = useQuery({
    queryKey: ["borrow-incoming"],
    queryFn: getIncomingBorrowRequests,
    enabled: canManageBorrows(user?.role),
  });

  const outgoingQuery = useQuery({
    queryKey: ["borrow-outgoing"],
    queryFn: getOutgoingBorrowRequests,
    enabled: canManageBorrows(user?.role),
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  if (!user) return null;

  if (!canManageBorrows(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500">
        <span className="mb-3 text-5xl">🔒</span>
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="mt-1 text-sm">
          Only Dept Store Heads and Store Officers can manage borrow requests.
        </p>
      </div>
    );
  }

  const activeQuery = activeTab === "incoming" ? incomingQuery : outgoingQuery;
  const allItems = activeQuery.data ?? [];
  const filtered =
    statusFilter === "ALL" ? allItems : allItems.filter((r) => r.status === statusFilter);

  // Red badge: incoming requests needing lender action
  const pendingIncoming =
    incomingQuery.data?.filter(
      (r) => r.status === "REQUESTED" || r.status === "APPROVED",
    ).length ?? 0;

  return (
    <div className="space-y-6">
      {/* page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Borrow Requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage incoming borrow requests from other departments, and track components
          your department has borrowed.
        </p>
      </div>

      {/* toast */}
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-xl bg-green-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          ✓ {toast}
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          id="tab-incoming"
          type="button"
          onClick={() => setActiveTab("incoming")}
          className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "incoming"
              ? "border-b-2 border-[var(--app-accent)] text-[var(--app-accent)]"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Incoming
          {pendingIncoming > 0 && (
            <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">
              {pendingIncoming}
            </span>
          )}
        </button>
        <button
          id="tab-outgoing"
          type="button"
          onClick={() => setActiveTab("outgoing")}
          className={`px-5 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "outgoing"
              ? "border-b-2 border-[var(--app-accent)] text-[var(--app-accent)]"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Outgoing
        </button>
      </div>

      {/* context banner */}
      <div
        className={`rounded-lg px-4 py-3 text-sm ${
          activeTab === "incoming"
            ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
            : "bg-teal-50 text-teal-700"
        }`}
      >
        {activeTab === "incoming" ? (
          <>
            <strong>Incoming (Lender side):</strong> Another department is requesting
            components from <strong>{user.departmentCode ?? "your department"}</strong>.
            Approve, reject, or hand them over here.
          </>
        ) : (
          <>
            <strong>Outgoing (Borrower side):</strong> Components that{" "}
            <strong>{user.departmentCode ?? "your department"}</strong> has borrowed from
            others. Return them once your class is done.
          </>
        )}
      </div>

      {/* filter */}
      <div className="flex items-center gap-3">
        <label htmlFor="status-filter" className="text-sm text-slate-600">
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as BorrowStatus | "ALL")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-400">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* content */}
      {activeQuery.isPending && (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-36 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      )}

      {activeQuery.isError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load. Please refresh.
        </div>
      )}

      {activeQuery.isSuccess && filtered.length === 0 && (
        <EmptyState
          message={
            activeTab === "incoming"
              ? "No incoming borrow requests"
              : "No outgoing borrow requests"
          }
        />
      )}

      {activeQuery.isSuccess && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((request) => (
            <BorrowCard
              key={request.id}
              request={request}
              side={activeTab}
              canManage={canManageBorrows(user.role)}
              onModal={setActiveModal}
              onSuccess={showToast}
            />
          ))}
        </div>
      )}

      {/* modals */}
      {activeModal?.type === "approve" && (
        <ApproveModal
          request={activeModal.request}
          onClose={() => setActiveModal(null)}
          onSuccess={showToast}
        />
      )}
      {activeModal?.type === "reject" && (
        <RejectModal
          request={activeModal.request}
          onClose={() => setActiveModal(null)}
          onSuccess={showToast}
        />
      )}
    </div>
  );
}
