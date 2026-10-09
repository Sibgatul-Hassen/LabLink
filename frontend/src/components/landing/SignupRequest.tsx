import { useState, type FormEvent } from "react";

export const CONTACT_EMAIL = "sibgatulhassen@gmail.com";

const ROLES = [
  "Student",
  "Instructor",
  "Lab Assistant",
  "Dept Store Head",
  "Central Store Officer",
  "Office Admin",
];
const DEPARTMENTS = ["CSE", "EEE", "CIVIL", "OFFICE"];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-brand-300/60 focus:bg-white/10 focus:ring-2 focus:ring-brand-300/20";

// LabLink has no public self-registration: roles grant real authority, so a
// System Administrator creates every account. This form drafts the request email.
export default function SignupRequest() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [error, setError] = useState("");
  const [drafted, setDrafted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    const subject = `LabLink account request — ${fullName.trim()}`;
    const body = [
      "Hello,",
      "",
      "I would like a LabLink account.",
      "",
      `Full name: ${fullName.trim()}`,
      `University email: ${email.trim()}`,
      `Requested role: ${role}`,
      `Department: ${department}`,
      "",
      "Thank you.",
    ].join("\n");

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setDrafted(true);
  }

  if (drafted) {
    return (
      <div className="stagger-in py-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" className="check-draw" />
          </svg>
        </div>
        <p className="font-display mt-4 text-lg font-semibold text-white">Your request is drafted</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
          Your email app should have opened with the request filled in — press send there. If nothing opened, email{" "}
          <span className="text-brand-200">{CONTACT_EMAIL}</span> with your name, email, role and department.
        </p>
        <button type="button" onClick={() => setDrafted(false)} className="mt-5 text-sm text-brand-300 underline-offset-4 hover:underline">
          Edit request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <p className="rounded-2xl border border-brand-300/20 bg-brand-400/10 p-3.5 text-sm text-brand-50">
        LabLink accounts are created by a System Administrator, because every role carries real authority over
        university stock. Fill this in and we'll draft the request email for you.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Full name</span>
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">University email</span>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@uiu.ac.bd" autoComplete="email" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Role you need</span>
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} className="bg-slate-900">{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Department</span>
          <select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value)}>
            {DEPARTMENTS.map((d) => (
              <option key={d} className="bg-slate-900">{d}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="shine w-full rounded-xl bg-gradient-to-r from-brand-400 to-brand-600 px-4 py-2.5 font-semibold text-slate-950 transition hover:brightness-110"
      >
        Draft access request
      </button>
    </form>
  );
}
