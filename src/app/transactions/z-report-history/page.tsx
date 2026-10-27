"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import AdminOnly from "@/components/AdminOnly";

type ZReportRecord = {
  report_id: number;
  generated_at: string;
  since: string;
  transaction_count: number;
  total_sales: number;
  total_vat: number;
  cash_sales: number;
  gcash_sales: number;
  user: { user_id: number; full_name: string; username: string };
};

function fmt(n: number) {
  return `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtPeriod(since: string, until: string) {
  const s = new Date(since);
  const u = new Date(until);
  const sameDay = s.toDateString() === u.toDateString();
  if (sameDay) {
    return `${s.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return `${s.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${u.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
}

function ZReportHistoryView() {
  const [reports, setReports] = useState<ZReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  // Filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/reports/z-report/history?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load Z-Report history");
        setReports([]);
        return;
      }
      setError("");
      if (Array.isArray(data)) setReports(data);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const grandTotal = reports.reduce((s, r) => s + Number(r.total_sales), 0);
  const grandTxns = reports.reduce((s, r) => s + r.transaction_count, 0);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Transactions</p>
        <h1 className="text-3xl font-semibold uppercase">Z-Report History</h1>
      </div>

      {/* Summary cards */}
      {reports.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Total Reports" value={String(reports.length)} />
          <SummaryCard label="Total Transactions" value={String(grandTxns)} />
          <SummaryCard label="Total Sales" value={fmt(grandTotal)} highlight />
          <SummaryCard
            label="Period"
            value={reports.length > 1
              ? fmtPeriod(reports[reports.length - 1].generated_at, reports[0].generated_at)
              : fmtPeriod(reports[0].since, reports[0].generated_at)}
          />
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">From Date</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">To Date</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm" />
        </div>
        <div className="flex items-end gap-2">
          <button onClick={() => { setFrom(""); setTo(""); }}
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
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-[#e2e8f0] bg-white px-6 py-12 text-center text-slate-400">
          No Z-Reports found for the selected date range.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Generated By</th>
                <th className="px-4 py-3">Generated At</th>
                <th className="px-4 py-3">Period Covered</th>
                <th className="px-4 py-3 text-right">Transactions</th>
                <th className="px-4 py-3 text-right">Cash Sales</th>
                <th className="px-4 py-3 text-right">GCash Sales</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3 text-right">Total Sales</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const isExpanded = expanded === r.report_id;
                return (
                  <Fragment key={r.report_id}>
                    <tr
                      onClick={() => setExpanded(isExpanded ? null : r.report_id)}
                      className="cursor-pointer border-t border-[#e2e8f0] transition hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-mono text-blue-600">Z-{String(r.report_id).padStart(4, "0")}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.user.full_name}</div>
                        <div className="text-xs text-slate-400">@{r.user.username}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(r.generated_at)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{fmtPeriod(r.since, r.generated_at)}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.transaction_count}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(Number(r.cash_sales))}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(Number(r.gcash_sales))}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">{fmt(Number(r.total_vat))}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-blue-600">{fmt(Number(r.total_sales))}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-[#e2e8f0] bg-slate-50/80">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                            <Detail label="Report ID" value={`Z-${String(r.report_id).padStart(4, "0")}`} />
                            <Detail label="Generated By" value={r.user.full_name} />
                            <Detail label="Generated At" value={fmtDate(r.generated_at)} />
                            <Detail label="Period Since" value={fmtDate(r.since)} />
                            <Detail label="Transactions" value={String(r.transaction_count)} />
                            <Detail label="Cash Sales" value={fmt(Number(r.cash_sales))} />
                            <Detail label="GCash Sales" value={fmt(Number(r.gcash_sales))} />
                            <Detail label="Total VAT" value={fmt(Number(r.total_vat))} />
                            <Detail label="Total Sales" value={fmt(Number(r.total_sales))} highlight />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-[#e2e8f0] bg-[#f8fafc] font-semibold">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-slate-600 uppercase text-xs tracking-wide">
                  Totals ({reports.length} reports)
                </td>
                <td className="px-4 py-3 text-right font-mono">{grandTxns}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {fmt(reports.reduce((s, r) => s + Number(r.cash_sales), 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {fmt(reports.reduce((s, r) => s + Number(r.gcash_sales), 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">
                  {fmt(reports.reduce((s, r) => s + Number(r.total_vat), 0))}
                </td>
                <td className="px-4 py-3 text-right font-mono text-blue-600">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        {reports.length} report{reports.length !== 1 ? "s" : ""} · Click a row to expand · Records are saved permanently when a Z-Report is generated
      </p>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${highlight ? "text-blue-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${highlight ? "font-semibold text-blue-600" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}

export default function ZReportHistoryPage() {
  return (
    <AdminOnly>
      <ZReportHistoryView />
    </AdminOnly>
  );
}
