"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateZReport, getXReport } from "@/utils/api-services/reportService";
import ConfirmDialog from "@/components/ConfirmDialog";

type Summary = {
  terminal: string;
  since: string;
  transactionCount: number;
  totalSales: number;
  grossSales: number;
  netSales: number;
  posSales: number;
  deliverySales: number;
  totalVat: number;
  cashSales: number;
  gcashSales: number;
  beginningBalance: number;
  expectedCashOnHand: number;
  actualCashCounted: number | null;
  shiftStatus: string | null;
  canGenerateZ: boolean;
  generatedAt?: string;
};

export default function XZReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [zResult, setZResult] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setSummary(await getXReport());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGenerateZ() {
    setGenerating(true);
    setError("");
    try {
      const result = await generateZReport();
      setZResult(result);
      setConfirmOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate Z report");
      setConfirmOpen(false);
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = Boolean(summary?.canGenerateZ);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Transactions</p>
        <h1 className="text-3xl font-semibold uppercase">X &amp; Z Reports</h1>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* ---------------- X REPORT ---------------- */}
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                X Report
              </p>
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700">
                Interim
              </span>
            </div>
            <SummaryTable summary={summary} />
          </div>

          {/* ---------------- Z REPORT ---------------- */}
          <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                Z Report
              </p>
              <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">
                End of Day
              </span>
            </div>
            {zResult ? (
              <div id="printable-receipt">
                <div className="mb-3 hidden text-center print:block">
                  <p className="text-sm font-semibold uppercase">OHMYGAS — Z Report</p>
                  <p className="text-xs">Island Gas LPG Store · Kalibo, Aklan</p>
                </div>
                <SummaryTable summary={zResult} />
              </div>
            ) : (
              <p className="mb-4 text-sm text-slate-500">Not generated yet.</p>
            )}

            {!canGenerate && !zResult ? (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Close the shift and enter the actual cash counted in{" "}
                <Link href="/transactions/cash-management" className="font-semibold underline">
                  Cash Management
                </Link>{" "}
                before generating the Z report.
              </div>
            ) : null}

            <p className="mb-3 text-xs text-red-600">
              ⚠ This will reset today&apos;s transaction counter
            </p>

            <div className="no-print flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={generating || !canGenerate}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate Z Report"}
              </button>
              {zResult ? (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-600 hover:text-blue-700"
                >
                  Save / Export PDF
                </button>
              ) : null}
            </div>

            {zResult ? (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Saved to Z-Report History. Use Save / Export PDF and choose
                &quot;Save as PDF&quot; as the destination.
              </p>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Generate Z report?"
        message="This locks in the end-of-day totals and resets the transaction counter. It cannot be undone."
        confirmLabel="Yes, generate"
        cancelLabel="Go back"
        tone="danger"
        busy={generating}
        onConfirm={handleGenerateZ}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function SummaryTable({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  return (
    <div className="space-y-2 text-sm">
      <Row label="Terminal" value={summary.terminal} />
      <Row label="Beginning Balance" value={`₱${summary.beginningBalance.toFixed(2)}`} />
      <Row label="Transactions" value={String(summary.transactionCount)} />
      <Row label="POS Sales" value={`₱${summary.posSales.toFixed(2)}`} />
      <Row label="Delivery Sales" value={`₱${summary.deliverySales.toFixed(2)}`} />
      <Row label="Total Combined Sales" value={`₱${summary.totalSales.toFixed(2)}`} bold />
      <Row label="Cash Sales" value={`₱${summary.cashSales.toFixed(2)}`} />
      <Row label="GCash Sales" value={`₱${summary.gcashSales.toFixed(2)}`} />
      <Row label="Total VAT" value={`₱${summary.totalVat.toFixed(2)}`} />
      <Row label="Gross Sales" value={`₱${summary.grossSales.toFixed(2)}`} />
      <Row label="Net Sales (excl. VAT)" value={`₱${summary.netSales.toFixed(2)}`} />
      <div className="border-t border-dashed border-[#e2e8f0] pt-2">
        <Row
          label="Expected Cash on Hand"
          value={`₱${summary.expectedCashOnHand.toFixed(2)}`}
          hint="Beginning balance + cash sales"
        />
        {summary.actualCashCounted !== null ? (
          <Row label="Actual Cash Counted" value={`₱${summary.actualCashCounted.toFixed(2)}`} />
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  hint,
}: {
  label: string;
  value: string;
  bold?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`flex justify-between ${
        bold ? "text-base font-semibold text-blue-600" : "text-slate-500"
      }`}
    >
      <span>
        {label}
        {hint ? <span className="block text-[10px] text-slate-400">{hint}</span> : null}
      </span>
      <span>{value}</span>
    </div>
  );
}
