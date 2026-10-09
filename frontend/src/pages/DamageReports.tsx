import { useState } from "react";
import { useAppDialog } from "../components/ui/dialog";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getDamageReports,
  updateDamageReport,
  type DamageStatus,
} from "../api/damage.api";
import { useAuthStore } from "../store/authStore";

const PAGE_SIZE = 20;

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return "Could not update the damage report.";
}

export default function DamageReports() {
  const { confirm } = useAppDialog();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DamageStatus | "">("");
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const permitted = user?.role === "CENTRAL_STORE_OFFICER" || user?.role === "LAB_ASSISTANT" || user?.role === "DEPT_STORE_HEAD";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["damage-reports", status, page],
    queryFn: () => getDamageReports({ status: status || undefined, page, limit: PAGE_SIZE }),
    enabled: permitted,
  });
  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Exclude<DamageStatus, "REPORTED"> }) =>
      updateDamageReport(id, next, notes[id]?.trim() || undefined),
    onSuccess: async (report) => {
      setError("");
      setMessage(`${report.component.code} marked ${report.status.toLowerCase().replace(/_/g, " ")}.`);
      await queryClient.invalidateQueries({ queryKey: ["damage-reports"] });
      if (report.status === "REPAIRED") {
        await queryClient.invalidateQueries({ queryKey: ["stocks"] });
      }
    },
    onError: (failure: unknown) => {
      setMessage("");
      setError(errorMessage(failure));
    },
  });

  if (!permitted) {
    return <p role="alert" className="text-sm text-red-700">You cannot manage damage reports.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Damage reports</h2>
        <p className="mt-1 text-sm text-slate-500">Inspect damaged returns, track maintenance, and restore repaired units to stock.</p>
      </div>
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="damage-status" className="mr-3 text-sm font-medium text-slate-700">Status</label>
        <select id="damage-status" value={status} onChange={(event) => {
          setStatus(event.target.value as DamageStatus | "");
          setPage(1);
        }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="REPORTED">Reported</option>
          <option value="UNDER_MAINTENANCE">Under maintenance</option>
          <option value="REPAIRED">Repaired</option>
          <option value="WRITTEN_OFF">Written off</option>
        </select>
      </div>
      {isLoading ? <p className="text-sm text-slate-500">Loading reports...</p> : isError ? (
        <p role="alert" className="text-sm text-red-700">Could not load damage reports.</p>
      ) : data?.data.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-slate-500">No damage reports found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Component</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Reported by</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Inspection</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.data.map((report) => (
                <tr key={report.id}>
                  <td className="px-4 py-3"><span className="font-semibold">{report.component.code}</span><div className="text-slate-500">{report.component.name}</div></td>
                  <td className="px-4 py-3">{report.qty}</td>
                  <td className="px-4 py-3">{report.reportedBy.fullName}<div className="text-xs text-slate-500">{new Date(report.createdAt).toLocaleDateString()}</div></td>
                  <td className="px-4 py-3">{report.status.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    {user?.role === "LAB_ASSISTANT" && (report.status === "REPORTED" || report.status === "UNDER_MAINTENANCE") ? (
                      <div className="flex min-w-64 flex-col gap-2">
                        <input aria-label={`Notes for ${report.component.code}`} value={notes[report.id] ?? report.notes ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Inspection notes" className="rounded-lg border border-slate-300 px-3 py-2" />
                        <div className="flex flex-wrap gap-2">
                          {report.status === "REPORTED" && <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: report.id, next: "UNDER_MAINTENANCE" })} className="rounded-lg bg-blue-700 px-3 py-1.5 font-medium text-white disabled:opacity-50">Start maintenance</button>}
                          {report.status === "UNDER_MAINTENANCE" && <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: report.id, next: "REPAIRED" })} className="rounded-lg bg-green-700 px-3 py-1.5 font-medium text-white disabled:opacity-50">Mark repaired</button>}
                          <button type="button" disabled={mutation.isPending} onClick={async () => {
                            if (await confirm(`Write off ${report.qty} damaged ${report.component.code} units?`)) mutation.mutate({ id: report.id, next: "WRITTEN_OFF" });
                          }} className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 disabled:opacity-50">Write off</button>
                        </div>
                      </div>
                    ) : <span className="text-slate-500">{report.notes || "—"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > PAGE_SIZE && <div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Previous</button><span>Page {page} of {Math.ceil(data.total / PAGE_SIZE)}</span><button type="button" disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Next</button></div>}
    </div>
  );
}
