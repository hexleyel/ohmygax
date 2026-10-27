"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

export default function TwoFactorAuthenticationPage() {
  const { user, loading, refresh } = useSession();
  const router = useRouter();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9]" />;
  }

  if (user && user.role !== "admin") {
    // 2FA setup/management is admin-only server-side; keep cashiers from
    // even seeing the form (their requests would just 403).
    router.replace("/dashboard");
    return <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9]" />;
  }

  return user ? <ManageTwoFactor /> : <VerifyTwoFactor onVerified={refresh} />;
}

function VerifyTwoFactor({ onVerified }: { onVerified: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/two-factor/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Verification failed");
        return;
      }
      await onVerified();
      router.push(data.must_change_password ? "/settings?forcePasswordChange=1" : "/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-8">
        <p className="mb-1 text-sm uppercase tracking-[0.3em] text-blue-600">OHMYGAS</p>
        <h1 className="mb-4 text-xl font-semibold">Two-Factor Verification</h1>
        <p className="mb-4 text-sm text-slate-500">
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-center text-lg tracking-[0.5em]"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ManageTwoFactor() {
  const { user, refresh } = useSession();
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function startSetup() {
    setError("");
    const res = await fetch("/api/auth/two-factor/setup", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to start 2FA setup");
      return;
    }
    setSecret(data.secret);
    setOtpauthUrl(data.otpauthUrl);
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/two-factor/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to enable 2FA");
      return;
    }
    setMessage("Two-factor authentication enabled.");
    setSecret("");
    setCode("");
    refresh();
  }

  async function handleDisable() {
    setError("");
    const res = await fetch("/api/auth/two-factor/disable", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to disable 2FA");
      return;
    }
    setMessage("Two-factor authentication disabled.");
    refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-lg">
        <Link href="/settings" className="mb-4 inline-block text-xs text-slate-500 hover:text-blue-700">
          ← Back to Settings
        </Link>
        <p className="mb-1 text-sm uppercase tracking-[0.3em] text-blue-600">
          Settings
        </p>
        <h1 className="mb-6 text-2xl font-semibold uppercase">
          Two-Factor Authentication
        </h1>

        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-6">
          <p className="mb-4 text-sm text-slate-500">
            Signed in as {user?.full_name}. Two-factor authentication adds an extra
            verification step using an authenticator app (e.g. Google Authenticator).
          </p>

          {!secret ? (
            <button
              type="button"
              onClick={startSetup}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Start Setup
            </button>
          ) : (
            <form onSubmit={handleEnable} className="space-y-3">
              <p className="text-xs text-slate-500">
                Scan this into your authenticator app, or enter the secret manually:
              </p>
              <p className="break-all rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] p-3 font-mono text-xs">
                {secret}
              </p>
              <p className="break-all text-xs text-slate-400">{otpauthUrl}</p>
              <input
                className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-center text-lg tracking-[0.5em]"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
                Confirm &amp; Enable
              </button>
            </form>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}

          <button
            type="button"
            onClick={handleDisable}
            className="mt-4 text-xs text-slate-500 underline"
          >
            Disable two-factor authentication
          </button>
        </div>
      </div>
    </div>
  );
}
