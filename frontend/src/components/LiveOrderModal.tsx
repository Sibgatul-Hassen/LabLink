import axios from "axios";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { getComponents } from "../api/component.api";
import { getExperiment } from "../api/experiment.api";
import { orderLiveForSession } from "../api/requisition.api";
import type { ClassSession, Requisition } from "../types";

interface OrderLine {
  componentId: string;
  code: string;
  name: string;
  qty: string;
}

interface Props {
  session: ClassSession;
  onClose: () => void;
  onOrdered: (requisition: Requisition) => void;
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return "The order could not be placed. Please try again.";
}

export default function LiveOrderModal({ session, onClose, onOrdered }: Props) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [search, setSearch] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [error, setError] = useState("");

  const { data: experiment, isLoading: loadingExperiment } = useQuery({
    queryKey: ["experiment", session.experimentId],
    queryFn: () => getExperiment(session.experimentId as string),
    enabled: Boolean(session.experimentId),
  });

  const { data: componentPage, isLoading: loadingComponents } = useQuery({
    queryKey: ["live-order-components", search],
    queryFn: () => getComponents({ search: search.trim() || undefined, limit: 50 }),
  });

  useEffect(() => {
    if (!experiment) return;
    const groups = Math.ceil(
      session.routineSlot.section.studentCount / session.routineSlot.lab.groupSize,
    );
    setLines(
      experiment.items.map((item) => ({
        componentId: item.componentId,
        code: item.component.code,
        name: item.component.name,
        qty: String(item.qtyPerGroup * groups),
      })),
    );
  }, [experiment, session]);

  const mutation = useMutation({
    mutationFn: (items: { componentId: string; qtyNeeded: number }[]) =>
      orderLiveForSession(session.id, items),
    onSuccess: onOrdered,
    onError: (mutationError: unknown) => setError(errorMessage(mutationError)),
  });

  function addComponent() {
    const component = componentPage?.data.find((item) => item.id === selectedComponentId);
    if (!component || lines.some((line) => line.componentId === component.id)) return;
    setLines((current) => [
      ...current,
      { componentId: component.id, code: component.code, name: component.name, qty: "1" },
    ]);
    setSelectedComponentId("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const items = lines
      .filter((line) => line.qty.trim() !== "" && Number(line.qty) !== 0)
      .map((line) => ({ componentId: line.componentId, qtyNeeded: Number(line.qty) }));
    if (
      items.length === 0 ||
      items.some((item) => !Number.isInteger(item.qtyNeeded) || item.qtyNeeded <= 0)
    ) {
      setError("Add at least one component with a positive whole-number quantity.");
      return;
    }
    mutation.mutate(items);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="live-order-title" className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="border-b px-6 py-4">
          <h3 id="live-order-title" className="text-xl font-semibold text-slate-900">
            Order components for this class
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {session.routineSlot.section.course.code} section {session.routineSlot.section.name}
            {" · "}{session.date.slice(0, 10)} · {session.routineSlot.startTime}–{session.routineSlot.endTime}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          <p className="text-sm text-slate-600">
            {session.experimentId
              ? "Experiment items are prefilled for the class groups. Change quantities to match what you will actually use; enter zero to leave an item out."
              : "Choose the components and quantities this class will actually use."}
          </p>

          {loadingExperiment ? (
            <p className="text-sm text-slate-500">Loading experiment items...</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {lines.map((line) => (
                <div key={line.componentId} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{line.code}</span> · {line.name}
                  </div>
                  <input
                    aria-label={`Quantity for ${line.name}`}
                    type="number"
                    min="0"
                    step="1"
                    value={line.qty}
                    onChange={(event) =>
                      setLines((current) => current.map((item) =>
                        item.componentId === line.componentId ? { ...item, qty: event.target.value } : item,
                      ))
                    }
                    className="w-20 rounded-md border px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((item) => item.componentId !== line.componentId))}
                    className="text-sm text-red-700 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {lines.length === 0 && <p className="text-sm text-slate-500">No components selected yet.</p>}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-sm font-medium text-slate-700">
              Find a component
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setSelectedComponentId(""); }}
                placeholder="Search code or name"
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
            <select
              aria-label="Component to add"
              value={selectedComponentId}
              onChange={(event) => setSelectedComponentId(event.target.value)}
              className="max-w-56 rounded-md border px-3 py-2 text-sm"
            >
              <option value="">{loadingComponents ? "Loading..." : "Select component"}</option>
              {componentPage?.data.filter((item) => !lines.some((line) => line.componentId === item.id)).map((item) => (
                <option key={item.id} value={item.id}>{item.code} · {item.name}</option>
              ))}
            </select>
            <button type="button" onClick={addComponent} disabled={!selectedComponentId} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
              Add
            </button>
          </div>

          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending || loadingExperiment} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {mutation.isPending ? "Submitting..." : "Place order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
