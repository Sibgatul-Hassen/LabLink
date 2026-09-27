import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowRightLeft, LoaderCircle, X } from "lucide-react";
import { getDepartments } from "../api/department.api";
import { transferStock } from "../api/stock.api";
import type { Stock } from "../types";

function message(error: unknown): string {
  const detail: unknown = axios.isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof detail === "string" ? detail : "Unable to transfer the quota allocation.";
}

export default function StockTransferDialog({ stock, onClose }: { stock: Stock | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [fromDeptId, setFromDeptId] = useState("");
  const [toDeptId, setToDeptId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const departments = useQuery({ queryKey: ["departments", "transfer"], queryFn: () => getDepartments({ limit: 100 }), enabled: Boolean(stock) });
  const activeDepartments = (departments.data?.data ?? []).filter((item) => item.isActive);
  const transfer = useMutation({
    mutationFn: transferStock,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quotas"] }),
        queryClient.invalidateQueries({ queryKey: ["stocks"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
      ]);
      onClose();
    },
    onError: (failure: unknown) => setError(message(failure)),
  });
  useEffect(() => { setFromDeptId(""); setToDeptId(""); setQty(""); setNote(""); setError(""); }, [stock?.componentId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stock) return;
    const amount = Number(qty);
    if (!fromDeptId || !toDeptId) return setError("Select both departments.");
    if (fromDeptId === toDeptId) return setError("Select different source and destination departments.");
    if (!Number.isInteger(amount) || amount < 1) return setError("Quantity must be a positive whole number.");
    setError("");
    transfer.mutate({ fromDeptId, toDeptId, componentId: stock.componentId, qty: amount, note: note.trim() || undefined });
  }

  return <Dialog.Root open={Boolean(stock)} onOpenChange={(open) => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/55 backdrop-blur-md" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[90vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-[var(--app-ink)] shadow-2xl animate-[app-dialog-in_.25s_ease-out]">
      <div className="mb-5 flex items-start justify-between gap-3"><div><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><ArrowRightLeft size={20} /></span><Dialog.Title className="text-xl font-bold">Transfer allocation</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[var(--app-muted)]">{stock?.component.code} · {stock?.component.name}</Dialog.Description></div><Dialog.Close className="rounded-lg p-1 text-[var(--app-muted)]" aria-label="Close transfer"><X size={18} /></Dialog.Close></div>
      <p className="mb-5 rounded-xl bg-[var(--app-surface-soft)] p-3 text-xs leading-5 text-[var(--app-muted)]">This moves the confirmed quota between departments. Physical on-hand stock does not change.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">From department<select required value={fromDeptId} onChange={(event) => setFromDeptId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5"><option value="">Select source</option>{activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">To department<select required value={toDeptId} onChange={(event) => setToDeptId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5"><option value="">Select destination</option>{activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.code} · {department.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">Quantity<input required type="number" min="1" step="1" value={qty} onChange={(event) => setQty(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label>
        <label className="block text-sm font-semibold">Note (optional)<textarea maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label>
        {departments.isError && <p role="alert" className="text-sm text-rose-700">Could not load departments.</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={transfer.isPending || departments.isLoading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{transfer.isPending && <LoaderCircle size={15} className="animate-spin" />}Transfer allocation</button></div>
      </form>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
