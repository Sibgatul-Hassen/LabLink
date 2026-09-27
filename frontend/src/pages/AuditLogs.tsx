import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "../api/audit.api";

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["audit-logs", page], queryFn: () => getAuditLogs(page) });
  return <section className="space-y-5">
    <div><h2 className="text-2xl font-bold text-[var(--app-ink)]">Audit logs</h2><p className="mt-1 text-sm text-[var(--app-muted)]">Recorded system actions, newest first.</p></div>
    {query.isLoading ? <p>Loading audit logs…</p> : query.isError ? <p role="alert">Could not load audit logs.</p> : <div className="overflow-x-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)]">
      <table className="min-w-full text-left text-sm"><thead className="bg-[var(--app-surface-soft)]"><tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Entity</th><th className="p-3">Actor ID</th></tr></thead><tbody>
        {query.data?.data.map((entry) => <tr key={entry.id} className="border-t border-[var(--app-border)]"><td className="p-3">{new Date(entry.createdAt).toLocaleString()}</td><td className="p-3">{entry.action}</td><td className="p-3">{entry.entityType} · {entry.entityId}</td><td className="p-3 font-mono text-xs">{entry.actorId}</td></tr>)}
      </tbody></table>{query.data?.data.length === 0 && <p className="p-6 text-center text-[var(--app-muted)]">No audit entries recorded yet.</p>}
    </div>}
    <div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 disabled:opacity-50">Previous</button><span>Page {page}</span><button type="button" disabled={!query.data || page * query.data.limit >= query.data.total} onClick={() => setPage(page + 1)} className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 disabled:opacity-50">Next</button></div>
  </section>;
}
