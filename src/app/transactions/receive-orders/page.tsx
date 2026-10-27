"use client";

import { useEffect, useState } from "react";
import AdminOnly from "@/components/AdminOnly";
import { peso } from "@/lib/format";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";
import {
  validateReceipt,
  type LineStatus,
} from "@/lib/receiving";
import {
  listPurchaseOrders,
  receivePurchaseOrderLine,
} from "@/utils/api-services/purchaseOrderService";
import { listWarehouseLocations } from "@/utils/api-services/warehouseLocationService";

type POLine = {
  id: number;
  quantity: number;
  unit_cost: number;
  received_qty: number;
  missing_qty: number;
  damaged_qty: number;
  excess_qty: number;
  receive_status: string;
  receive_note: string | null;
  received_at: string | null;
  product: { name: string; sku: string; location?: string | null };
};

type PO = {
  po_id: number;
  reference_no: string | null;
  status: string;
  total_amount: number;
  order_date: string;
  received_at: string | null;
  supplier: { name: string };
  items: POLine[];
};

const STATUS_FILTERS = ["all", "confirmed", "back-order", "received", "pending"] as const;
const PAGE_SIZE = 5;
const RECEIVING_STATUS_OPTIONS: Exclude<LineStatus, "pending">[] = ["back-order", "complete"];
/** Display labels for the shared status list, so the two can't drift apart. */
const STATUS_LABELS: Record<LineStatus, string> = {
  pending: "Pending",
  "back-order": "Back Order",
  complete: "Complete",
};

function ReceiveOrdersPageView() {
  const [orders, setOrders] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<PO | null>(null);

  // The line currently open in the receive dialog.
  const [target, setTarget] = useState<{ order: PO; line: POLine } | null>(
    null,
  );
  const [lineStatus, setLineStatus] = useState<LineStatus>("complete");
  const [receivedQty, setReceivedQty] = useState("");
  const [note, setNote] = useState("");
  const [missingQty, setMissingQty] = useState("0");
  const [damagedQty, setDamagedQty] = useState("0");
  const [excessQty, setExcessQty] = useState("0");
  const [storageLocation, setStorageLocation] = useState("");
  const [warehouseLocations, setWarehouseLocations] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setOrders(
        await listPurchaseOrders({ all: "1" }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  // Load the full order set once; filtering and pagination are client-side.
  useEffect(() => {
    let active = true;
    listPurchaseOrders({ all: "1" })
      .then((rows) => {
        if (active) {
          setOrders(rows);
          setPage(1);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load orders");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listWarehouseLocations()
      .then((locations) => {
        if (!active) return;
        setWarehouseLocations(locations);
      })
      .catch(() => {
        // The input still accepts new locations if inventory suggestions fail.
      });
    return () => {
      active = false;
    };
  }, []);

  function openReceive(order: PO, line: POLine) {
    setTarget({ order, line });
    const hasDiscrepancy =
      Number(line.missing_qty || 0) > 0 ||
      Number(line.damaged_qty || 0) > 0 ||
      Number(line.excess_qty || 0) > 0;
    setLineStatus(
      line.receive_status === "back-order" || hasDiscrepancy ? "back-order" : "complete",
    );
    setReceivedQty(
      String(line.received_qty > 0 ? line.received_qty : line.quantity),
    );
    setNote(line.receive_note ?? "");
    setMissingQty(String(line.missing_qty ?? 0));
    setDamagedQty(String(line.damaged_qty ?? 0));
    setExcessQty(String(line.excess_qty ?? 0));
    setStorageLocation(line.product.location ?? "");
    setDialogError("");
  }

  function closeReceive() {
    setTarget(null);
    setDialogError("");
  }

  async function saveReceive() {
    if (!target) return;
    setDialogError("");

    const received = Number(receivedQty || 0);
    const missing = Number(missingQty || 0);
    const damaged = Number(damagedQty || 0);
    const excess = Number(excessQty || 0);
    const ordered = target.line.quantity;

    const problem = validateReceipt({
      orderedQty: ordered,
      receivedQty: received,
      missingQty: missing,
      damagedQty: damaged,
      excessQty: excess,
      status: lineStatus as LineStatus,
      note,
    });
    if (problem) {
      setDialogError(problem);
      return;
    }

    setSaving(true);
    try {
      await receivePurchaseOrderLine(target.order.po_id, {
        item_id: target.line.id,
        status: lineStatus,
        received_qty: received,
        missing_qty: missing,
        damaged_qty: damaged,
        excess_qty: excess,
        note: note.trim(),
        location: storageLocation.trim(),
      });
      if (storageLocation.trim()) {
        setWarehouseLocations((locations) =>
          Array.from(new Set([...locations, storageLocation.trim()])).sort((a, b) => a.localeCompare(b)),
        );
      }
      closeReceive();
      load();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === "all") return true;
    return order.status === statusFilter;
  });
  const currentPage = clampPage(page, filteredOrders.length, PAGE_SIZE);
  const visibleOrders = pageSlice(filteredOrders, currentPage, PAGE_SIZE);
  function isLineComplete(line: POLine) {
    const status = String(line.receive_status || "").trim().toLowerCase();
    return ["complete", "completed", "received"].includes(status) ||
      (status !== "back-order" && line.quantity > 0 && Number(line.received_qty) >= Number(line.quantity));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
          Transactions
        </p>
        <h1 className="text-3xl font-semibold uppercase">Receive Orders</h1>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => { setStatusFilter(status); setPage(1); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase transition ${
              statusFilter === status
                ? "border-blue-600 bg-blue-600/10 text-blue-700"
                : "border-[#e2e8f0] text-slate-500 hover:border-blue-600"
            }`}
          >
            {status === "received" ? "Completed" : status === "back-order" ? "Back Order" : status}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="rounded-2xl border border-[#e2e8f0] bg-white px-4 py-6 text-center text-sm text-slate-500">
          Loading...
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-slate-500">
              <tr>
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    No purchase orders in this view.
                  </td>
                </tr>
              ) : visibleOrders.map((order) => {
                const canReceive = order.status === "confirmed" || order.status === "back-order";
                const nextLine = canReceive ? order.items.find((line) => !isLineComplete(line)) : undefined;
                return (
                  <tr key={order.po_id} className="border-t border-[#e2e8f0]">
                    <td className="px-4 py-3 font-mono text-slate-900">
                      {order.reference_no || `PO #${order.po_id}`}
                    </td>
                    <td className="px-4 py-3">{order.supplier.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {peso(Number(order.total_amount))}
                    </td>
                    <td className="px-4 py-3">
                      <LineBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">{new Date(order.order_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewing(order)}
                          className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                        >
                          View
                        </button>
                        {nextLine ? (
                          <button
                            type="button"
                            onClick={() => openReceive(order, nextLine)}
                            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                          >
                            Receive
                          </button>
                        ) : order.status === "received" ? (
                          <span className="text-xs font-semibold uppercase text-emerald-700">Complete</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={currentPage}
        total={filteredOrders.length}
        size={PAGE_SIZE}
        onChange={setPage}
        label="purchase orders"
      />

      {viewing ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-8 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] bg-[#f8fafc] px-5 py-4">
              <div>
                <h2 className="font-mono text-lg font-bold">{viewing.reference_no || `PO #${viewing.po_id}`}</h2>
                <p className="text-sm text-slate-500">{viewing.supplier.name} | {new Date(viewing.order_date).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <LineBadge status={viewing.status} />
                <span className="font-semibold tabular-nums">{peso(Number(viewing.total_amount))}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr className="border-b border-[#e2e8f0] text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3 text-right">Ordered</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Item Status / Exceptions</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {viewing.items.map((line) => (
                    <tr key={line.id} className="border-b border-[#e2e8f0] last:border-0">
                      <td className="px-4 py-3">
                        <p>{line.product.name}</p>
                        <p className="text-xs text-slate-500">{line.product.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.received_qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{peso(line.quantity * Number(line.unit_cost))}</td>
                      <td className="px-4 py-3">
                        <LineBadge status={line.receive_status} />
                        {(line.missing_qty || line.damaged_qty || line.excess_qty) ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            {[line.missing_qty ? `${line.missing_qty} missing` : null, line.damaged_qty ? `${line.damaged_qty} damaged` : null, line.excess_qty ? `${line.excess_qty} excess` : null].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {line.receive_note ? <p className="mt-1 text-xs text-slate-500">{line.receive_note}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        {isLineComplete(line) ? (
                          <span className="text-xs font-semibold uppercase text-emerald-700">Complete</span>
                        ) : viewing.status === "confirmed" || viewing.status === "back-order" ? (
                          <button type="button" onClick={() => { setViewing(null); openReceive(viewing, line); }} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                            Receive
                          </button>
                        ) : viewing.status === "pending" ? (
                          <span className="text-xs text-slate-500">Awaiting confirmation</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-[#e2e8f0] p-4">
              <button type="button" onClick={() => setViewing(null)} className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600">Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {target ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Receive
            </p>
            <h3 className="font-mono text-lg font-bold">
              {target.order.reference_no || `PO #${target.order.po_id}`}
            </h3>
            <p className="text-sm text-slate-600">
              {target.order.supplier.name}
            </p>
            <p className="mb-4 text-xs text-slate-500">
              {new Date(target.order.order_date).toLocaleString()}
            </p>

            <div className="mb-4 flex justify-between border-y border-[#e2e8f0] py-3 text-sm">
              <span>
                {target.line.product.name} × {target.line.quantity}
              </span>
              <span className="font-semibold tabular-nums">
                {peso(target.line.quantity * Number(target.line.unit_cost))}
              </span>
            </div>

            <div className="mb-4 flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                {peso(target.line.quantity * Number(target.line.unit_cost))}
              </span>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </span>
              <select
                value={lineStatus}
                onChange={(e) => setLineStatus(e.target.value)}
                className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
              >
                {RECEIVING_STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            {lineStatus !== "pending" ? (
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quantity Received
                </span>
                <input
                  type="number"
                  min={0}
                  className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-right tabular-nums text-slate-900"
                  value={receivedQty}
                  onChange={(e) => setReceivedQty(e.target.value)}
                />
              </label>
            ) : null}

            {lineStatus !== "pending" ? (
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  STORAGE / RACK LOCATION
                </span>
                <input
                  list="receive-storage-locations"
                  maxLength={80}
                  placeholder="e.g. RACK-A1"
                  className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                  value={storageLocation}
                  onChange={(e) => setStorageLocation(e.target.value.toUpperCase())}
                />
                <datalist id="receive-storage-locations">
                  {warehouseLocations.map((location) => (
                    <option key={location} value={location} />
                  ))}
                </datalist>
                <span className="mt-1 block text-xs text-slate-500">
                  This product will be stored at {storageLocation.trim() || "an unassigned location"}.
                </span>
              </label>
            ) : null}

            {lineStatus === "back-order" ? (
              <div className="mb-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Discrepancy
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <QtyField
                    label="Missing"
                    value={missingQty}
                    onChange={setMissingQty}
                  />
                  <QtyField
                    label="Damaged"
                    value={damagedQty}
                    onChange={setDamagedQty}
                  />
                  <QtyField
                    label="Excess"
                    value={excessQty}
                    onChange={setExcessQty}
                  />
                </div>
                <p className="text-[11px] text-slate-600">
                  Expected {target.line.quantity} · Received {receivedQty || 0}
                </p>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notes (optional)
                  </span>
                  <textarea
                    rows={3}
                    placeholder="e.g. Supplier delivered only 8 cylinders."
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-slate-900"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {dialogError ? (
              <p className="mb-3 text-sm text-red-600">{dialogError}</p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveReceive}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={closeReceive}
                className="flex-1 rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LineBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    complete: "bg-emerald-500/15 text-emerald-700",
    received: "bg-emerald-500/15 text-emerald-700",
    pending: "bg-amber-500/15 text-amber-700",
    "to-receive": "bg-amber-500/15 text-amber-700",
    confirmed: "bg-blue-500/15 text-blue-700",
    "back-order": "bg-orange-500/15 text-orange-700",
    cancelled: "bg-slate-400/20 text-slate-600",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
        styles[status] ?? "bg-slate-400/20 text-slate-600"
      }`}
    >
      {status === "to-receive" ? "To receive" : status === "back-order" ? "Back Order" : status}
    </span>
  );
}

export default function ReceiveOrdersPage() {
  return (
    <AdminOnly>
      <ReceiveOrdersPageView />
    </AdminOnly>
  );
}

function QtyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white px-2 py-2 text-right tabular-nums text-slate-900"
      />
    </label>
  );
}
