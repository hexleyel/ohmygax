"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.two_factor_required) {
        router.push("/two-factor-authentication");
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || "Login failed");
        return;
      }

      // Pick up the new session before navigating, otherwise the shell keeps
      // the pre-login (signed-out) state until a manual page refresh.
      await refresh();

      if (data.must_change_password) {
        router.push("/settings?forcePasswordChange=1");
        return;
      }

      router.push("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.42em] text-blue-600">
            OhMyGas
          </p>
          <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-slate-900">
            Island Gas
            <span className="block text-[19px] font-semibold tracking-tight text-slate-600">
              LPG Store
            </span>
          </h1>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
            Point of Sale
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-2.5 text-[15px] font-medium text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-2.5 pr-16 text-[15px] font-medium text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-blue-700"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}

          <button
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-[15px] font-semibold tracking-wide text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-7 text-center text-[11px] font-medium tracking-wide text-slate-400">
          OhMyGas POS v1.0 · Kalibo, Aklan
        </p>
      </div>
    </div>
  );
}
