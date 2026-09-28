import { FormEvent, useState } from "react";
import axios from "axios";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Boxes, Eye, EyeOff, FlaskConical, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { login as loginRequest } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim()) return setError("Email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email address");
    if (!password) return setError("Password is required");
    try {
      setIsLoading(true);
      const response = await loginRequest({ email: email.trim(), password });
      login(response.token, response.user);
      navigate("/dashboard", { replace: true });
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        if (!requestError.response || requestError.response.status >= 500) {
          setError("The service is unavailable. Check that the API and database are running, then try again.");
        } else {
          const message: unknown = requestError.response.data?.error;
          setError(typeof message === "string" ? message : "Unable to sign in");
        }
      } else setError("Unable to sign in");
    } finally { setIsLoading(false); }
  }

  return <main className="login-shell relative grid min-h-screen overflow-hidden bg-[#f3f5fa] text-[#182438] lg:grid-cols-[minmax(0,1fr)_minmax(440px,42%)]">
    <div className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-[#172238] p-12 text-[#f2f5fb] lg:flex xl:p-16">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-36 h-[520px] w-[520px] rounded-full border border-indigo-300/10 bg-indigo-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -left-36 h-[560px] w-[560px] rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500 shadow-xl shadow-indigo-950/40"><FlaskConical size={26} /></span><span><strong className="block text-2xl font-bold tracking-tight">LabLink</strong><small className="text-xs font-semibold uppercase tracking-[.2em] text-slate-300">Laboratory operations</small></span></div>
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }} className="relative max-w-xl">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/10 px-4 py-2 text-xs font-semibold tracking-wide text-indigo-200"><span className="h-2 w-2 rounded-full bg-emerald-300" /> A clearer view of every lab resource</div>
        <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.045em] xl:text-6xl">Everything your lab needs, in one place.</h1>
        <p className="mt-6 max-w-md text-base leading-7 text-slate-300">Manage components, class sessions, requisitions and stock with a connected view of your laboratory.</p>
        <div className="mt-12 grid max-w-md grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-500/30 bg-slate-700/30 p-5 backdrop-blur-md"><Boxes size={23} className="text-indigo-300" /><p className="mt-4 text-sm font-semibold">Inventory clarity</p><p className="mt-1 text-xs leading-5 text-slate-300">Find the right components and track availability.</p></div>
          <div className="rounded-2xl border border-slate-500/30 bg-slate-700/30 p-5 backdrop-blur-md"><ShieldCheck size={23} className="text-emerald-300" /><p className="mt-4 text-sm font-semibold">Role-aware access</p><p className="mt-1 text-xs leading-5 text-slate-300">The right tools for each member of your team.</p></div>
        </div>
      </motion.div>
      <p className="relative text-xs text-slate-400">United International University · Laboratory resource management</p>
    </div>
    <div className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10 lg:px-12">
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45, delay: .05 }} className="w-full max-w-md">
        <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-indigo-700"><ArrowLeft size={16} /> Back to home</Link>
        <div className="mb-9 flex items-center gap-3 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white"><FlaskConical size={23} /></span><strong className="text-2xl tracking-tight">LabLink</strong></div>
        <div className="mb-8"><p className="mb-2 text-xs font-bold uppercase tracking-[.15em] text-indigo-700">Welcome back</p><h2 className="text-[2.2rem] font-bold tracking-tight text-[#182438]">Sign in to LabLink</h2><p className="mt-2 text-sm text-slate-600">Enter your credentials to continue to your workspace.</p></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isLoading} placeholder="name@uiu.ac.bd" className="h-12 w-full rounded-xl border border-slate-300 bg-[#fbfcff] px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60" /></div>
          <div><label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label><div className="relative"><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isLoading} placeholder="Enter your password" className="h-12 w-full rounded-xl border border-slate-300 bg-[#fbfcff] px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 transition hover:text-indigo-700">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm leading-5 text-rose-800">{error}</div>}
          <button type="submit" disabled={isLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700 focus-visible:outline-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{isLoading ? <><LoaderCircle size={18} className="animate-spin" /> Signing in...</> : <>Sign in <ArrowRight size={17} /></>}</button>
        </form>
        <div className="mt-8 flex items-center gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500"><LockKeyhole size={14} /> Your session is protected and ends when you sign out.</div>
      </motion.div>
    </div>
  </main>;
}
