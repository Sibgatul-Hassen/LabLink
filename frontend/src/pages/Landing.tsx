import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuthStore } from "../store/authStore";
import LandingModal from "../components/landing/LandingModal";
import ComponentCollage from "../components/landing/ComponentCollage";
import QuoteCarousel from "../components/landing/QuoteCarousel";
import AboutContent from "../components/landing/AboutContent";
import UserManual from "../components/landing/UserManual";
import SignupRequest, { CONTACT_EMAIL } from "../components/landing/SignupRequest";
import logoMark from "../assets/brand/logo-mark.webp";

type ModalKind = "about" | "manual" | "signup" | null;

const TIERS = [
  { label: "Department pool", hint: "free, instant" },
  { label: "Substitute", hint: "approved stand-in" },
  { label: "Spare pool", hint: "central reserve" },
  { label: "Borrow", hint: "lender approves" },
  { label: "Purchase", hint: "3-rung ladder" },
];

const FACTS = [
  { value: 7, label: "roles, each with its own view" },
  { value: 5, label: "tiers before anything is bought" },
  { value: 3, label: "approval rungs on every purchase" },
];

function CountUp({ to, start }: { to: number; start: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - began) / 1100);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, start]);
  return <>{n}</>;
}

// Adds `is-visible` to every `.reveal` element as it scrolls into view.
function useReveal() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);
  return rootRef;
}

function CircuitBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-slate-950" />
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.35]" preserveAspectRatio="none" viewBox="0 0 1200 800">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1200" height="800" fill="url(#grid)" />
        {[
          "M0 160 H240 L300 220 H560 L600 180 H1200",
          "M0 520 H180 L240 460 H520 L580 520 H880 L940 460 H1200",
          "M320 0 V120 L380 180 V420 L320 480 V800",
          "M900 0 V260 L960 320 V600 L900 660 V800",
        ].map((d, i) => (
          <g key={d}>
            <path d={d} stroke="rgba(252,104,0,0.16)" strokeWidth="1.5" fill="none" />
            <path d={d} stroke="#fc6800" strokeWidth="2" fill="none" className="trace-pulse" style={{ animationDelay: `${i * 1.3}s` }} />
          </g>
        ))}
        {[[240, 160], [560, 220], [580, 520], [380, 180], [960, 320], [880, 520]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#fc6800" className="node-pulse" />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-slate-950 to-transparent" />
    </div>
  );
}

export default function Landing() {
  const token = useAuthStore((s) => s.token);
  const [modal, setModal] = useState<ModalKind>(null);
  const [scrolled, setScrolled] = useState(false);
  const closeModal = useCallback(() => setModal(null), []);
  const rootRef = useReveal();

  const factsRef = useRef<HTMLDivElement>(null);
  const [factsSeen, setFactsSeen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = factsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setFactsSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="landing relative min-h-screen overflow-x-clip text-slate-200">
      <CircuitBackdrop />

      {/* ───────── header ───────── */}
      <header
        className={`sticky top-0 z-40 transition-all duration-500 ${
          scrolled ? "border-b border-white/10 bg-slate-950/70 shadow-lg shadow-black/20 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
          <Link to="/" className="group flex items-center gap-2.5" aria-label="LabLink home">
            <img
              src={logoMark}
              alt=""
              className="h-8 w-auto transition-transform duration-500 group-hover:scale-110 sm:h-10"
            />
            <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              <span className="text-brand-500">Lab</span>
              <span className="text-white">Link</span>
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            {token ? (
              <Link to="/dashboard" className="shine rounded-full bg-gradient-to-r from-brand-400 to-brand-600 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-110 sm:px-5">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-brand-300/50 hover:bg-white/5 sm:px-5"
                >
                  Login
                </Link>
                <button
                  type="button"
                  onClick={() => setModal("signup")}
                  className="shine rounded-full bg-gradient-to-r from-brand-400 to-brand-600 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-brand-500/20 transition hover:shadow-brand-400/40 hover:brightness-110 sm:px-5"
                >
                  Sign up
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* ───────── hero ───────── */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8 lg:pb-28">
          <div>
            <p className="hero-rise inline-flex items-center gap-2 rounded-full border border-brand-300/20 bg-brand-400/10 px-3 py-1 text-xs font-medium text-brand-200" style={{ animationDelay: "80ms" }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-300" />
              United International University · Lab component management
            </p>

            <h1 className="font-display mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              <span className="hero-rise block" style={{ animationDelay: "180ms" }}>Every component.</span>
              <span className="hero-rise block" style={{ animationDelay: "300ms" }}>One room.</span>
              <span className="hero-rise text-gradient-animated block pb-1" style={{ animationDelay: "420ms" }}>Zero idle stock.</span>
            </h1>

            <p className="hero-rise mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg" style={{ animationDelay: "560ms" }}>
              LabLink tracks every Arduino, resistor and oscilloscope in the central component room. Instructors order
              exactly what a class needs as it starts; whatever the class leaves behind flows back to the department pool
              for the next class — and a purchase is only ever the last resort.
            </p>

            <div className="hero-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "680ms" }}>
              <Link
                to={token ? "/dashboard" : "/login"}
                className="shine group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-brand-100"
              >
                {token ? "Go to dashboard" : "Get started"}
                <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 10h11m-4-5 5 5-5 5" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => setModal("manual")}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-brand-300/50 hover:bg-white/5"
              >
                How it works
              </button>
            </div>

            <div ref={factsRef} className="hero-rise mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6" style={{ animationDelay: "800ms" }}>
              {FACTS.map((f) => (
                <div key={f.label}>
                  <p className="font-display text-3xl font-bold text-white">
                    <CountUp to={f.value} start={factsSeen} />
                  </p>
                  <p className="mt-1 text-xs leading-snug text-slate-400">{f.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-rise" style={{ animationDelay: "350ms" }}>
            <ComponentCollage />
          </div>
        </section>

        {/* ───────── five tiers ───────── */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="reveal text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-300/80">Share first · buy last</p>
            <h2 className="font-display mt-3 text-3xl font-bold text-white sm:text-4xl">Five tiers stand between a request and a purchase</h2>
          </div>

          <div className="relative mt-12">
            <div className="absolute left-[10%] right-[10%] top-7 hidden h-px bg-white/10 md:block">
              <div className="tier-runner" />
            </div>
            <ol className="grid gap-4 md:grid-cols-5">
              {TIERS.map((tier, i) => (
                <li key={tier.label} className="reveal relative flex items-center gap-4 md:flex-col md:text-center" style={{ transitionDelay: `${i * 120}ms` }}>
                  <span className={`relative z-10 grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl border text-lg font-bold ${
                    i === TIERS.length - 1
                      ? "border-amber-300/40 bg-amber-400/15 text-amber-200"
                      : "border-brand-300/30 bg-slate-900 text-brand-200"
                  }`}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display font-semibold text-white">{tier.label}</p>
                    <p className="text-sm text-slate-400">{tier.hint}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────── quotes ───────── */}
        <section className="reveal mx-auto max-w-7xl px-4 pb-28 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.01] px-6 py-14 sm:px-12">
            <div className="orb orb-quote" aria-hidden="true" />
            <QuoteCarousel />
          </div>
        </section>
      </main>

      {/* ───────── footer ───────── */}
      <footer className="border-t border-white/10 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-slate-400 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <p>
              <span aria-hidden="true">©</span>
              <span className="sr-only">Copyright</span> {new Date().getFullYear()}{" "}
              <span className="font-medium text-slate-200">Sibgatul Hassen</span>. All rights reserved.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              aria-label={`Email ${CONTACT_EMAIL}`}
              title={CONTACT_EMAIL}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-slate-300 transition hover:-translate-y-0.5 hover:border-brand-300/50 hover:bg-brand-400/10 hover:text-brand-200"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </a>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setModal("about")} className="link-underline font-medium text-slate-200 hover:text-white">
              About
            </button>
            <button
              type="button"
              onClick={() => setModal("manual")}
              aria-label="Help — user manual"
              title="User manual"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-slate-300 transition hover:-translate-y-0.5 hover:border-brand-300/50 hover:bg-brand-400/10 hover:text-brand-200"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9.5" />
                <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.5-2.8 4" />
                <circle cx="12" cy="17.4" r="0.6" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </footer>

      <LandingModal open={modal === "about"} onClose={closeModal} eyebrow="About LabLink" title="What we're building, and why">
        <AboutContent />
      </LandingModal>
      <LandingModal open={modal === "manual"} onClose={closeModal} eyebrow="Help" title="User manual" wide>
        <UserManual />
      </LandingModal>
      <LandingModal open={modal === "signup"} onClose={closeModal} eyebrow="Sign up" title="Request a LabLink account">
        <SignupRequest />
      </LandingModal>
    </div>
  );
}
