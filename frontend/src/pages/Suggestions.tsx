import { useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  decideSuggestion, generateSuggestions, getSuggestions,
  type Suggestion, type SuggestionStatus, type SuggestionType,
} from "../api/suggestion.api";
import { useAuthStore } from "../store/authStore";

const PAGE_SIZE = 20;
const TYPES: { value: SuggestionType; label: string }[] = [
  { value: "SHORTAGE_ALERT", label: "Stock shortage" },
  { value: "SUBSTITUTE", label: "Substitute" },
  { value: "REORDER_POINT", label: "Reorder point" },
  { value: "QUOTA", label: "Quota" },
  { value: "ITEM_LIST", label: "Experiment item list" },
  { value: "COLLECTION_RISK", label: "Collection risk" },
  { value: "SLOT", label: "Routine slot" },
];

function value(source: unknown, key: string): string {
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const field = (source as Record<string, unknown>)[key];
    if (typeof field === "string" || typeof field === "number") return String(field);
  }
  return "—";
}

function presentation(suggestion: Suggestion): {
  title: string;
  details: { label: string; value: string }[];
  link: { to: string; label: string } | null;
} {
  const p = suggestion.payload;
  const e = suggestion.evidence;
  switch (suggestion.type) {
    case "SHORTAGE_ALERT":
      return {
        title: `${value(p, "componentCode")} is below its reorder point`,
        details: [
          { label: "On hand", value: value(e, "onHand") },
          { label: "Reorder point", value: value(e, "reorderPoint") },
        ],
        link: { to: "/stocks", label: "View stock" },
      };
    case "SUBSTITUTE":
      return {
        title: `${value(p, "substituteCode")} can replace ${value(p, "originalCode")}`,
        details: [
          { label: "Ratio", value: `${value(p, "ratio")}:1` },
          { label: "Original on hand", value: value(e, "originalOnHand") },
          { label: "Equivalent available", value: value(e, "equivalentAvailable") },
        ],
        link: { to: "/components", label: "View components" },
      };
    case "REORDER_POINT":
      return {
        title: `Raise the reorder point for ${value(p, "componentCode")}`,
        details: [
          { label: "Current", value: value(e, "currentReorderPoint") },
          { label: "Suggested", value: value(p, "suggestedReorderPoint") },
          { label: "Issued in 28 days", value: value(e, "issuedLast28Days") },
        ],
        link: { to: "/stocks", label: "Review stock" },
      };
    case "QUOTA":
      return {
        title: `${value(p, "departmentCode")} quota for ${value(p, "componentCode")}`,
        details: [
          { label: "Current", value: value(e, "currentQty") },
          { label: "Calculated", value: value(e, "calculatedQty") },
        ],
        link: { to: "/quotas", label: "Review quota" },
      };
    case "ITEM_LIST":
      return {
        title: `Add ${value(p, "componentCode")} to an experiment item list`,
        details: [
          { label: "Experiment ID", value: value(p, "experimentId") },
          { label: "Suggested per group", value: value(p, "suggestedQtyPerGroup") },
          { label: "Class orders sampled", value: value(e, "sampledOrders") },
        ],
        link: { to: "/experiments", label: "Review experiments" },
      };
    case "COLLECTION_RISK":
      return {
        title: `Collect an overdue issue from ${value(p, "departmentCode")}`,
        details: [
          { label: "Requester", value: value(p, "requesterName") },
          { label: "Overdue hours", value: value(e, "overdueHours") },
          { label: "Requisition ID", value: value(p, "requisitionId") },
        ],
        link: { to: "/requisitions", label: "View requisitions" },
      };
    case "SLOT":
      return {
        title: `Move ${value(p, "courseCode")} section ${value(p, "sectionName")} in ${value(p, "labName")}`,
        details: [
          { label: "Current", value: `${value(e, "currentStartTime")}–${value(e, "currentEndTime")}` },
          { label: "Suggested", value: `${value(p, "proposedStartTime")}–${value(p, "proposedEndTime")}` },
          { label: "Day (Sunday = 0)", value: value(e, "dayOfWeek") },
        ],
        link: { to: "/routine-slots", label: "Review routine" },
      };
  }
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return "Could not complete the suggestion action.";
}

export default function Suggestions() {
  const user = useAuthStore((state) => state.user);
  const permitted = user?.role === "LAB_ASSISTANT" || user?.role === "DEPT_STORE_HEAD" ||
    user?.role === "CENTRAL_STORE_OFFICER" || user?.role === "SYSTEM_ADMIN";
  const canGenerate = user?.role === "CENTRAL_STORE_OFFICER" || user?.role === "SYSTEM_ADMIN";
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SuggestionStatus | "">("PENDING");
  const [type, setType] = useState<SuggestionType | "">("");
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["suggestions", status, type, page],
    queryFn: () => getSuggestions({
      status: status || undefined, type: type || undefined,
      page, limit: PAGE_SIZE,
    }),
    enabled: permitted,
  });
  const generate = useMutation({
    mutationFn: generateSuggestions,
    onSuccess: async (counts) => {
      setError("");
      const created = Object.values(counts).reduce((sum, count) => sum + count, 0);
      setMessage(`${created} new suggestions generated.`);
      await queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
    onError: (failure: unknown) => setError(errorMessage(failure)),
  });
  const decision = useMutation({
    mutationFn: ({ id, accepted }: { id: string; accepted: boolean }) =>
      decideSuggestion(id, accepted, notes[id]?.trim() || undefined),
    onSuccess: async (suggestion) => {
      setError("");
      setMessage(`Suggestion ${suggestion.status.toLowerCase()}.`);
      await queryClient.invalidateQueries({ queryKey: ["suggestions"] });
    },
    onError: (failure: unknown) => setError(errorMessage(failure)),
  });

  if (!permitted) {
    return <p role="alert" className="text-sm text-red-700">You cannot review suggestions.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Suggestions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review the evidence before making a change. Accepting records your decision and feedback.
          </p>
        </div>
        {canGenerate && (
          <button type="button" disabled={generate.isPending}
            onClick={() => generate.mutate()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {generate.isPending ? "Checking data..." : "Generate suggestions"}
          </button>
        )}
      </div>

      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="suggestion-status" className="text-sm font-medium text-slate-700">
          Status
          <select id="suggestion-status" value={status} onChange={(event) => {
            setStatus(event.target.value as SuggestionStatus | ""); setPage(1);
          }} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DISMISSED">Dismissed</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </label>
        <label htmlFor="suggestion-type" className="text-sm font-medium text-slate-700">
          Type
          <select id="suggestion-type" value={type} onChange={(event) => {
            setType(event.target.value as SuggestionType | ""); setPage(1);
          }} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            {TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Loading suggestions...</p>
        : isError ? <p role="alert" className="text-sm text-red-700">Could not load suggestions.</p>
        : data?.data.length === 0 ? <p className="rounded-xl bg-white p-6 text-sm text-slate-500">No suggestions found.</p>
        : <div className="space-y-3">
          {data?.data.map((suggestion) => {
            const view = presentation(suggestion);
            return <article key={suggestion.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    {TYPES.find((entry) => entry.value === suggestion.type)?.label}
                  </p>
                  <h3 className="mt-1 font-semibold text-slate-900">{view.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">Created {new Date(suggestion.createdAt).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {suggestion.status}
                </span>
              </div>
              <dl className="mt-4 flex flex-wrap gap-4 text-sm">
                {view.details.map((detail) => <div key={detail.label}>
                  <dt className="text-xs text-slate-500">{detail.label}</dt>
                  <dd className="font-medium text-slate-800">{detail.value}</dd>
                </div>)}
              </dl>
              {view.link && <Link to={view.link.to} className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline">
                {view.link.label}
              </Link>}
              {suggestion.status === "PENDING" ? (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  <input aria-label={`Feedback for ${view.title}`}
                    value={notes[suggestion.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [suggestion.id]: event.target.value }))}
                    placeholder="Optional feedback note" maxLength={1000}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button type="button" disabled={decision.isPending}
                      onClick={() => decision.mutate({ id: suggestion.id, accepted: true })}
                      className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Accept</button>
                    <button type="button" disabled={decision.isPending}
                      onClick={() => decision.mutate({ id: suggestion.id, accepted: false })}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50">Dismiss</button>
                  </div>
                </div>
              ) : suggestion.feedback[0]?.note ? (
                <p className="mt-3 text-sm text-slate-600">Feedback: {suggestion.feedback[0].note}</p>
              ) : null}
            </article>;
          })}
        </div>}

      {data && data.total > PAGE_SIZE && <div className="flex items-center justify-end gap-3 text-sm">
        <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}
          className="rounded border px-3 py-1 disabled:opacity-50">Previous</button>
        <span>Page {page} of {Math.ceil(data.total / PAGE_SIZE)}</span>
        <button type="button" disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage(page + 1)}
          className="rounded border px-3 py-1 disabled:opacity-50">Next</button>
      </div>}
    </div>
  );
}
