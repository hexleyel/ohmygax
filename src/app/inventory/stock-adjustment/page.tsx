"use client";

import { useEffect, useState } from "react";
import { listProducts } from "@/utils/api-services/productService";
import { adjustStock } from "@/utils/api-services/inventoryService";
import AdminOnly from "@/components/AdminOnly";
import ConfirmDialog from "@/components/ConfirmDialog";

type StockTier = "new" | "old";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  uom: string;
  stock_qty: number;
  new_stock_qty: number;
  old_stock_qty: number;
  min_stock: number;
};

type AdjustmentHistoryEntry = {
  log_id: number;
  product_name: string;
  sku: string;
  uom: string;
  stock_tier: string;
  adjustment: number;
  reason: string;
  created_at: string;
  restored: boolean;
  can_restore: boolean;
};

function StockAdjustmentPageView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<Record<number, StockTier>>({});
  const [selected, setSelected] = useState<{ product: Product; tier: StockTier } | null>(null);
  const [adjustment, setAdjustment] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AdjustmentHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deductionConfirmOpen, setDeductionConfirmOpen] = useState(false);
  const [restorationPending, setRestorationPending] = useState<AdjustmentHistoryEntry | null>(null);

  async function load() {
    const data = await listProducts();
    setProducts(data);
  }

  useEffect(() => {
    load();
  }, []);

  function openAdjustment(product: Product) {
    setError("");
    setAdjustment("");
    setReason("");
    setSelected({ product, tier: tiers[product.product_id] ?? "new" });
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/inventory/adjustments");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load adjustment history.");
      setHistory(data);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load adjustment history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function restoreAdjustment(entry: AdjustmentHistoryEntry) {
    setRestoringId(entry.log_id);
    setHistoryError("");
    try {
      const response = await fetch(`/api/inventory/adjustments/${entry.log_id}/restore`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to restore stock.");
      await Promise.all([openHistory(), load()]);
      setRestorationPending(null);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to restore stock.");
      setRestorationPending(null);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError("");
    if (!Number.isInteger(Number(adjustment)) || Number(adjustment) <= 0) {
      setError("Enter a positive whole-number quantity to deduct.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required for this adjustment.");
      return;
    }
    setDeductionConfirmOpen(true);
  }

  async function confirmAdjustment() {
    if (!selected) return;
    setDeductionConfirmOpen(false);
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      await adjustStock(selected.product.product_id, Number(adjustment), reason, selected.tier);
      setMessage("Stock adjusted.");
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Inventory</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold uppercase">Stock Adjustment</h1>
          <button
            type="button"
            onClick={openHistory}
            className="rounded-lg border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Adjustments
          </button>
        </div>
      </div>

      {message ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Adjustment</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                  No products found.
                </td>
              </tr>
            ) : products.map((product) => {
              const tier = tiers[product.product_id] ?? "new";
              const quantity = tier === "new" ? product.new_stock_qty : product.old_stock_qty;
              return (
                <tr key={product.product_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3">
                    <p className="font-medium">{product.name}</p>
                    <p className="mb-2 text-xs text-slate-500">{product.sku}</p>
                    <select
                      aria-label={`Stock type for ${product.name}`}
                      value={tier}
                      onChange={(e) =>
                        setTiers((current) => ({
                          ...current,
                          [product.product_id]: e.target.value as StockTier,
                        }))
                      }
                      className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="new">Reserve Stock</option>
                      <option value="old">Current Stock</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {quantity} {product.uom.toUpperCase()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openAdjustment(product)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjustment-title"
            onSubmit={handleSubmit}
            className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Stock Adjustment</p>
            <h2 id="adjustment-title" className="mb-4 text-xl font-semibold">
              {selected.product.name}
            </h2>
            <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {selected.tier === "new" ? "Reserve Stock" : "Current Stock"} · Current quantity {" "}
              {selected.tier === "new" ? selected.product.new_stock_qty : selected.product.old_stock_qty}{" "}
              {selected.product.uom.toUpperCase()}
            </p>

            <label className="mb-1 block text-sm text-slate-500">
              Quantity to Deduct
            </label>
            <input
              type="number"
              min="1"
              step={1}
              value={adjustment}
              placeholder="0"
              onChange={(e) => setAdjustment(e.target.value)}
              className="mb-4 w-full [appearance:textfield] rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />

            <label className="mb-1 block text-sm text-slate-500">Reason (required)</label>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2"
              rows={3}
              placeholder="e.g. Damaged, spoiled, physical count correction"
            />

            {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

            <div className="flex gap-2">
              <button
                disabled={submitting}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? "Applying…" : "Apply Adjustment"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSelected(null)}
                className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjustment-history-title"
            className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Inventory</p>
                <h2 id="adjustment-history-title" className="text-xl font-semibold">Adjustment History</h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="max-h-[calc(85vh-5rem)] overflow-auto p-4">
              {historyLoading ? <p className="p-6 text-center text-sm text-slate-500">Loading adjustments…</p> : null}
              {historyError ? <p className="p-4 text-sm text-red-600">{historyError}</p> : null}
              {!historyLoading && !historyError ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Stock Tier</th>
                        <th className="px-4 py-3 text-right">Adjustment</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Date / Time</th>
                        <th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No adjustments recorded.</td></tr>
                      ) : history.map((entry) => (
                        <tr key={entry.log_id} className="border-t border-slate-200">
                          <td className="px-4 py-3">
                            <p className="font-medium">{entry.product_name}</p>
                            <p className="text-xs text-slate-500">{entry.sku}</p>
                          </td>
                          <td className="px-4 py-3">{entry.stock_tier}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            -{Math.abs(entry.adjustment)} {entry.uom.toUpperCase()}
                          </td>
                          <td className="px-4 py-3">{entry.reason}</td>
                          <td className="whitespace-nowrap px-4 py-3">{new Date(entry.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            {entry.restored ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Restored</span>
                            ) : entry.can_restore ? (
                              <button
                                type="button"
                                disabled={restoringId === entry.log_id}
                                onClick={() => setRestorationPending(entry)}
                                className="whitespace-nowrap rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                              >
                                {restoringId === entry.log_id ? "Restoring…" : "Return to Stock"}
                              </button>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={deductionConfirmOpen && Boolean(selected)}
        title="Confirm Stock Deduction"
        message={selected ? `Are you sure you want to deduct ${Number(adjustment)} ${selected.product.uom.toUpperCase()} from ${selected.product.name} (${selected.tier === "new" ? "Reserve Stock" : "Current Stock"})?` : null}
        confirmLabel="Apply Adjustment"
        cancelLabel="Cancel"
        busy={submitting}
        onConfirm={confirmAdjustment}
        onCancel={() => setDeductionConfirmOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(restorationPending)}
        title="Return Stock to Inventory?"
        message={restorationPending ? `Mark as Repaired / Replaced by Supplier and restore ${Math.abs(restorationPending.adjustment)} ${restorationPending.uom.toUpperCase()} of ${restorationPending.product_name} (${restorationPending.stock_tier}) to inventory?` : null}
        confirmLabel="Return to Stock"
        cancelLabel="Cancel"
        busy={restoringId !== null}
        onConfirm={() => restorationPending && restoreAdjustment(restorationPending)}
        onCancel={() => setRestorationPending(null)}
      />
    </div>
  );
}

export default function StockAdjustmentPage() {
  return (
    <AdminOnly>
      <StockAdjustmentPageView />
    </AdminOnly>
  );
}
