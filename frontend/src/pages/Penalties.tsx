import { useEffect, useState, type FormEvent } from "react";
import { useAppDialog } from "../components/ui/dialog";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPenalties, getPenaltyRates, payPenalty,
  setPenaltyRate, waivePenalty,
  type PenaltyStatus, type PenaltyType,
} from "../api/penalty.api";
import { useAuthStore } from "../store/authStore";

const PAGE_SIZE = 20;

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return "Could not complete the penalty action.";
}

export default function Penalties() {
  const { prompt } = useAppDialog();
  const user = useAuthStore((state) => state.user);
  const canConfigure = user?.role === "SYSTEM_ADMIN";
  const canPay = user?.role === "CENTRAL_STORE_OFFICER";
  const canWaive = user?.role === "DEPT_STORE_HEAD";
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PenaltyStatus | "">("OUTSTANDING");
  const [page, setPage] = useState(1);
  const [rateType, setRateType] = useState<PenaltyType>("LATE");
  const [rateValue, setRateValue] = useState("");
  const [cap, setCap] = useState("");
  const [blockThreshold, setBlockThreshold] = useState("0");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const penalties = useQuery({
    queryKey: ["penalties", status, page],
    queryFn: () => getPenalties({ status: status || undefined, page, limit: PAGE_SIZE }),
  });
  const rates = useQuery({ queryKey: ["penalty-rates"], queryFn: getPenaltyRates });
  useEffect(() => {
    const rate = rates.data?.find((item) => item.type === rateType);
    setRateValue(rate ? String(rateType === "LATE" ? rate.ratePerDay ?? "" : rate.costFraction ?? "") : "");
    setCap(rate?.capAmount ?? "");
    setBlockThreshold(rate?.blockThreshold ?? rates.data?.[0]?.blockThreshold ?? "0");
  }, [rateType, rates.data]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["penalties"] });
  }

  const rateMutation = useMutation({
    mutationFn: setPenaltyRate,
    onSuccess: async () => {
      setError(""); setMessage("Penalty rate saved.");
      await queryClient.invalidateQueries({ queryKey: ["penalty-rates"] });
    },
    onError: (failure: unknown) => setError(errorMessage(failure)),
  });
  const payMutation = useMutation({
    mutationFn: ({ id, receiptRef }: { id: string; receiptRef: string }) => payPenalty(id, receiptRef),
    onSuccess: async () => { setError(""); setMessage("Payment recorded."); await refresh(); },
    onError: (failure: unknown) => setError(errorMessage(failure)),
  });
  const waiveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => waivePenalty(id, reason),
    onSuccess: async () => { setError(""); setMessage("Penalty waived."); await refresh(); },
    onError: (failure: unknown) => setError(errorMessage(failure)),
  });

  function saveRate(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const value = Number(rateValue);
    const maximum = cap.trim() ? Number(cap) : null;
    const threshold = Number(blockThreshold);
    if (!Number.isFinite(value) || value <= 0 || (rateType !== "LATE" && value > 1) || (maximum !== null && (!Number.isFinite(maximum) || maximum <= 0)) || !Number.isFinite(threshold) || threshold < 0) {
      setError("Enter a positive rate, an optional positive cap, and a nonnegative block threshold.");
      return;
    }
    rateMutation.mutate({
      type: rateType,
      ratePerDay: rateType === "LATE" ? value : null,
      costFraction: rateType === "LATE" ? null : value,
      capAmount: maximum,
      blockThreshold: threshold,
    });
  }

  return <div className="space-y-5">
    <div><h2 className="text-2xl font-bold text-slate-900">Penalties</h2><p className="mt-1 text-sm text-slate-500">Charges are calculated automatically when a personal requisition is returned. Central records payments; department heads record waivers.</p></div>
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    {canConfigure && <div className="grid gap-5 lg:grid-cols-2">
      {canConfigure && <form onSubmit={saveRate} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Configure rate</h3>
        <label className="block text-sm font-medium text-slate-700">Type<select value={rateType} onChange={(event) => setRateType(event.target.value as PenaltyType)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="LATE">Late</option><option value="LOST">Lost</option><option value="DAMAGED">Damaged</option></select></label>
        <label className="block text-sm font-medium text-slate-700">{rateType === "LATE" ? "Amount per late day" : "Fraction of unit cost (0â€“1)"}<input type="number" min="0" max={rateType === "LATE" ? undefined : "1"} step="0.01" required value={rateValue} onChange={(event) => setRateValue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium text-slate-700">Maximum amount (optional)<input type="number" min="0" step="0.01" value={cap} onChange={(event) => setCap(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium text-slate-700">Personal requisition block threshold<input type="number" min="0" step="0.01" value={blockThreshold} onChange={(event) => setBlockThreshold(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /><span className="mt-1 block text-xs text-slate-500">When total outstanding charges across all types reach this amount, new personal requisitions are blocked. Zero disables the block.</span></label>
        <button type="submit" disabled={rateMutation.isPending} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save rate</button>
      </form>}


    </div>}

    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><label htmlFor="penalty-status" className="mr-3 text-sm font-medium text-slate-700">Status</label><select id="penalty-status" value={status} onChange={(event) => { setStatus(event.target.value as PenaltyStatus | ""); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">All</option><option value="OUTSTANDING">Outstanding</option><option value="PAID">Paid</option><option value="WAIVED">Waived</option></select></div>
    {penalties.isLoading ? <p className="text-sm text-slate-500">Loading penalties...</p> : penalties.isError ? <p role="alert" className="text-sm text-red-700">Could not load penalties.</p> : penalties.data?.data.length === 0 ? <p className="rounded-xl bg-white p-6 text-sm text-slate-500">No penalties found.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th>{(canPay || canWaive) && <th className="px-4 py-3">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{penalties.data?.data.map((penalty) => <tr key={penalty.id}><td className="px-4 py-3">{penalty.user.fullName}<div className="text-xs text-slate-500">{penalty.user.email}</div></td><td className="px-4 py-3">{penalty.type} Â· {penalty.qty} {penalty.type === "LATE" ? "day(s)" : "unit(s)"}<div className="text-xs text-slate-500">{penalty.component?.code ?? penalty.requisitionId?.slice(0, 8)}</div></td><td className="px-4 py-3 font-semibold">{penalty.amount}</td><td className="px-4 py-3">{penalty.status}{penalty.receiptRef && <div className="text-xs text-slate-500">Receipt: {penalty.receiptRef}</div>}{penalty.waivedReason && <div className="text-xs text-slate-500">{penalty.waivedReason}</div>}</td>{(canPay || canWaive) && <td className="px-4 py-3">{penalty.status === "OUTSTANDING" && <div className="flex gap-2">{canPay && <button type="button" disabled={payMutation.isPending} onClick={async () => { const receiptRef = await prompt("Receipt reference", { required: true }); if (receiptRef?.trim()) payMutation.mutate({ id: penalty.id, receiptRef: receiptRef.trim() }); }} className="rounded-lg bg-green-700 px-3 py-1.5 text-white disabled:opacity-50">Record payment</button>}{canWaive && <button type="button" disabled={waiveMutation.isPending} onClick={async () => { const reason = await prompt("Reason for waiver", { required: true }); if (reason?.trim()) waiveMutation.mutate({ id: penalty.id, reason: reason.trim() }); }} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-50">Waive</button>}</div>}</td>}</tr>)}</tbody></table></div>}
    {penalties.data && penalties.data.total > PAGE_SIZE && <div className="flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Previous</button><span>Page {page} of {Math.ceil(penalties.data.total / PAGE_SIZE)}</span><button type="button" disabled={page * PAGE_SIZE >= penalties.data.total} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Next</button></div>}
  </div>;
}
