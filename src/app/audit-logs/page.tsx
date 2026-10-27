"use client";

import { useEffect, useState } from "react";
import { listAuditLogs } from "@/utils/api-services/auditLogService";
import AdminOnly from "@/components/AdminOnly";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";

type LogEntry = {
  log_id: number;
  role: string;
  action: string;
  module: string;
  details: string;
  created_at: string;
  user: { username: string; full_name: string };
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-emerald-500/15 text-emerald-700",
  SALE: "bg-blue-600/15 text-blue-700",
  PRICE_UPDATE: "bg-purple-500/15 text-purple-700",
};

function actionColor(action: string) {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  if (action.includes("CREATE")) return "bg-sky-500/15 text-sky-700";
  if (action.includes("UPDATE") || action.includes("CHANGE")) return "bg-purple-500/15 text-purple-700";
  if (
    action.includes("DELETE") ||
    action.includes("CANCEL") ||
    action.includes("ARCHIVE") ||
    action.includes("VOID")
  )
    return "bg-red-500/15 text-red-600";
  return "bg-slate-500/15 text-slate-500";
}

function AuditLogsPageView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      setLogs(await listAuditLogs({ search, action, role }));
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, role]);

  const actions = Array.from(new Set(logs.map((l) => l.action)));
  const currentPage = clampPage(page, logs.length);
  const visibleLogs = pageSlice(logs, currentPage);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Security</p>
        <h1 className="text-3xl font-semibold uppercase">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          {logs.length} RECORDS · SYSTEM ACTIVITY HISTORY
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className="flex-1 min-w-52 rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm"
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <select
          className="rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">All</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="cashier">Cashier</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No logs found.
                </td>
              </tr>
            ) : (
              visibleLogs.map((log) => (
                <tr key={log.log_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">{log.user.full_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${actionColor(log.action)}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">{log.module}</td>
                  <td className="px-4 py-3 text-slate-500">{log.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && logs.length > 0 ? (
        <Pagination
          page={currentPage}
          total={logs.length}
          onChange={setPage}
          label="entries"
        />
      ) : null}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <AdminOnly>
      <AuditLogsPageView />
    </AdminOnly>
  );
}
