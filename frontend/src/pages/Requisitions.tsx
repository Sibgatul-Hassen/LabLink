import axios from "axios";
import { Fragment, type FormEvent, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getComponents } from "../api/component.api";
import { getSessions } from "../api/session.api";
import RequisitionWizard from "../components/RequisitionWizard";
import {
  addRequisitionLine,
  createRequisition,
  deleteRequisition,
  getRequisitionResolution,
  getRequisitions,
  issueRequisition,
  removeRequisitionLine,
  returnRequisition,
  submitRequisition,
  updateRequisitionLine,
} from "../api/requisition.api";
import { useAuthStore } from "../store/authStore";
import type {
  CreateRequisitionRequest,
  Requisition,
  RequisitionStatus,
  RequisitionType,
  ReturnRequisitionItemInput,
  Role,
} from "../types";

const STATUS_STYLES: Record<RequisitionStatus, string> = {
  DRAFT: "bg-slate-200 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  READY: "bg-green-100 text-green-700",
  AWAITING_BORROW: "bg-amber-100 text-amber-800",
  AWAITING_PURCHASE: "bg-amber-100 text-amber-800",
  ISSUED: "bg-indigo-100 text-indigo-700",
  RETURNED: "bg-slate-200 text-slate-600",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

/**
 * Mirrors the server's rule in RequisitionService.canRaise. The server is the
 * authority; this only avoids offering a button that would return 403.
 */
function raisableTypes(role: Role | undefined): RequisitionType[] {
  if (role === "SYSTEM_ADMIN") {
    return ["CLASS", "PERSONAL", "MAINTENANCE"];
  }

  if (role === "STUDENT") {
    return ["PERSONAL"];
  }

  if (role === "LAB_ASSISTANT") {
    return ["CLASS", "MAINTENANCE"];
  }

  return [];
}

/** Mirrors the requireRole guard on the issue/return endpoints. */
function canIssueOrReturn(role: Role | undefined): boolean {
  return role === "CENTRAL_STORE_OFFICER" || role === "SYSTEM_ADMIN";
}

interface ReturnDraft {
  goodQty: string;
  damagedQty: string;
  lostQty: string;
  usedUpQty: string;
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

function formatMoment(value: string): string {
  const date = new Date(value);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

/**
 * Task 4.3. Only meaningful once the resolver has actually run — DRAFT has
 * nothing to break down yet, and past READY the lines' own qtyIssued/return
 * fields tell the more relevant story — so this is only rendered for
 * SUBMITTED and READY requisitions, fetching lazily on first expand.
 */
function ResolutionBreakdownPanel({
  requisitionId,
}: {
  requisitionId: string;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["requisition-resolution", requisitionId],
    queryFn: () => getRequisitionResolution(requisitionId),
  });

  if (isLoading) {
    return (
      <p className="text-sm text-slate-500">Loading resolution breakdown...</p>
    );
  }

  if (isError) {
    return <p className="text-sm text-red-600">{getErrorMessage(error)}</p>;
  }

  if (!data || data.lines.length === 0) {
    return <p className="text-sm text-slate-500">No lines to resolve.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Component
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Needed
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Own Quota
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Office
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Borrowed
            </th>
            <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Short
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {data.lines.map((line) => (
            <tr key={line.lineId}>
              <td className="px-4 py-2 text-sm text-slate-700">
                <span className="font-medium text-slate-900">
                  {line.componentCode}
                </span>{" "}
                — {line.componentName}
              </td>
              <td className="px-4 py-2 text-right text-sm text-slate-700">
                {line.qtyNeeded}
              </td>
              <td className="px-4 py-2 text-right text-sm text-slate-700">
                {line.qtyFromOwn}
              </td>
              <td className="px-4 py-2 text-right text-sm text-slate-700">
                {line.qtyFromOffice}
              </td>
              <td className="px-4 py-2 text-right text-sm text-slate-700">
                {line.qtyFromBorrow}
              </td>
              <td
                className={`px-4 py-2 text-right text-sm font-semibold ${
                  line.qtyShort > 0 ? "text-amber-700" : "text-slate-700"
                }`}
              >
                {line.qtyShort}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Requisitions() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const allowedTypes = raisableTypes(user?.role);
  const canRaise = allowedTypes.length > 0;

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formType, setFormType] = useState<RequisitionType>(
    allowedTypes[0] ?? "PERSONAL",
  );
  const [formSessionId, setFormSessionId] = useState("");
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [formError, setFormError] = useState("");

  const [newLineComponentId, setNewLineComponentId] = useState("");
  const [newLineQty, setNewLineQty] = useState("1");
  const [lineDrafts, setLineDrafts] = useState<Record<string, string>>({});
  const [lineError, setLineError] = useState("");

  const [actionError, setActionError] = useState("");

  const [returnRequisitionTarget, setReturnRequisitionTarget] =
    useState<Requisition | null>(null);
  const [returnDrafts, setReturnDrafts] = useState<
    Record<string, ReturnDraft>
  >({});
  const [returnError, setReturnError] = useState("");

  const limit = 10;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["requisitions", { typeFilter, statusFilter, page, limit }],
    queryFn: () =>
      getRequisitions({
        type: (typeFilter || undefined) as RequisitionType | undefined,
        status: (statusFilter || undefined) as RequisitionStatus | undefined,
        page,
        limit,
      }),
  });

  const { data: componentsData } = useQuery({
    queryKey: ["components", "all"],
    queryFn: () => getComponents({ limit: 100 }),
  });

  // Only needed for class requisitions, so only fetched when one is being built.
  const { data: sessionsData } = useQuery({
    queryKey: ["sessions", "for-requisition"],
    queryFn: () => getSessions({ limit: 100 }),
    enabled: isFormOpen && formType === "CLASS",
  });

  const components = componentsData?.data ?? [];
  const sessions = sessionsData?.data ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["requisitions"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateRequisitionRequest) =>
      createRequisition(payload),
    onSuccess: async (created) => {
      await refresh();
      closeForm();
      // Open the new draft so lines can be added straight away.
      setExpandedId(created.id);
    },
    onError: (mutationError: unknown) => {
      setFormError(getErrorMessage(mutationError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRequisition,
    onSuccess: async () => {
      setActionError("");
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setActionError(getErrorMessage(mutationError));
    },
  });

  const addLineMutation = useMutation({
    mutationFn: ({
      requisitionId,
      componentId,
      qtyNeeded,
    }: {
      requisitionId: string;
      componentId: string;
      qtyNeeded: number;
    }) => addRequisitionLine(requisitionId, { componentId, qtyNeeded }),
    onSuccess: async () => {
      setLineError("");
      setNewLineComponentId("");
      setNewLineQty("1");
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setLineError(getErrorMessage(mutationError));
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: ({
      requisitionId,
      lineId,
      qtyNeeded,
    }: {
      requisitionId: string;
      lineId: string;
      qtyNeeded: number;
    }) => updateRequisitionLine(requisitionId, lineId, qtyNeeded),
    onSuccess: async (_result, variables) => {
      setLineError("");
      setLineDrafts((current) => {
        const next = { ...current };
        delete next[variables.lineId];
        return next;
      });
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setLineError(getErrorMessage(mutationError));
    },
  });

  const removeLineMutation = useMutation({
    mutationFn: ({
      requisitionId,
      lineId,
    }: {
      requisitionId: string;
      lineId: string;
    }) => removeRequisitionLine(requisitionId, lineId),
    onSuccess: async () => {
      setLineError("");
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setLineError(getErrorMessage(mutationError));
    },
  });

  const submitMutation = useMutation({
    mutationFn: submitRequisition,
    onSuccess: async () => {
      setActionError("");
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setActionError(getErrorMessage(mutationError));
    },
  });

  const issueMutation = useMutation({
    mutationFn: issueRequisition,
    onSuccess: async () => {
      setActionError("");
      await refresh();
    },
    onError: (mutationError: unknown) => {
      setActionError(getErrorMessage(mutationError));
    },
  });

  const returnMutation = useMutation({
    mutationFn: ({
      requisitionId,
      items,
    }: {
      requisitionId: string;
      items: ReturnRequisitionItemInput[];
    }) => returnRequisition(requisitionId, { items }),
    onSuccess: async () => {
      await refresh();
      closeReturnModal();
    },
    onError: (mutationError: unknown) => {
      setReturnError(getErrorMessage(mutationError));
    },
  });

  /** A draft belongs to its requester; the resolver owns anything past DRAFT. */
  function canEdit(requisition: Requisition): boolean {
    if (requisition.status !== "DRAFT") {
      return false;
    }

    return (
      user?.role === "SYSTEM_ADMIN" || requisition.requestedById === user?.id
    );
  }

  function openForm() {
    setFormType(allowedTypes[0] ?? "PERSONAL");
    setFormSessionId("");
    setFormFrom("");
    setFormTo("");
    setFormError("");
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setFormError("");
  }

  function toggleExpanded(id: string) {
    setLineError("");
    setNewLineComponentId("");
    setNewLineQty("1");
    setLineDrafts({});
    setExpandedId((current) => (current === id ? null : id));
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (formType === "CLASS") {
      if (!formSessionId) {
        setFormError("Pick a class session.");
        return;
      }

      createMutation.mutate({ type: "CLASS", classSessionId: formSessionId });
      return;
    }

    if (!formFrom || !formTo) {
      setFormError("Both a start and an end time are required.");
      return;
    }

    if (formFrom >= formTo) {
      setFormError("The start must be before the end.");
      return;
    }

    createMutation.mutate({
      type: formType,
      neededFrom: new Date(formFrom).toISOString(),
      neededTo: new Date(formTo).toISOString(),
    });
  }

  function handleDelete(requisition: Requisition) {
    const confirmed = window.confirm(
      `Delete this ${requisition.type.toLowerCase()} draft?`,
    );

    if (!confirmed) {
      return;
    }

    setActionError("");
    deleteMutation.mutate(requisition.id);
  }

  function handleAddLine(requisitionId: string) {
    setLineError("");

    if (!newLineComponentId) {
      setLineError("Pick a component.");
      return;
    }

    const qty = Number(newLineQty);

    if (!Number.isInteger(qty) || qty <= 0) {
      setLineError("Quantity must be at least 1.");
      return;
    }

    addLineMutation.mutate({
      requisitionId,
      componentId: newLineComponentId,
      qtyNeeded: qty,
    });
  }

  function handleSubmitRequisition(requisition: Requisition) {
    const confirmed = window.confirm(
      "Submit this requisition? It will be resolved against stock, quota, and borrowing and can no longer be edited.",
    );

    if (!confirmed) {
      return;
    }

    setActionError("");
    submitMutation.mutate(requisition.id);
  }

  function handleIssue(requisition: Requisition) {
    const confirmed = window.confirm(
      "Issue this requisition? Stock will be deducted immediately.",
    );

    if (!confirmed) {
      return;
    }

    setActionError("");
    issueMutation.mutate(requisition.id);
  }

  function openReturnModal(requisition: Requisition) {
    const drafts: Record<string, ReturnDraft> = {};

    for (const line of requisition.lines) {
      const outstanding =
        line.qtyIssued -
        (line.qtyReturnedGood + line.qtyDamaged + line.qtyLost + line.qtyUsedUp);

      drafts[line.id] = {
        goodQty: String(Math.max(outstanding, 0)),
        damagedQty: "0",
        lostQty: "0",
        usedUpQty: "0",
      };
    }

    setReturnDrafts(drafts);
    setReturnError("");
    setReturnRequisitionTarget(requisition);
  }

  function closeReturnModal() {
    setReturnRequisitionTarget(null);
    setReturnDrafts({});
    setReturnError("");
  }

  function updateReturnDraft(
    lineId: string,
    field: keyof ReturnDraft,
    value: string,
  ) {
    setReturnDrafts((current) => ({
      ...current,
      [lineId]: { ...current[lineId], [field]: value },
    }));
  }

  function handleReturnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReturnError("");

    if (!returnRequisitionTarget) {
      return;
    }

    const items: ReturnRequisitionItemInput[] = [];

    for (const line of returnRequisitionTarget.lines) {
      const draft = returnDrafts[line.id];

      if (!draft) {
        continue;
      }

      const goodQty = Number(draft.goodQty) || 0;
      const damagedQty = Number(draft.damagedQty) || 0;
      const lostQty = Number(draft.lostQty) || 0;
      const usedUpQty = Number(draft.usedUpQty) || 0;

      if ([goodQty, damagedQty, lostQty, usedUpQty].some((qty) => qty < 0)) {
        setReturnError("Quantities cannot be negative.");
        return;
      }

      const total = goodQty + damagedQty + lostQty + usedUpQty;
      const outstanding =
        line.qtyIssued -
        (line.qtyReturnedGood + line.qtyDamaged + line.qtyLost + line.qtyUsedUp);

      if (total > outstanding) {
        setReturnError(
          `${line.component.code}: returned quantity exceeds what is still outstanding (${outstanding}).`,
        );
        return;
      }

      if (total > 0) {
        items.push({
          componentId: line.componentId,
          goodQty,
          damagedQty,
          lostQty,
          usedUpQty,
        });
      }
    }

    if (items.length === 0) {
      setReturnError("Enter at least one quantity to return.");
      return;
    }

    returnMutation.mutate({
      requisitionId: returnRequisitionTarget.id,
      items,
    });
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Requisitions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Requests for components over a time window. Drafts can be edited
            until they are submitted.
          </p>
        </div>

        {canRaise && (
          <button
            type="button"
            onClick={openForm}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            New Requisition
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="sm:w-56">
            <label
              htmlFor="req-type-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Type
            </label>

            <select
              id="req-type-filter"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All types</option>
              <option value="CLASS">Class</option>
              <option value="PERSONAL">Personal</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </div>

          <div className="sm:w-56">
            <label
              htmlFor="req-status-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Status
            </label>

            <select
              id="req-status-filter"
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
                  {status.replace(/_/g, " ")}
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
            Loading requisitions...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">
            {getErrorMessage(error)}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No requisitions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-12 px-4 py-3" />
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    For
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Window
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lines
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.data.map((requisition) => (
                  <Fragment key={requisition.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(requisition.id)}
                          aria-expanded={expandedId === requisition.id}
                          aria-label={
                            expandedId === requisition.id
                              ? "Hide lines"
                              : "Show lines"
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          {expandedId === requisition.id ? "−" : "+"}
                        </button>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">
                        {requisition.type}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-700">
                        {requisition.classSession ? (
                          <>
                            <span className="font-medium text-slate-900">
                              {
                                requisition.classSession.routineSlot.section
                                  .course.code
                              }
                            </span>{" "}
                            · Section{" "}
                            {requisition.classSession.routineSlot.section.name}
                            <div className="text-xs text-slate-500">
                              {requisition.classSession.routineSlot.lab.name} ·{" "}
                              {
                                requisition.classSession.routineSlot.section
                                  .studentCount
                              }{" "}
                              students
                            </div>
                          </>
                        ) : (
                          <>
                            {requisition.requestedBy.fullName}
                            <div className="text-xs text-slate-500">
                              {requisition.department.code}
                            </div>
                          </>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {formatMoment(requisition.neededFrom)}
                        <div className="text-xs text-slate-500">
                          to {formatMoment(requisition.neededTo)}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                        {requisition.lines.length}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[requisition.status]}`}
                        >
                          {requisition.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {canEdit(requisition) && (
                            <button
                              type="button"
                              onClick={() => handleDelete(requisition)}
                              disabled={deleteMutation.isPending}
                              className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}

                          {canEdit(requisition) && (
                            <button
                              type="button"
                              onClick={() => handleSubmitRequisition(requisition)}
                              disabled={submitMutation.isPending}
                              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Submit
                            </button>
                          )}

                          {canIssueOrReturn(user?.role) &&
                            requisition.status === "READY" && (
                              <button
                                type="button"
                                onClick={() => handleIssue(requisition)}
                                disabled={issueMutation.isPending}
                                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Issue
                              </button>
                            )}

                          {canIssueOrReturn(user?.role) &&
                            requisition.status === "ISSUED" && (
                              <button
                                type="button"
                                onClick={() => openReturnModal(requisition)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                              >
                                Return
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>

                    {expandedId === requisition.id &&
                      (requisition.status === "SUBMITTED" ||
                      requisition.status === "READY" ? (
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="px-6 py-5">
                            <h4 className="mb-3 text-sm font-semibold text-slate-800">
                              Resolution breakdown
                            </h4>

                            <ResolutionBreakdownPanel
                              requisitionId={requisition.id}
                            />
                          </td>
                        </tr>
                      ) : (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="px-6 py-5">
                          <h4 className="mb-3 text-sm font-semibold text-slate-800">
                            Requested components
                          </h4>

                          {requisition.lines.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No components on this requisition yet.
                            </p>
                          ) : (
                            <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                              {requisition.lines.map((line) => {
                                const draft = lineDrafts[line.id];
                                const isDirty =
                                  draft !== undefined &&
                                  draft !== String(line.qtyNeeded);

                                return (
                                  <li
                                    key={line.id}
                                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                                  >
                                    <span className="min-w-0 flex-1 text-sm text-slate-700">
                                      <span className="font-medium text-slate-900">
                                        {line.component.code}
                                      </span>{" "}
                                      — {line.component.name}
                                    </span>

                                    {canEdit(requisition) ? (
                                      <>
                                        <input
                                          type="number"
                                          min={1}
                                          aria-label={`Quantity for ${line.component.code}`}
                                          value={
                                            draft ?? String(line.qtyNeeded)
                                          }
                                          onChange={(event) =>
                                            setLineDrafts((current) => ({
                                              ...current,
                                              [line.id]: event.target.value,
                                            }))
                                          }
                                          className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                        />

                                        <span className="text-xs text-slate-500">
                                          {line.component.unit}
                                        </span>

                                        {isDirty && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateLineMutation.mutate({
                                                requisitionId: requisition.id,
                                                lineId: line.id,
                                                qtyNeeded: Number(draft),
                                              })
                                            }
                                            disabled={
                                              updateLineMutation.isPending
                                            }
                                            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            Save
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeLineMutation.mutate({
                                              requisitionId: requisition.id,
                                              lineId: line.id,
                                            })
                                          }
                                          disabled={
                                            removeLineMutation.isPending
                                          }
                                          className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          Remove
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-sm text-slate-700">
                                        {line.qtyNeeded} {line.component.unit}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          {canEdit(requisition) && (
                            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
                              <div className="min-w-[16rem] flex-1">
                                <label
                                  htmlFor={`req-line-component-${requisition.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Component
                                </label>

                                <select
                                  id={`req-line-component-${requisition.id}`}
                                  value={newLineComponentId}
                                  onChange={(event) =>
                                    setNewLineComponentId(event.target.value)
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
                                  htmlFor={`req-line-qty-${requisition.id}`}
                                  className="mb-1 block text-sm font-medium text-slate-700"
                                >
                                  Quantity
                                </label>

                                <input
                                  id={`req-line-qty-${requisition.id}`}
                                  type="number"
                                  min={1}
                                  value={newLineQty}
                                  onChange={(event) =>
                                    setNewLineQty(event.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => handleAddLine(requisition.id)}
                                disabled={addLineMutation.isPending}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Add Component
                              </button>
                            </div>
                          )}

                          {lineError && (
                            <div
                              role="alert"
                              className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                            >
                              {lineError}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {total} requisition{total === 1 ? "" : "s"}
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

      {isFormOpen && canRaise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  New Requisition
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Creates a draft. Add components to it afterwards.
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close requisition form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="req-type"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Type
                </label>

                <select
                  id="req-type"
                  value={formType}
                  onChange={(event) =>
                    setFormType(event.target.value as RequisitionType)
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {allowedTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {formType === "CLASS" ? (
                <div>
                  <label
                    htmlFor="req-session"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Class Session
                  </label>

                  <select
                    id="req-session"
                    value={formSessionId}
                    onChange={(event) => setFormSessionId(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select a session</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.date.slice(0, 10)} ·{" "}
                        {session.routineSlot.section.course.code} Section{" "}
                        {session.routineSlot.section.name} ·{" "}
                        {session.routineSlot.startTime}
                      </option>
                    ))}
                  </select>

                  <p className="mt-2 text-xs text-slate-500">
                    The time window is taken from the session, so it always
                    matches the class exactly.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="req-from"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Needed From
                    </label>

                    <input
                      id="req-from"
                      type="datetime-local"
                      value={formFrom}
                      onChange={(event) => setFormFrom(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="req-to"
                      className="mb-1 block text-sm font-medium text-slate-700"
                    >
                      Needed To
                    </label>

                    <input
                      id="req-to"
                      type="datetime-local"
                      value={formTo}
                      onChange={(event) => setFormTo(event.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              )}

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
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {returnRequisitionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Return Components
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Record what came back for each issued component. Good
                  quantity returns to stock; damaged, lost, and used-up
                  quantities do not.
                </p>
              </div>

              <button
                type="button"
                onClick={closeReturnModal}
                className="text-2xl leading-none text-slate-400 transition hover:text-slate-700"
                aria-label="Close return form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-5 p-6">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Component
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Good
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Damaged
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Lost
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Used Up
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {returnRequisitionTarget.lines
                      .filter((line) => line.qtyIssued > 0)
                      .map((line) => {
                        const draft = returnDrafts[line.id];
                        const outstanding =
                          line.qtyIssued -
                          (line.qtyReturnedGood +
                            line.qtyDamaged +
                            line.qtyLost +
                            line.qtyUsedUp);

                        return (
                          <tr key={line.id}>
                            <td className="px-4 py-2 text-sm text-slate-700">
                              <span className="font-medium text-slate-900">
                                {line.component.code}
                              </span>
                              <div className="text-xs text-slate-500">
                                {outstanding} of {line.qtyIssued}{" "}
                                {line.component.unit} outstanding
                              </div>
                            </td>

                            {(
                              [
                                "goodQty",
                                "damagedQty",
                                "lostQty",
                                "usedUpQty",
                              ] as const
                            ).map((field) => (
                              <td key={field} className="px-4 py-2">
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`${field} for ${line.component.code}`}
                                  value={draft?.[field] ?? "0"}
                                  onChange={(event) =>
                                    updateReturnDraft(
                                      line.id,
                                      field,
                                      event.target.value,
                                    )
                                  }
                                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {returnError && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {returnError}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeReturnModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={returnMutation.isPending}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {returnMutation.isPending ? "Saving..." : "Record Return"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
