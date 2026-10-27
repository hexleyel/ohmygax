"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/context/SessionContext";

/**
 * Client-side gate for admin-only pages. The API is the real boundary — this
 * just replaces the silent empty table a cashier would otherwise land on.
 */
export default function AdminOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Administrator only
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">
            You don&apos;t have access to this page
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This module is limited to administrator accounts.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
