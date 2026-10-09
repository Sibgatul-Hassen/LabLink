import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import type { Toast } from "./toast";

export default function ToastViewport() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const onToast = (event: Event) => {
      const toast = (event as CustomEvent<Toast>).detail;
      setToasts((current) => [...current.slice(-3), toast]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 4500);
    };
    window.addEventListener("lablink:toast", onToast);
    return () => window.removeEventListener("lablink:toast", onToast);
  }, []);
  return <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(420px,calc(100vw-32px))] flex-col gap-2">
    <AnimatePresence>{toasts.map((toast) => <motion.div key={toast.id} role={toast.kind === "error" ? "alert" : "status"}
      initial={reduceMotion ? false : { opacity: 0, x: 24, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, x: 20 }}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-sm text-[var(--app-ink)] shadow-xl">
      {toast.kind === "success" ? <CheckCircle2 size={20} className="shrink-0 text-emerald-600" /> : <CircleAlert size={20} className="shrink-0 text-rose-600" />}
      <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
      <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification" className="rounded-lg p-0.5 text-[var(--app-muted)] hover:bg-[var(--app-surface-soft)]"><X size={16} /></button>
    </motion.div>)}</AnimatePresence>
  </div>;
}
