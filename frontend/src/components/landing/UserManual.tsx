import { useState } from "react";

interface ManualSection {
  id: string;
  label: string;
  who: string;
  steps: { title: string; body: string }[];
  tip?: string;
}

// Written against the role guards in backend/src/routes and the sidebar map in Layout.tsx.
const SECTIONS: ManualSection[] = [
  {
    id: "start",
    label: "Getting started",
    who: "Everyone",
    steps: [
      { title: "Get an account", body: "Accounts are created by a System Administrator. Use Sign up on this page to request one with your university email." },
      { title: "Sign in", body: "Click Login and enter your university email and password. You land on your dashboard." },
      { title: "Find your way", body: "The left sidebar only shows the screens your role can use — if a screen is missing, your role doesn't need it." },
      { title: "Stay signed in", body: "For security your session is kept in memory only. Refreshing the page signs you out — just log in again." },
      { title: "Watch the bell", body: "The notification bell in the top bar alerts you to low stock, approvals and other events that need you." },
    ],
  },
  {
    id: "student",
    label: "Student",
    who: "STUDENT",
    steps: [
      { title: "Browse components", body: "Open Components to search the catalogue by name or filter by category." },
      { title: "Check availability", body: "Stock Management and Department Quotas show what is on hand and what your department may hold." },
      { title: "Request for a project", body: "Under Requisitions, create a personal requisition, add component lines and submit it." },
      { title: "Return on time", body: "Late, lost or damaged items create penalties. See them under Penalties." },
    ],
    tip: "An outstanding penalty balance above the configured threshold blocks new personal requisitions until it is cleared.",
  },
  {
    id: "instructor",
    label: "Instructor",
    who: "INSTRUCTOR",
    steps: [
      { title: "Know your classes", body: "Courses, Sections, Routine Slots and Class Sessions show your teaching schedule." },
      { title: "Pick the experiment", body: "On a class session, set which experiment the class is running today." },
      { title: "Order live", body: "When the class starts, place a live order for exactly what the class needs from the session." },
      { title: "Let the pool work", body: "Anything your class doesn't take stays in the department pool for other classes in your department." },
    ],
  },
  {
    id: "labasst",
    label: "Lab Assistant",
    who: "LAB_ASSISTANT",
    steps: [
      { title: "Draft ahead", body: "From Class Sessions, draft a requisition for an upcoming session from its experiment's item list." },
      { title: "Refine and submit", body: "Adjust quantities under Requisitions, then submit — LabLink resolves it through the five tiers." },
      { title: "Follow the result", body: "Open a requisition's resolution to see what came from the pool, a substitute, spares, a borrow or a purchase." },
      { title: "Review suggestions", body: "Suggestions surfaces rule-based recommendations with evidence — accept or dismiss them." },
    ],
  },
  {
    id: "storehead",
    label: "Dept Store Head",
    who: "DEPT_STORE_HEAD",
    steps: [
      { title: "Guard your quota", body: "Department Quotas and Peak Class Load show your department's holdings against its busiest hour." },
      { title: "Lend and borrow", body: "Borrow Requests lists incoming and outgoing requests. Approve or reject, then record hand-over and return." },
      { title: "Endorse purchases", body: "You are rung 2 of the purchase ladder — endorse or reject requests in Purchase Requests." },
      { title: "Read the trends", body: "Analytics and Suggestions help you spot shortages before they happen." },
    ],
  },
  {
    id: "central",
    label: "Central Store Officer",
    who: "CENTRAL_STORE_OFFICER",
    steps: [
      { title: "Keep the catalogue", body: "Add and edit components in Components; set reorder points, adjust and transfer stock in Stock Management." },
      { title: "Set quotas", body: "Generate quota suggestions from class load, then confirm each department's quota." },
      { title: "Issue and receive back", body: "Preview and issue ready requisitions, then record returns — good, damaged, lost or used up." },
      { title: "Run purchasing", body: "Approve rung 1 of purchase requests, aggregate them, and record received stock." },
      { title: "Handle damage", body: "Damage Reports tracks items from report through maintenance to repaired or written off." },
    ],
  },
  {
    id: "officeadmin",
    label: "Office Admin",
    who: "OFFICE_ADMIN",
    steps: [
      { title: "Final purchase approval", body: "You are rung 3 of the purchase ladder — give the final approval in Purchase Requests." },
      { title: "Manage penalties", body: "Configure penalty rates, assess penalties, and record payments or waivers under Penalties." },
      { title: "Monitor", body: "Analytics and Peak Class Load give a university-wide view of demand and spending." },
    ],
  },
  {
    id: "sysadmin",
    label: "System Admin",
    who: "SYSTEM_ADMIN",
    steps: [
      { title: "People and structure", body: "Create users and assign roles in Users; manage Departments, Courses, Sections, Labs and Routine Slots." },
      { title: "Experiments", body: "Define each course's experiments and the components each group needs." },
      { title: "Generate sessions", body: "Generate dated class sessions from the routine so drafts and live orders have something to attach to." },
      { title: "Full catalogue control", body: "You can do everything the Central Store Officer can, and are the only role that can delete components." },
    ],
  },
];

export default function UserManual() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
      <nav aria-label="Manual sections" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            aria-pressed={s.id === active}
            className={`flex-shrink-0 rounded-xl px-3 py-2 text-left text-sm transition-all duration-300 ${
              s.id === active
                ? "bg-brand-400 font-semibold text-slate-950 shadow-lg shadow-brand-500/20 md:translate-x-1"
                : "bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div key={section.id} className="manual-swap min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-semibold text-white">{section.label}</h3>
          <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] text-slate-400">{section.who}</span>
        </div>
        <ol className="space-y-3">
          {section.steps.map((step, i) => (
            <li
              key={step.title}
              className="stagger-in flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-slate-950">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-slate-100">{step.title}</p>
                <p className="text-sm text-slate-400">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {section.tip && (
          <p className="stagger-in mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3.5 text-sm text-amber-100" style={{ animationDelay: `${section.steps.length * 70}ms` }}>
            <span className="font-semibold">Note: </span>
            {section.tip}
          </p>
        )}
      </div>
    </div>
  );
}
