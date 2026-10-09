import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Lightbulb, LoaderCircle, X } from "lucide-react";
import { generateQuotaSuggestions, type QuotaSuggestionResult } from "../api/quota.api";
import type { Component } from "../types";

type DepartmentOption = { id: string; code: string; name: string };

export default function QuotaSuggestionDialog({ open, onClose, departments, components, defaultDepartmentId }: {
  open: boolean; onClose: () => void; departments: DepartmentOption[]; components: Component[]; defaultDepartmentId: string;
}) {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<QuotaSuggestionResult | null>(null);
  const [error, setError] = useState("");
  const firstDepartmentId = departments[0]?.id;
  useEffect(() => {
    if (open) { setDepartmentId(defaultDepartmentId || firstDepartmentId || ""); setResult(null); setError(""); }
  }, [open, defaultDepartmentId, firstDepartmentId]);
  const generate = useMutation({
    mutationFn: generateQuotaSuggestions,
    onSuccess: async (response) => {
      setResult(response);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["quotas"] });
    },
    onError: (failure: unknown) => {
      const detail: unknown = axios.isAxiosError(failure) ? failure.response?.data?.error : undefined;
      setError(typeof detail === "string" ? detail : "Unable to calculate quota suggestions.");
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!departmentId) return setError("Select a department.");
    if (from && to && from > to) return setError("From date must be on or before to date.");
    setResult(null); setError("");
    generate.mutate({ departmentId, from: from || undefined, to: to || undefined });
  }
  const componentNames = new Map(components.map((item) => [item.id, item.code]));
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/55 backdrop-blur-md" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] max-h-[90vh] w-[min(92vw,600px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-[var(--app-ink)] shadow-2xl animate-[app-dialog-in_.25s_ease-out]">
      <div className="mb-5 flex items-start justify-between gap-3"><div><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><Lightbulb size={20} /></span><Dialog.Title className="text-xl font-bold">Calculate quota suggestions</Dialog.Title><Dialog.Description className="mt-1 text-sm text-[var(--app-muted)]">Estimate component quotas from peak class load and experiment items.</Dialog.Description></div><Dialog.Close className="rounded-lg p-1 text-[var(--app-muted)]" aria-label="Close quota suggestions"><X size={18} /></Dialog.Close></div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">Department<select required value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5"><option value="">Select department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">From (optional)<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label><label className="block text-sm font-semibold">To (optional)<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-2.5" /></label></div>
        <p className="rounded-xl bg-[var(--app-surface-soft)] p-3 text-xs leading-5 text-[var(--app-muted)]">Generating suggestions updates suggested quantities in the quota table. Confirmed quota quantities remain available for review.</p>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold">Close</button><button type="submit" disabled={generate.isPending || !departments.length} className="inline-flex items-center gap-2 rounded-xl bg-[#c85200] hover:bg-[#a94500] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{generate.isPending && <LoaderCircle size={15} className="animate-spin" />}Generate suggestions</button></div>
      </form>
      {result && <div role="status" className="mt-5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] p-4"><p className="text-sm font-semibold">{result.department.code}: {result.suggestions.length} suggestions from {result.peakGroups} peak groups</p><ul className="mt-3 max-h-52 space-y-2 overflow-y-auto text-sm">{result.suggestions.map((item) => <li key={item.componentId} className="flex justify-between gap-3 border-b border-[var(--app-border)] pb-2"><span>{componentNames.get(item.componentId) ?? item.componentId}</span><strong>{item.suggestedQty}</strong></li>)}</ul></div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
