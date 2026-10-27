"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSession } from "@/context/SessionContext";
import { getDashboardSummary } from "@/utils/api-services/reportService";

type Summary = {
  totalProducts: number;
  lowStockAlerts: { name: string; stock_qty: number; min_stock: number }[];
  totalInventoryValue: number;
  cylinderStockBySize: { name: string; full: number; empty: number }[];
  weeklyEmptyReturns: { day: string; qty: number }[];
  todaysTotalSales: number;
  recentTransactions: { transaction_id: number; payment_method: string; total_amount: number }[];
};

export default function DashboardPage() {
  const { user } = useSession();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : "Unable to load dashboard summary.");
    });
  }, []);

  const today = new Date();
  const dayLabel = today
    .toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Overview</p>
          <h1 className="text-3xl font-semibold uppercase">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {dayLabel} · Good day, {user?.full_name?.toUpperCase() || "…"}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live
        </div>
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {loadError}
        </p>
      ) : !summary ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-4">
            <StatCard label="Total Products" value={String(summary.totalProducts)} />
            <StatCard
              label="Low Stock Alerts"
              value={String(summary.lowStockAlerts.length)}
              danger={summary.lowStockAlerts.length > 0}
            />
            <StatCard
              label="Total Inventory Value"
              value={`₱${summary.totalInventoryValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <StatCard
              label="Today's Total Sales"
              value={`₱${summary.todaysTotalSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
              highlight
            />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Full Cylinder Stock by Size
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.cylinderStockBySize}>
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0" }} />
                    <Bar dataKey="full" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-600" /> Full
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-500" /> Empty
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                ⚡ Weekly Empty Cylinder Returns
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.weeklyEmptyReturns}>
                    <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0" }} />
                    <Line type="monotone" dataKey="qty" stroke="#f97316" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Low Stock Alerts
              </p>
              {summary.lowStockAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">All stock levels are healthy.</p>
              ) : (
                <div className="space-y-2">
                  {summary.lowStockAlerts.map((item) => (
                    <div key={item.name} className="flex justify-between text-sm">
                      <span className="text-slate-600">{item.name}</span>
                      <span className="text-amber-700">
                        {item.stock_qty} / {item.min_stock} min
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                Recent Transactions
              </p>
              {summary.recentTransactions.length === 0 ? (
                <p className="text-sm text-slate-500">No transactions yet.</p>
              ) : (
                <div className="space-y-2">
                  {summary.recentTransactions.map((t) => (
                    <div key={t.transaction_id} className="flex justify-between text-sm">
                      <span className="text-blue-600">#{t.transaction_id}</span>
                      <span className="uppercase text-slate-500">{t.payment_method}</span>
                      <span>₱{Number(t.total_amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  danger,
  highlight,
}: {
  label: string;
  value: string;
  danger?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? "border-emerald-500/30 bg-emerald-500/5" : "border-[#e2e8f0] bg-[#ffffff]"
      }`}
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-3 text-3xl font-semibold ${
          danger ? "text-red-600" : highlight ? "text-emerald-700" : "text-blue-600"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
