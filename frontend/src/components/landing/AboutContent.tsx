import ThemeLogo from "../ThemeLogo";

const TIERS = [
  { name: "Department pool", detail: "Whatever your department's classes haven't taken is free to draw — no approval." },
  { name: "Approved substitute", detail: "An equivalent part that has been approved as a stand-in, at a set ratio." },
  { name: "Central spare pool", detail: "Stock the office holds outside every department's quota." },
  { name: "Borrow across departments", detail: "Another department's unused quota, with the lender's approval." },
  { name: "Purchase request", detail: "Climbs a three-rung ladder: Central Store → Dept Store Head → Office Admin." },
];

const PILLARS = [
  { title: "One room, one truth", body: "Every component lives in the central office component room. Every movement — issue, return, transfer, damage — is written to a stock ledger." },
  { title: "Quotas sized from reality", body: "Each department's quota is sized from its peak simultaneous class load, so shelves hold what classes actually need." },
  { title: "Share first, buy last", body: "Sharing inside a department is free; only crossing a department boundary needs approval, and buying is the very last resort." },
];

export default function AboutContent() {
  return (
    <div className="space-y-7 text-sm leading-relaxed">
      <ThemeLogo variant="full" alt="LabLink — Connect · Collaborate · Innovate" className="stagger-in mx-auto block w-56 sm:w-64" />

      <section className="stagger-in" style={{ animationDelay: "60ms" }}>
        <p className="text-base text-slate-300">
          <span className="font-semibold text-white">LabLink</span> is the laboratory component management system for{" "}
          <span className="text-brand-200">United International University</span>. It replaces paper registers and
          guesswork with a single, role-aware system that knows what is on the shelf, who holds it, and what every class
          will need next.
        </p>
      </section>

      <section className="stagger-in rounded-2xl border border-brand-300/20 bg-gradient-to-br from-brand-500/10 to-brand-600/10 p-5" style={{ animationDelay: "140ms" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">Our ultimate goal</p>
        <p className="font-display mt-2 text-lg font-semibold text-white">
          No lab class should ever stall for want of a component — and no component should sit idle while another class goes without.
        </p>
        <p className="mt-2 text-slate-300">
          We want the university to buy less, share more, and account for every part — so that money spent on
          equipment turns into hands-on learning, not dusty shelves.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {PILLARS.map((p, i) => (
          <div key={p.title} className="stagger-in rounded-2xl border border-white/10 bg-white/[0.03] p-4" style={{ animationDelay: `${220 + i * 80}ms` }}>
            <p className="font-display font-semibold text-white">{p.title}</p>
            <p className="mt-1 text-slate-400">{p.body}</p>
          </div>
        ))}
      </section>

      <section className="stagger-in" style={{ animationDelay: "480ms" }}>
        <p className="font-display mb-3 font-semibold text-white">How a requisition gets filled</p>
        <ol className="relative space-y-3 border-l border-white/10 pl-5">
          {TIERS.map((tier, i) => (
            <li key={tier.name} className="relative">
              <span className="absolute -left-[1.72rem] top-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand-400 text-[10px] font-bold text-slate-950">
                {i + 1}
              </span>
              <p className="font-medium text-slate-100">{tier.name}</p>
              <p className="text-slate-400">{tier.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="stagger-in rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-slate-400" style={{ animationDelay: "560ms" }}>
        Built by the LabLink team — Pabel Sikder, Saiful Islam, Sibgatul Hassen and Azmain Elahi — with React, Express,
        PostgreSQL and Prisma.
      </section>
    </div>
  );
}
