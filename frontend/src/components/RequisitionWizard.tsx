import axios from "axios";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSessions } from "../api/session.api";
import {
  createRequisition,
  submitRequisition,
  updateRequisitionLine,
  removeRequisitionLine,
  getRequisitionResolution
} from "../api/requisition.api";
import type { Requisition, ResolutionBreakdownLine } from "../types";

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;

    if (typeof message === "string") {
      return message;
    }
  }

  return fallback;
}

// 기존 ResolutionBreakdownPanel - আপনি চাইলে Requisitions.tsx থেকে এটি এক্সপোর্ট করে এখানে ইমপোর্ট করতে পারেন।
function BreakdownPanel({ requisitionId }: { requisitionId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["requisition-resolution", requisitionId],
    queryFn: () => getRequisitionResolution(requisitionId),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading breakdown...</p>;
  if (isError || !data) return <p className="text-sm text-red-600">Failed to load resolution.</p>;

  return (
    <ul className="divide-y divide-slate-100 bg-slate-50 p-4 rounded-lg">
      {data.lines.map((line: ResolutionBreakdownLine) => (
        <li key={line.lineId} className="py-2 text-sm text-slate-700 flex justify-between">
          <span className="font-medium text-slate-900">{line.componentCode}</span>
          <span className={line.qtyShort > 0 ? "text-red-600 font-bold" : "text-green-600"}>
            {line.qtyFromOwn} own · {line.qtyFromOffice} office · {line.qtyFromBorrow} borrow · {line.qtyShort} short
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function RequisitionWizard({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [draftReq, setDraftReq] = useState<Requisition | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: sessionsData, isLoading: loadingSessions } = useQuery({
    queryKey: ["sessions", "for-requisition"],
    queryFn: () => getSessions({ limit: 100 }),
  });

  const createDraftMut = useMutation({
    mutationFn: (sessionId: string) => createRequisition({ type: "CLASS", classSessionId: sessionId }),
    onSuccess: (data) => {
      setDraftReq(data);
      setStep(2);
      setErrorMsg("");
    },
    onError: (err: unknown) =>
      setErrorMsg(getErrorMessage(err, "Failed to create draft.")),
  });

  const submitMut = useMutation({
    mutationFn: (reqId: string) => submitRequisition(reqId),
    onSuccess: () => {
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
    },
    onError: (err: unknown) =>
      setErrorMsg(getErrorMessage(err, "Submit failed.")),
  });

  const updateLineMut = useMutation({
    mutationFn: ({ reqId, lineId, qtyNeeded }: { reqId: string, lineId: string, qtyNeeded: number }) => 
      updateRequisitionLine(reqId, lineId, qtyNeeded),
    onSuccess: () => {
      // Re-fetch draft logic here if needed, or optimistically update
    }
  });

  const removeLineMut = useMutation({
    mutationFn: ({ reqId, lineId }: { reqId: string, lineId: string }) => removeRequisitionLine(reqId, lineId),
    onSuccess: () => {
       // Filter out removed line from local state
       setDraftReq(prev => prev ? { ...prev, lines: prev.lines.filter(l => l.id !== removeLineMut.variables?.lineId) } : prev);
    }
  });

  const sessions = sessionsData?.data || [];
  
  // Step 1: Filter valid sessions (e.g., must have an experiment, must not already have a requisition)
  // Assuming backend handles the strict filtering, or you can check `session.experimentId`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {step === 1 ? "Step 1: Pick Class Session" : step === 2 ? "Step 2: Review Draft" : "Step 3: Resolution"}
          </h3>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700">×</button>
        </div>

        <div className="p-6">
          {errorMsg && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>}

          {step === 1 && (
            <div className="space-y-4">
              {loadingSessions ? <p>Loading sessions...</p> : (
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 outline-none"
                >
                  <option value="">-- Select a Session --</option>
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.date.slice(0, 10)} - Section {s.routineSlot.section.name} ({s.routineSlot.startTime})
                    </option>
                  ))}
                </select>
              )}
              <div className="flex justify-end pt-4">
                <button 
                  onClick={() => createDraftMut.mutate(selectedSessionId)}
                  disabled={!selectedSessionId || createDraftMut.isPending}
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {createDraftMut.isPending ? "Drafting..." : "Next: Review Draft"}
                </button>
              </div>
            </div>
          )}

          {step === 2 && draftReq && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Adjust auto-calculated quantities if needed. Remove lines not required for this specific class.</p>
              <ul className="divide-y border rounded-lg">
                {draftReq.lines.map(line => (
                  <li key={line.id} className="flex justify-between items-center p-3">
                    <span className="text-sm font-medium">{line.component.name}</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        defaultValue={line.qtyNeeded}
                        onBlur={(e) => updateLineMut.mutate({ reqId: draftReq.id, lineId: line.id, qtyNeeded: Number(e.target.value) })}
                        className="w-20 border rounded p-1 text-center" 
                      />
                      <button 
                        onClick={() => removeLineMut.mutate({ reqId: draftReq.id, lineId: line.id })}
                        className="text-red-500 px-2"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between pt-4">
                <button onClick={() => setStep(1)} className="border px-4 py-2 rounded-lg">Back</button>
                <button 
                  onClick={() => submitMut.mutate(draftReq.id)}
                  disabled={submitMut.isPending}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg"
                >
                  {submitMut.isPending ? "Resolving..." : "Submit Requisition"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && draftReq && (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg text-green-800 font-semibold text-center mb-4">
                Requisition Submitted Successfully!
              </div>
              <BreakdownPanel requisitionId={draftReq.id} />
              <div className="flex justify-center pt-4">
                <button onClick={() => { onSuccess(); onClose(); }} className="bg-slate-900 text-white px-6 py-2 rounded-lg">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}