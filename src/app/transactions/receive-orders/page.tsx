"use client";

import { useEffect, useState } from "react";
import AdminOnly from "@/components/AdminOnly";
import {
  PURCHASE_ORDER_STATUS_FILTERS,
  PurchaseOrderStatusBadge,
  PurchaseOrderStatusTabs,
  RECEIVE_ORDER_STATUS_FILTERS,
  type PurchaseOrderStatusCounts,
  type PurchaseOrderStatusFilter,
} from "@/components/PurchaseOrderStatus";
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
  supplier: { name: string; email?: string | null };
  items: POLine[];
};

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
    useState<PurchaseOrderStatusFilter>("all");
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
  const [locationSearch, setLocationSearch] = useState("");
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [highlightedLocationIndex, setHighlightedLocationIndex] = useState(0);
  const [warehouseLocations, setWarehouseLocations] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setOrders(
        (await listPurchaseOrders({ all: "1", receivableOnly: "1" }))
          .filter((order: PO) => order.status !== "issued" && order.status !== "cancelled"),
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
    listPurchaseOrders({ all: "1", receivableOnly: "1" })
      .then((rows) => {
        if (active) {
          setOrders(rows.filter((order: PO) => order.status !== "issued" && order.status !== "cancelled"));
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
    setLocationSearch(line.product.location ?? "");
    setLocationDropdownOpen(false);
    setHighlightedLocationIndex(0);
    setDialogError("");
  }

  const filteredWarehouseLocations = warehouseLocations.filter((location) =>
    location.toLocaleLowerCase().includes(locationSearch.trim().toLocaleLowerCase()),
  );

  function selectStorageLocation(location: string) {
    const selected = location.trim().toUpperCase();
    setStorageLocation(selected);
    setLocationSearch(selected);
    setLocationDropdownOpen(false);
    setHighlightedLocationIndex(0);
  }

  function closeReceive() {
    setTarget(null);
    setDialogError("");
  }

  function reportDiscrepancy(order: PO) {
    const reference = order.reference_no || `PO-${order.po_id}`;
    const subject = `Discrepancy Report: ${reference} - ${order.supplier.name}`;
    const itemDetails = order.items.map((line) => {
      const issues = [
        line.missing_qty ? `Missing: ${line.missing_qty}` : null,
        line.damaged_qty ? `Damaged: ${line.damaged_qty}` : null,
        line.excess_qty ? `Excess: ${line.excess_qty}` : null,
      ].filter(Boolean).join(", ");
      return [
        `- Product: ${line.product.name}`,
        `  Ordered Qty: ${line.quantity}`,
        `  Received Qty: ${line.received_qty}`,
        `  Issue Description: ${issues || line.receive_note || ""}`,
      ].join("\n");
    }).join("\n\n");
    const body = [
      "Hi Team,",
      "",
      `We noted a discrepancy with the recent delivery under PO #${reference}.`,
      "",
      "Details of concern (damaged / incomplete qty / other):",
      itemDetails || "- Product: \n- Ordered Qty: \n- Received Qty: \n- Issue Description: ",
      "",
      "Please advise on replacement or credit memo.",
      "",
      "Thank you,",
      "OHMYGAS Store",
    ].join("\n");
    const mailto = `mailto:${encodeURIComponent(order.supplier.email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_blank");
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
  const statusCounts = PURCHASE_ORDER_STATUS_FILTERS.reduce(
    (counts, status) => {
      counts[status] = status === "all"
        ? orders.length
        : orders.filter((order) => order.status === status).length;
      return counts;
    },
    {} as PurchaseOrderStatusCounts,
  );
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

      <PurchaseOrderStatusTabs
        value={statusFilter}
        counts={statusCounts}
        filters={RECEIVE_ORDER_STATUS_FILTERS}
        onChange={(status) => { setStatusFilter(status); setPage(1); }}
      />

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
                const canReceive = order.status === "pending" || order.status === "back-order";
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
                      <PurchaseOrderStatusBadge status={order.status} />
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
                <PurchaseOrderStatusBadge status={viewing.status} />
                <span className="font-semibold tabular-nums">{peso(Number(viewing.total_amount))}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr className="border-b border-[#e2e8f0] text-[11px] uppercase tracking-wide">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Bin Location</th>
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
                      <td className="px-4 py-3 font-mono text-xs">{line.product.location || "UNASSIGNED"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{line.received_qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{peso(line.quantity * Number(line.unit_cost))}</td>
                      <td className="px-4 py-3">
                        <PurchaseOrderStatusBadge status={line.receive_status} />
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
                        ) : viewing.status === "pending" || viewing.status === "back-order" ? (
                          <button type="button" onClick={() => { setViewing(null); openReceive(viewing, line); }} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                            Receive
                          </button>
                        ) : viewing.status === "issued" ? (
                          <span className="text-xs text-slate-500">Awaiting confirmation</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f0] p-4">
              <button
                type="button"
                disabled={!viewing.supplier.email}
                title={viewing.supplier.email ? `Email ${viewing.supplier.email}` : "Supplier email is not available"}
                onClick={() => reportDiscrepancy(viewing)}
                className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Report Discrepancy
              </button>
              <button type="button" onClick={() => setViewing(null)} className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600">Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {target ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-8 w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
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

            <div className="mb-4 overflow-x-hidden">
              <table className="my-2 w-full table-fixed text-[11px] sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="w-[28%] pb-2">Item</th>
                    <th className="w-[22%] pb-2">Bin Location</th>
                    <th className="w-[10%] pb-2 text-right">Qty</th>
                    <th className="w-[20%] whitespace-nowrap pb-2 text-right">Unit Price</th>
                    <th className="w-[20%] whitespace-nowrap pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="truncate py-2 pr-1" title={target.line.product.name}>{target.line.product.name}</td>
                    <td className="truncate py-2 pr-1 font-mono text-[10px] sm:text-xs" title={target.line.product.location || "UNASSIGNED"}>{target.line.product.location || "UNASSIGNED"}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums">{target.line.quantity}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums">
                      {peso(Number(target.line.unit_cost))}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums">
                      {peso(target.line.quantity * Number(target.line.unit_cost))}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="text-base font-bold">
                    <td className="pt-3" colSpan={4}>Total</td>
                    <td className="whitespace-nowrap pt-3 text-right tabular-nums">
                      {peso(target.line.quantity * Number(target.line.unit_cost))}
                    </td>
                  </tr>
                </tfoot>
              </table>
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
              <div className="mb-3">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  STORAGE / BIN LOCATION
                </span>
                <div className="relative">
                  <input
                    type="text"
                    role="combobox"
                    aria-label="Storage / bin location"
                    aria-autocomplete="list"
                    aria-expanded={locationDropdownOpen}
                    aria-controls="receive-storage-locations"
                    aria-activedescendant={
                      locationDropdownOpen && filteredWarehouseLocations[highlightedLocationIndex]
                        ? `receive-storage-location-${highlightedLocationIndex}`
                        : undefined
                    }
                    autoComplete="off"
                    maxLength={80}
                    placeholder="Search or enter a bin ID (e.g. SHELF-C2-01)"
                    className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                    value={locationSearch}
                    onFocus={() => setLocationDropdownOpen(true)}
                    onBlur={() => setLocationDropdownOpen(false)}
                    onChange={(event) => {
                      setLocationSearch(event.target.value.toUpperCase());
                      setStorageLocation("");
                      setHighlightedLocationIndex(0);
                      setLocationDropdownOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setLocationDropdownOpen(false);
                      } else if (event.key === "ArrowDown" && filteredWarehouseLocations.length) {
                        event.preventDefault();
                        setLocationDropdownOpen(true);
                        setHighlightedLocationIndex((index) => Math.min(index + 1, filteredWarehouseLocations.length - 1));
                      } else if (event.key === "ArrowUp" && filteredWarehouseLocations.length) {
                        event.preventDefault();
                        setLocationDropdownOpen(true);
                        setHighlightedLocationIndex((index) => Math.max(index - 1, 0));
                      } else if (event.key === "Enter" && locationDropdownOpen) {
                        const option = filteredWarehouseLocations[highlightedLocationIndex];
                        if (option) {
                          event.preventDefault();
                          selectStorageLocation(option);
                        } else if (locationSearch.trim()) {
                          event.preventDefault();
                          selectStorageLocation(locationSearch);
                        }
                      }
                    }}
                  />
                  {locationDropdownOpen ? (
                    <div
                      id="receive-storage-locations"
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                    >
                      {filteredWarehouseLocations.map((location, index) => (
                        <button
                          id={`receive-storage-location-${index}`}
                          key={location}
                          type="button"
                          role="option"
                          aria-selected={location === storageLocation}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectStorageLocation(location)}
                          className={`block w-full px-3 py-2 text-left text-sm ${
                            highlightedLocationIndex === index ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {location}
                        </button>
                      ))}
                      {locationSearch.trim() && !warehouseLocations.some(
                        (location) => location.toLocaleLowerCase() === locationSearch.trim().toLocaleLowerCase(),
                      ) ? (
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectStorageLocation(locationSearch)}
                          className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Use “{locationSearch.trim()}”
                        </button>
                      ) : null}
                      {!filteredWarehouseLocations.length && !locationSearch.trim() ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No bin locations available.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {storageLocation.trim() ? (
                  <span className="mt-1 block text-xs text-slate-500">
                    This product will be stored at {storageLocation.trim()}.
                  </span>
                ) : null}
              </div>
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
                {saving ? "Confirming…" : "Confirm Receipt"}
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
