import { useEffect, useRef, useState, type ReactNode } from "react";

interface LandingModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  wide?: boolean;
}

const EXIT_MS = 320;

export default function LandingModal({ open, onClose, title, eyebrow, children, wide = false }: LandingModalProps) {
  // `mounted` keeps the dialog in the DOM while the exit transition plays.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="presentation">
      <div
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="landing-modal-title"
        className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/95 text-slate-200 shadow-2xl shadow-brand-950/50 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          wide ? "max-w-4xl" : "max-w-2xl"
        } ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-95 opacity-0"}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/60 to-transparent" />
        <header className="flex items-center gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="group grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-slate-300 transition hover:rotate-90 hover:border-rose-300/50 hover:bg-rose-500/15 hover:text-rose-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300/80">{eyebrow}</p>}
            <h2 id="landing-modal-title" className="font-display truncate text-lg font-semibold text-white sm:text-xl">
              {title}
            </h2>
          </div>
        </header>
        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}
