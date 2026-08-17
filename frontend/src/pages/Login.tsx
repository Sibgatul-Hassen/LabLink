import { FormEvent, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

import { login as loginRequest } from "../api/auth.api";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    try {
      setIsLoading(true);

      const response = await loginRequest({
        email: email.trim(),
        password,
      });

      login(response.token, response.user);
      navigate("/dashboard", { replace: true });
    } catch (requestError: unknown) {
      if (axios.isAxiosError(requestError)) {
        const message = requestError.response?.data?.error;

        if (typeof message === "string") {
          setError(message);
        } else {
          setError("Unable to sign in");
        }
      } else {
        setError("Unable to sign in");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">LabLink</h1>

          <p className="mt-2 text-sm text-slate-600">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isLoading}
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              placeholder="student@uiu.ac.bd"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password
            </label>

            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                placeholder="Enter your password"
              />

              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={isLoading}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
