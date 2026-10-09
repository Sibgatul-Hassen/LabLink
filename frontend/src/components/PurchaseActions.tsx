import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { LoaderCircle, PackagePlus, RefreshCw, X } from "lucide-react";
import { getComponents } from "../api/component.api";
import { aggregatePurchaseRequests, createPurchaseRequest } from "../api/purchase.api";

type Mode = "create" | "aggregate";
async function loadComponents() {
  const first = await getComponents({ limit: 100 });
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / 100) - 1) }, (_, index) => getComponents({ page: index + 2, limit: 100 })));
  return [first, ...rest].flatMap((page) => page.data);
}
function message(error: unknown): string {
  const detail: unknown = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof detail === "string" ? detail : "Could not complete the purchase action.";
}

export default function PurchaseActions({ canAggregate }: { canAggregate: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("create");
  const [open, setOpen] = useState(false);
  const [componentId, setComponentId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [requisitionId, setRequisitionId] = useState("");
  const [error, setError] = useState("");
  const components = useQuery({ queryKey: ["components", "purchase-options"], queryFn: loadComponents, enabled: open });
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-requests-queue"] }),
    ]);
    setOpen(false); setError("");
  }
  const create = useMutation({ mutationFn: createPurchaseRequest, onSuccess: refresh, onError: (failure: unknown) => setError(message(failure)) });
  const aggregate = useMutation({ mutationFn: aggregatePurchaseRequests, onSuccess: refresh, onError: (failure: unknown) => setError(message(failure)) });
  function openMode(next: Mode) { setMode(next); setComponentId(""); setQty(""); setReason(""); setRequisitionId(""); setError(""); setOpen(true); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!componentId) return setError("Select a component.");
    setError("");
    if (mode === "aggregate") { aggregate.mutate(componentId); return; }
    const amount = Number(qty);
    if (!Number.isInteger(amount) || amount < 1) return setError("Quantity must be a positive whole number.");
    if (!reason.trim()) return setError("A reason is required.");
    create.mutate({ componentId, qtyRequested: amount, reason: reason.trim(), requisitionId: requisitionId.trim() || undefined });
  }

  return <><div className="flex flex-wrap gap-2">
    {canAggregate && <button type="button" onClick={() => openMode("aggregate")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[var(--app-ink)]"><RefreshCw size={16} /> Reconcile pending</button>}
    <button type="button" onClick={() => openMode("create")} className="inline-flex items-center gap-2 rounded-xl bg-[#c85200] hover:bg-[#a94500] px-4 py-2 text-sm font-semibold text-white"><PackagePlus size={16} /> New Purchase Request</button>
  </div>
  <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/55 backdrop-blur-md" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[90vh] w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-[var(--app-ink)] shadow-2xl animate-[app-dialog-in_.25s_ease-out]">
      <div className="mb-5 flex items-start justify-between gap-3"><div><Dialog.Title className="text-xl font-bold">{mode === "create" ? "New purchase request" : "Reconcile pending requests"}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[var(--app-muted)]">{mode === "create" ? "Request a component purchase for approval." : "Rebuild an aggregated request when pending entries are out of sync."}</Dialog.Description></div><Dialog.Close className="rounded-lg p-1 text-[var(--app-muted)]" aria-label="Close purchase form"><X size={18} /></Dialog.Close></div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">Component<select required value={componentId} onChange={(event) => setComponentId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5"><option value="">Select component</option>{components.data?.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        {mode === "create" && <><label className="block text-sm font-semibold">Quantity requested<input required type="number" min="1" step="1" value={qty} onChange={(event) => setQty(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label><label className="block text-sm font-semibold">Reason<textarea required maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label><label className="block text-sm font-semibold">Related requisition ID (optional)<input value={requisitionId} onChange={(event) => setRequisitionId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label></>}
        {mode === "aggregate" && <p className="rounded-xl bg-[var(--app-surface-soft)] p-3 text-xs leading-5 text-[var(--app-muted)]">New purchase requests aggregate automatically. Use this action only to reconcile pending requests for the selected component.</p>}
        {components.isError && <p role="alert" className="text-sm text-rose-700">Could not load components.</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={create.isPending || aggregate.isPending || components.isLoading} className="inline-flex items-center gap-2 rounded-xl bg-[#c85200] hover:bg-[#a94500] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{(create.isPending || aggregate.isPending) && <LoaderCircle size={15} className="animate-spin" />}{mode === "create" ? "Create request" : "Reconcile"}</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root></>;
}
