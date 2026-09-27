import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { AppDialogContext, type AppDialog } from "./dialog";

type Request = { kind: "confirm" | "prompt"; message: string; required: boolean };

export default function AppDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((result: boolean | string | null) => void) | null>(null);
  const reduceMotion = useReducedMotion();

  const finish = useCallback((result: boolean | string | null) => {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
    setValue("");
  }, []);

  const api = useMemo<AppDialog>(() => ({
    confirm: (message) => new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve as (result: boolean | string | null) => void;
      setValue("");
      setRequest({ kind: "confirm", message, required: false });
    }),
    prompt: (message, options) => new Promise<string | null>((resolve) => {
      resolver.current?.(null);
      resolver.current = resolve as (result: boolean | string | null) => void;
      setValue("");
      setRequest({ kind: "prompt", message, required: options?.required ?? false });
    }),
  }), []);

  return <AppDialogContext.Provider value={api}>
    {children}
    <Dialog.Root open={request !== null} onOpenChange={(open) => { if (!open) finish(request?.kind === "confirm" ? false : null); }}>
      <Dialog.Portal>
        <Dialog.Overlay asChild><motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[90] bg-slate-950/55 backdrop-blur-md" /></Dialog.Overlay>
        {request && <Dialog.Content asChild><motion.div initial={reduceMotion ? false : { opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} style={{ x: "-50%", y: "-50%" }} transition={{ type: "spring", stiffness: 320, damping: 28 }} className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,460px)] rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-[var(--app-ink)] shadow-2xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent)]"><AlertTriangle size={22} /></span><Dialog.Close className="rounded-lg p-1 text-[var(--app-muted)] hover:bg-[var(--app-surface-soft)]" aria-label="Close dialog"><X size={18} /></Dialog.Close></div>
          <Dialog.Title className="text-lg font-bold">{request.kind === "confirm" ? "Please confirm" : "Add details"}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-[var(--app-muted)]">{request.message}</Dialog.Description>
          {request.kind === "prompt" && <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (!request.required || value.trim())) finish(value.trim()); }} className="mt-5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 py-2.5 text-sm outline-none focus:border-[var(--app-accent)]" aria-label={request.message} />}
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => finish(request.kind === "confirm" ? false : null)} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--app-surface-soft)]">Cancel</button><button type="button" disabled={request.kind === "prompt" && request.required && !value.trim()} onClick={() => finish(request.kind === "confirm" ? true : value.trim())} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{request.kind === "confirm" ? "Confirm" : "Continue"}</button></div>
        </motion.div></Dialog.Content>}
      </Dialog.Portal>
    </Dialog.Root>
  </AppDialogContext.Provider>;
}
