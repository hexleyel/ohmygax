"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import AdminOnly from "@/components/AdminOnly";

type CashierInfo = { user_id: number; full_name: string; username: string };

type ShiftRecord = {
  session_id: number;
  user: CashierInfo;
  status: string;
  beginning_balance: number;
  opened_at: string;
  closed_at: string | null;
  actual_cash_counted: number | null;
  cash_sales: number;
  gcash_sales: number;
  total_sales: number;
  expected_cash: number;
  variance: number | null;
};

function fmt(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function duration(opened: string, closed: string | null) {
  if (!closed) return "—";
  const ms = new Date(closed).getTime() - new Date(opened).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function VariancePill({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-slate-400 text-xs italic">Shift open</span>;
  if (Math.abs(value) < 0.01)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        ✓ Balanced
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        ▼ {fmt(Math.abs(value))} SHORT
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
      ▲ {fmt(value)} OVER
    </span>
  );
}

function ShiftHistoryView() {
  const [records, setRecords] = useState<ShiftRecord[]>([]);
  const [cashiers, setCashiers] = useState<CashierInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (userId) params.set("user_id", userId);
      if (status) params.set("status", status);

      const [res, cashierRes] = await Promise.all([
        fetch(`/api/cash-sessions/history?${params.toString()}`),
        fetch("/api/cash-sessions/history").catch(() => null),
      ]);
      const data = await res.json();
      const cashierData = cashierRes?.ok ? await cashierRes.json().catch(() => []) : [];
      if (!res.ok) {
        setError(data.error || "Could not load shift history");
        setRecords([]);
        return;
      }
      setError("");
      if (Array.isArray(data)) {
        setRecords(data);
      }
      if (Array.isArray(cashierData)) {
        // Keep the filter options sourced from the unfiltered master history.
        const seen = new Map<number, CashierInfo>();
        for (const r of cashierData as ShiftRecord[]) {
          if (!seen.has(r.user.user_id)) seen.set(r.user.user_id, r.user);
        }
        setCashiers(Array.from(seen.values()));
      }
    } finally {
      setLoading(false);
    }
  }, [from, to, userId, status]);

  useEffect(() => { load(); }, [load]);

  const shortCount = records.filter((r) => r.variance !== null && r.variance < -0.009).length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Transactions</p>
        <h1 className="text-3xl font-semibold uppercase">Shift History</h1>
      </div>

      {/* Alert banner for shorts */}
      {shortCount > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="text-lg">⚠</span>
          <span>
            <strong>{shortCount} shift{shortCount > 1 ? "s" : ""}</strong> in this view
            {shortCount > 1 ? " have" : " has"} a cash shortage. Review the highlighted rows.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Cashier</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm">
            <option value="">All</option>
            {cashiers.map((c) => (
              <option key={c.user_id} value={c.user_id}>{c.full_name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={() => { setFrom(""); setTo(""); setUserId(""); setStatus(""); }}
            className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-50">
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-[#e2e8f0] bg-white px-6 py-12 text-center text-slate-400">
          No shift records found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Opened At</th>
                <th className="px-4 py-3">Closed At</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3 text-right">Beginning</th>
                <th className="px-4 py-3 text-right">Cash Sales</th>
                <th className="px-4 py-3 text-right">GCash Sales</th>
                <th className="px-4 py-3 text-right">Expected Cash</th>
                <th className="px-4 py-3 text-right">Actual Counted</th>
                <th className="px-4 py-3 text-center">Variance</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const isShort = r.variance !== null && r.variance < -0.009;
                const isExpanded = expanded === r.session_id;
                return (
                  <Fragment key={r.session_id}>
                    <tr
                      onClick={() => setExpanded(isExpanded ? null : r.session_id)}
                      className={`cursor-pointer border-t border-[#e2e8f0] transition hover:bg-slate-50 ${isShort ? "bg-red-50/60" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <div>{r.user.full_name}</div>
                        <div className="text-xs text-slate-400">@{r.user.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                          r.status === "open"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(r.opened_at)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.closed_at ? fmtDate(r.closed_at) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{duration(r.opened_at, r.closed_at)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(Number(r.beginning_balance))}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(r.cash_sales)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(r.gcash_sales)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-blue-600">{fmt(r.expected_cash)}</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {r.actual_cash_counted !== null ? fmt(Number(r.actual_cash_counted)) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <VariancePill value={r.variance} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-[#e2e8f0] bg-slate-50/80">
                        <td colSpan={11} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                            <Detail label="Session ID" value={`#${r.session_id}`} />
                            <Detail label="Total Sales" value={fmt(r.total_sales)} />
                            <Detail label="Cash Sales" value={fmt(r.cash_sales)} />
                            <Detail label="GCash Sales" value={fmt(r.gcash_sales)} />
                            <Detail label="Beginning Balance" value={fmt(Number(r.beginning_balance))} />
                            <Detail label="Expected Cash" value={fmt(r.expected_cash)} />
                            <Detail label="Actual Counted" value={r.actual_cash_counted !== null ? fmt(Number(r.actual_cash_counted)) : "Not closed"} />
                            <Detail
                              label="Variance"
                              value={r.variance !== null ? (r.variance >= 0 ? `+${fmt(r.variance)}` : fmt(r.variance)) : "N/A"}
                              highlight={r.variance !== null && r.variance < -0.009 ? "red" : r.variance !== null && r.variance > 0.009 ? "amber" : "green"}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        {records.length} record{records.length !== 1 ? "s" : ""} · Click a row to expand details ·
        Expected Cash = Beginning Balance + Cash Sales (GCash excluded from drawer)
      </p>
    </div>
  );
}

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: "red" | "amber" | "green" }) {
  const color =
    highlight === "red" ? "text-red-600 font-semibold" :
    highlight === "amber" ? "text-amber-600 font-semibold" :
    highlight === "green" ? "text-emerald-600 font-semibold" :
    "text-slate-700";
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${color}`}>{value}</p>
    </div>
  );
}

export default function ShiftHistoryPage() {
  return (
    <AdminOnly>
      <ShiftHistoryView />
    </AdminOnly>
  );
}
