"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/context/SessionContext";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  closeCashSession,
  getCashSessionStatus,
  openCashSession,
} from "@/utils/api-services/cashSessionService";

type CashSession = {
  session_id: number;
  beginning_balance: number;
  opened_at: string;
  status: string;
};

type Transaction = {
  transaction_id: number;
  payment_method: string;
  total_amount: number;
  cash_received: number | null;
  change_amount: number | null;
};

const CASH_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
type DenominationCounts = Record<number, string>;

function emptyDenominations(): DenominationCounts {
  return Object.fromEntries(CASH_DENOMINATIONS.map((denomination) => [denomination, ""]));
}

function denominationTotal(counts: DenominationCounts) {
  return CASH_DENOMINATIONS.reduce(
    (total, denomination) => total + denomination * (Number(counts[denomination]) || 0),
    0,
  );
}

function pesoWhole(value: number) {
  return `₱${Math.round(value).toLocaleString("en-PH")}`;
}

function DenominationCounter({
  counts,
  onChange,
}: {
  counts: DenominationCounts;
  onChange: (denomination: number, quantity: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-3 gap-3">
      {CASH_DENOMINATIONS.map((denomination) => (
        <label key={denomination} className="rounded-lg border border-[#e2e8f0] p-3">
          <span className="mb-1 block text-sm font-semibold">₱{denomination}</span>
          <span className="sr-only">Quantity of ₱{denomination} notes or coins</span>
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="Qty"
            aria-label={`Quantity of ₱${denomination} notes or coins`}
            className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
            value={counts[denomination]}
            onChange={(event) => {
              const value = event.target.value;
              onChange(denomination, value === "" ? "" : String(Math.max(0, Math.floor(Number(value) || 0))));
            }}
          />
        </label>
      ))}
    </div>
  );
}

export default function CashManagementPage() {
  const { user } = useSession();
  const [openSession, setOpenSession] = useState<CashSession | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [beginningDenominations, setBeginningDenominations] = useState<DenominationCounts>(emptyDenominations);
  const [countedDenominations, setCountedDenominations] = useState<DenominationCounts>(emptyDenominations);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getCashSessionStatus();
      setOpenSession(data.openSession);
      setTransactions(data.transactions);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setConfirmOpen(true);
  }

  async function confirmOpenShift() {
    setError("");
    setOpening(true);
    try {
      await openCashSession(denominationTotal(beginningDenominations));
      setBeginningDenominations(emptyDenominations());
      setConfirmOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open shift");
      setConfirmOpen(false);
    } finally {
      setOpening(false);
    }
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    setConfirmClose(true);
  }

  async function confirmCloseShift() {
    setError("");
    setClosing(true);
    try {
      await closeCashSession(denominationTotal(countedDenominations));
      setCountedDenominations(emptyDenominations());
      setConfirmClose(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close shift");
      setConfirmClose(false);
    } finally {
      setClosing(false);
    }
  }

  const totalAmount = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
  const totalCashReceived = transactions.reduce(
    (sum, t) => sum + Number(t.cash_received || 0),
    0,
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Transactions</p>
          <h1 className="text-3xl font-semibold uppercase">Cash Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            SESSION: {new Date().toLocaleDateString()} · {user?.full_name}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
            openSession
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-slate-500/15 text-slate-500"
          }`}
        >
          {openSession ? "Shift Open" : "Shift Closed"}
        </span>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
            {openSession ? (
              <form onSubmit={handleClose} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Beginning Balance</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">
                      {pesoWhole(Number(openSession.beginning_balance))}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">
                    Actual Cash Counted: <span className="font-semibold text-slate-900">{pesoWhole(denominationTotal(countedDenominations))}</span>
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-600">Count cash by denomination</p>
                <DenominationCounter
                  counts={countedDenominations}
                  onChange={(denomination, quantity) => setCountedDenominations((counts) => ({ ...counts, [denomination]: quantity }))}
                />
                <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">
                  Close Shift
                </button>
              </form>
            ) : (
              <form onSubmit={handleOpen} className="space-y-4">
                <p className="text-sm font-medium text-slate-600">Beginning cash by denomination</p>
                <DenominationCounter
                  counts={beginningDenominations}
                  onChange={(denomination, quantity) => setBeginningDenominations((counts) => ({ ...counts, [denomination]: quantity }))}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f0] pt-4">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Beginning Balance Total</p>
                    <p className="text-2xl font-semibold tabular-nums text-slate-900">
                      {pesoWhole(denominationTotal(beginningDenominations))}
                    </p>
                  </div>
                  <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">
                    Open Shift
                  </button>
                </div>
              </form>
            )}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
            <p className="border-b border-[#e2e8f0] px-4 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Shift Transactions
            </p>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f1f5f9] text-slate-500">
                <tr>
                  <th className="px-4 py-3">TXN</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Cash Received</th>
                  <th className="px-4 py-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No transactions yet today.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.transaction_id} className="border-t border-[#e2e8f0]">
                      <td className="px-4 py-3 text-blue-600">#{t.transaction_id}</td>
                      <td className="px-4 py-3">₱{Number(t.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {t.cash_received !== null ? `₱${Number(t.cash_received).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {t.change_amount !== null ? `₱${Number(t.change_amount).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {transactions.length > 0 ? (
                <tfoot>
                  <tr className="border-t border-[#e2e8f0] font-semibold">
                    <td className="px-4 py-3">TOTALS</td>
                    <td className="px-4 py-3">₱{totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-3">₱{totalCashReceived.toFixed(2)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Open Cash Shift?"
        message={
          <span>
            Beginning Balance:{" "}
            <strong className="text-slate-900">
              {pesoWhole(denominationTotal(beginningDenominations))}
            </strong>
          </span>
        }
        confirmLabel="Yes"
        cancelLabel="Cancel"
        busy={opening}
        onConfirm={confirmOpenShift}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmClose}
        title="Close Cash Shift?"
        message={
          <span>
            This ends the current shift and locks today&apos;s totals. Counted cash:{" "}
            <strong className="text-slate-900">
              {pesoWhole(denominationTotal(countedDenominations))}
            </strong>
          </span>
        }
        confirmLabel="Yes, close shift"
        cancelLabel="Go back"
        tone="danger"
        busy={closing}
        onConfirm={confirmCloseShift}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
