"use client";

import { useEffect, useState } from "react";
import { listCustomers } from "@/utils/api-services/customerService";
import { listProducts } from "@/utils/api-services/productService";
import {
  cancelDelivery,
  completeDelivery,
  createDelivery,
  dispatchDelivery,
  listDeliveries,
  updateDelivery,
} from "@/utils/api-services/deliveryService";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getSettings } from "@/utils/api-services/settingsService";
import { isValidPhMobile, PH_MOBILE_HINT } from "@/lib/validation";
import { calculateVatAmount } from "@/lib/calc";

type Delivery = {
  delivery_id: number;
  customer_id: number;
  reference_no: string | null;
  sales_order_no: string | null;
  notes: string | null;
  payment_method: string | null;
  gcash_mobile?: string | null;
  gcash_reference?: string | null;
  eta: string | null;
  created_at: string;
  status: string;
  address: string;
  total_amount: number;
  customer: { name: string; phone?: string | null; email?: string | null };
  items: { product_id: number; product: { name: string; selling_price?: number | string }; quantity: number; without_cylinder_qty?: number; cylinder_fee?: number | string }[];
};

function todayInputDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  in_transit: "bg-sky-500/15 text-sky-700",
  completed: "bg-emerald-500/15 text-emerald-700",
  cancelled: "bg-slate-500/15 text-slate-500",
};

const formatPeso = (amount: number | string) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(amount) || 0);

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In Transit" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function DeliveryOrdersPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingDelivery, setViewingDelivery] = useState<Delivery | null>(null);
  const [completionTarget, setCompletionTarget] = useState<Delivery | null>(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [emptyCylindersReturned, setEmptyCylindersReturned] = useState("0");
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayInputDate);
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "gcash">("cod");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([{ product_id: 0, quantity: 0, without_cylinder_qty: 0 }]);
  const [settings, setSettings] = useState<Record<string, string>>({ cylinder_exchange_fee: "150" });
  const [gcashMobile, setGcashMobile] = useState("");
  const [gcashReference, setGcashReference] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isShiftAlertOpen, setIsShiftAlertOpen] = useState(false);
  const [shiftAlertMessage, setShiftAlertMessage] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editDeliveryDate, setEditDeliveryDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editItems, setEditItems] = useState<{ product_id: number; quantity: number; without_cylinder_qty: number }[]>([]);
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cod" | "gcash">("cod");
  const [editGcashMobile, setEditGcashMobile] = useState("");
  const [editGcashReference, setEditGcashReference] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [d, c, p] = await Promise.all([listDeliveries(), listCustomers(), listProducts()]);
      setDeliveries(d);
      setCustomers(c);
      setProducts(p);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load delivery data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    getSettings().then(setSettings);
  }, []);

  const cylinderFee = Number(settings.cylinder_exchange_fee || 150);
  const configuredVatRate = Number(settings.vat_rate);
  const vatRate = Number.isFinite(configuredVatRate) ? configuredVatRate : 12;

  function isCylinderProduct(product: any) {
    return Boolean(product?.is_cylinder) || String(product?.category ?? "").toLowerCase() === "cylinder";
  }

  function updateWithoutCylinder(index: number, value: number, edit = false) {
    const updater = edit ? setEditItems : setItems;
    updater((current: any[]) => current.map((line, i) => {
      if (i !== index) return line;
      const qty = Number(line.quantity) || 0;
      return { ...line, without_cylinder_qty: Math.min(Math.max(Math.floor(value) || 0, 0), qty) };
    }));
  }

  function selectCustomer(id: string) {
    setCustomerId(id);
    const picked = customers.find((c) => String(c.customer_id) === id);
    if (picked) {
      // Pull the customer's saved details across so they don't get retyped.
      setAddress(picked.address || "");
      setPhone(picked.phone || "");
      setEmail(picked.email || "");
    }
  }

  function selectProduct(index: number, productId: number) {
    setDuplicateWarning("");
    if (productId > 0 && items.some((item, i) => i !== index && item.product_id === productId)) {
      setDuplicateWarning("Product is already on this order, change the quantity on the existing line instead.");
      return;
    }
    setItems((current) => current.map((item, i) =>
      i === index ? { ...item, product_id: productId, without_cylinder_qty: 0 } : item,
    ));
  }

  function removeItemLine(index: number) {
    setDuplicateWarning("");
    setItems((current) => current.length === 1
      ? [{ product_id: 0, quantity: 0, without_cylinder_qty: 0 }]
      : current.filter((_, i) => i !== index),
    );
  }

  function openEditDelivery(delivery: Delivery) {
    setEditError("");
    setEditCustomerId(String(delivery.customer_id));
    setEditAddress(delivery.address);
    setEditDeliveryDate(delivery.eta?.slice(0, 10) ?? todayInputDate());
    setEditNotes(delivery.notes ?? "");
    setEditItems(delivery.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity, without_cylinder_qty: Number(item.without_cylinder_qty) || 0 })));
    setEditPaymentMethod(delivery.payment_method === "gcash" ? "gcash" : "cod");
    setEditGcashMobile(delivery.gcash_mobile ?? "");
    setEditGcashReference(delivery.gcash_reference ?? "");
    setEditingDelivery(delivery);
  }

  function selectEditProduct(index: number, productId: number) {
    setEditError("");
    if (productId > 0 && editItems.some((item, i) => i !== index && item.product_id === productId)) {
      setEditError("Product is already on this order, change the quantity on the existing line instead.");
      return;
    }
    setEditItems((current) => current.map((item, i) => i === index ? { ...item, product_id: productId, without_cylinder_qty: 0 } : item));
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDelivery) return;
    if (!editCustomerId || !editAddress.trim() || !editDeliveryDate || editItems.length === 0 || editItems.some((item) => item.product_id <= 0 || item.quantity <= 0)) {
      setEditError("Complete the customer, address, delivery date, and all product quantities.");
      return;
    }
    if (editPaymentMethod === "gcash" && (!editGcashReference.trim() || !isValidPhMobile(editGcashMobile))) {
      setEditError(!editGcashReference.trim() ? "Enter the GCash reference number from the customer's confirmation." : PH_MOBILE_HINT);
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      await updateDelivery(editingDelivery.delivery_id, {
        customer_id: Number(editCustomerId),
        address: editAddress,
        eta: editDeliveryDate,
        notes: editNotes,
        payment_method: editPaymentMethod,
        gcash_mobile: editPaymentMethod === "gcash" ? editGcashMobile : undefined,
        gcash_reference: editPaymentMethod === "gcash" ? editGcashReference : undefined,
        gcashMobileNumber: editPaymentMethod === "gcash" ? editGcashMobile : undefined,
        gcashReferenceNumber: editPaymentMethod === "gcash" ? editGcashReference : undefined,
        items: editItems.map((item) => ({ ...item, withoutCylinderQty: item.without_cylinder_qty, withoutCylinder: item.without_cylinder_qty > 0 })),
      });
      setEditingDelivery(null);
      await load();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update delivery.");
    } finally {
      setEditSaving(false);
    }
  }

  const editItemsSubtotal = editItems.reduce((sum, item) => {
    const product = products.find((p) => p.product_id === item.product_id);
    return sum + Number(item.quantity || 0) * Number(product?.selling_price || 0);
  }, 0);
  const editCylinderFeeTotal = editItems.reduce((sum, item) => {
    const product = products.find((p) => p.product_id === item.product_id);
    return sum + (isCylinderProduct(product) ? Math.min(item.without_cylinder_qty || 0, item.quantity) * cylinderFee : 0);
  }, 0);
  const editVatAmount = calculateVatAmount(editItemsSubtotal, vatRate);
  const editTotal = editItemsSubtotal + editCylinderFeeTotal;

  const deliveryItemsSubtotal = items.reduce((sum, item) => {
    const product = products.find((p) => p.product_id === item.product_id);
    return sum + Number(item.quantity || 0) * Number(product?.selling_price || 0);
  }, 0);
  const deliveryCylinderFeeTotal = items.reduce((sum, item) => {
    const product = products.find((p) => p.product_id === item.product_id);
    return sum + (isCylinderProduct(product) ? Math.min(item.without_cylinder_qty || 0, item.quantity) * cylinderFee : 0);
  }, 0);
  const deliveryVatAmount = calculateVatAmount(deliveryItemsSubtotal, vatRate);
  const deliveryTotal = deliveryItemsSubtotal + deliveryCylinderFeeTotal;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDeliveryError("");
    if (!customerId || !address.trim() || !deliveryDate || items.some((item) => item.product_id <= 0 || item.quantity <= 0)) {
      setDeliveryError("Complete the customer, address, delivery date, and all product quantities.");
      return;
    }
    if (paymentMethod === "gcash" && !gcashReference.trim()) {
      setDeliveryError("Enter the GCash reference number from the customer's confirmation.");
      return;
    }
    if (paymentMethod === "gcash" && !isValidPhMobile(gcashMobile)) {
      setDeliveryError(PH_MOBILE_HINT);
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmCreate() {
    setSaving(true);
    try {
      await submitDelivery();
      setConfirmOpen(false);
    } catch (error) {
      setDeliveryError(error instanceof Error ? error.message : "Failed to create delivery.");
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function submitDelivery() {
    await createDelivery({
      customer_id: Number(customerId),
      customer_name: customers.find((customer) => String(customer.customer_id) === customerId)?.name,
      address,
      eta: deliveryDate,
      delivery_date: deliveryDate,
      notes,
      payment_method: paymentMethod,
      gcash_mobile: paymentMethod === "gcash" ? gcashMobile : undefined,
      gcash_reference: paymentMethod === "gcash" ? gcashReference : undefined,
      gcashMobileNumber: paymentMethod === "gcash" ? gcashMobile : undefined,
      gcashReferenceNumber: paymentMethod === "gcash" ? gcashReference : undefined,
      items: items.filter((i) => i.product_id > 0).map((item) => ({
        ...item,
        productId: item.product_id,
        price: Number(products.find((product) => product.product_id === item.product_id)?.selling_price || 0),
        withoutCylinderQty: item.without_cylinder_qty,
        withoutCylinderCount: item.without_cylinder_qty,
        withoutCylinder: item.without_cylinder_qty,
      })),
    });
    setShowForm(false);
    setCustomerId("");
    setAddress("");
    setDeliveryDate(todayInputDate());
    setNotes("");
    setPhone("");
    setEmail("");
    setPaymentMethod("cod");
    setGcashMobile("");
    setGcashReference("");
    setDeliveryError("");
    setItems([{ product_id: 0, quantity: 0, without_cylinder_qty: 0 }]);
    setDuplicateWarning("");
    load();
  }

  async function handleAction(id: number, action: "dispatch" | "complete" | "cancel", completion?: { amount_received: number; empty_cylinders_returned: number }) {
    setBusyId(id);
    try {
      if (action === "dispatch") await dispatchDelivery(id);
      if (action === "complete" && completion) await completeDelivery(id, completion);
      if (action === "cancel") await cancelDelivery(id);
      const nextStatus = action === "dispatch" ? "in_transit" : action === "complete" ? "completed" : "cancelled";
      setViewingDelivery((current) => current?.delivery_id === id ? { ...current, status: nextStatus, ...(action === "complete" ? { total_amount: completionTotalDue } : {}) } : current);
      setDeliveries((current) => current.map((delivery) => delivery.delivery_id === id ? { ...delivery, status: nextStatus, ...(action === "complete" ? { total_amount: completionTotalDue } : {}) } : delivery));
      await load();
      return true;
    } catch (error) {
      setShiftAlertMessage(error instanceof Error ? error.message : "Could not process delivery.");
      setIsShiftAlertOpen(true);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const pending = deliveries.filter((d) => d.status === "pending").length;
  const inTransit = deliveries.filter((d) => d.status === "in_transit").length;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleDeliveries = deliveries.filter((delivery) => {
    const matchesStatus = statusFilter === "all" || delivery.status === statusFilter;
    const searchable = [
      delivery.reference_no,
      delivery.sales_order_no,
      delivery.customer?.name,
      delivery.address,
    ].filter(Boolean).join(" ").toLowerCase();
    return matchesStatus && (!normalizedSearch || searchable.includes(normalizedSearch));
  });
  const ordersPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(visibleDeliveries.length / ordersPerPage));
  const page = Math.min(currentPage, totalPages);
  const pageStart = (page - 1) * ordersPerPage;
  const paginatedDeliveries = visibleDeliveries.slice(pageStart, pageStart + ordersPerPage);

  const completionCylinderCount = completionTarget?.items.reduce((sum, item) => {
    const product = products.find((entry) => entry.product_id === item.product_id) || item.product;
    return sum + (isCylinderProduct(product) ? item.quantity : 0);
  }, 0) || 0;
  const completionReturnedCount = Math.max(0, Math.floor(Number(emptyCylindersReturned) || 0));
  const completionSubtotal = completionTarget?.items.reduce((sum, item) => sum + Number(item.product.selling_price || 0) * item.quantity, 0) || 0;
  const completionCylinderFee = Math.max(0, completionCylinderCount - completionReturnedCount) * cylinderFee;
  const completionTotalDue = completionSubtotal + completionCylinderFee;
  const completionPayment = Number(amountReceived) || 0;
  const completionChange = Math.max(0, completionPayment - completionTotalDue);
  const completionShort = Math.max(0, completionTotalDue - completionPayment);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Delivery</p>
          <h1 className="text-3xl font-semibold uppercase">Delivery Orders</h1>
          <p className="mt-1 text-sm text-slate-500">
            {pending} PENDING · {inTransit} IN TRANSIT
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="delivery-search">Search delivery orders</label>
        <input
          id="delivery-search"
          type="search"
          value={searchQuery}
          onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }}
          placeholder="Search deliveries..."
          className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
        />
        <label className="sr-only" htmlFor="delivery-status-filter">Filter deliveries by status</label>
        <select
          id="delivery-status-filter"
          value={statusFilter}
          onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }}
          className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-slate-700"
        >
          {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {showForm ? "Close" : "+ New Delivery"}
        </button>
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 disabled:opacity-60">{loading ? "Loading…" : "Retry"}</button>
        </div>
      ) : null}

          {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5"
        >
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <select
              required
              className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
              value={customerId}
              onChange={(e) => selectCustomer(e.target.value)}
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              required
              className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
              placeholder="Delivery address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <input
              className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
              placeholder="Contact number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Date</span>
              <input
                type="date"
                required
                className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </label>
          </div>

          <div className="mb-3">
            <p className="mb-2 text-sm text-slate-500">Mode of payment</p>
            <div className="flex gap-2">
              {(["cod", "gcash"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    paymentMethod === m
                      ? "border-blue-600 bg-blue-600/15 text-blue-700"
                      : "border-[#e2e8f0] text-slate-500"
                  }`}
                >
                  {m === "cod" ? "COD" : "GCash"}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "gcash" ? (
            <div className="mb-3 grid gap-3 rounded-lg border border-[#e2e8f0] bg-slate-50 p-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">GCash Mobile Number</span>
                <input inputMode="numeric" required placeholder="09XX XXX XXXX" value={gcashMobile} onChange={(event) => { setGcashMobile(event.target.value); setDeliveryError(""); }} className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reference Number</span>
                <input required placeholder="From the customer confirmation" value={gcashReference} onChange={(event) => { setGcashReference(event.target.value); setDeliveryError(""); }} className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm" />
              </label>
            </div>
          ) : null}

          <textarea
            className="mb-3 w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
            placeholder="Delivery notes (landmark, preferred time, instructions…)"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="mb-2 grid grid-cols-[1fr_70px_90px_36px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid-cols-[1fr_120px_120px_40px] sm:text-xs">
            <span>Product</span>
            <span>Quantity</span>
            <span>Without cylinder</span>
            <span />
          </div>
          {items.map((item, index) => (
              <div key={index} className="mb-2 grid grid-cols-[1fr_70px_90px_36px] gap-2 sm:grid-cols-[1fr_120px_120px_40px]">
              <select
                required
                aria-label="Product"
                className="rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
                value={item.product_id}
                onChange={(e) => selectProduct(index, Number(e.target.value))}
              >
                <option value={0}>Select product</option>
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                step={1}
                aria-label="Quantity"
                placeholder="Qty"
                className="no-spinner rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
                value={item.quantity || ""}
                onChange={(e) => setItems((current) => current.map((it, i) =>
                  i === index ? { ...it, quantity: Number(e.target.value), without_cylinder_qty: Math.min(it.without_cylinder_qty, Number(e.target.value) || 0) } : it,
                ))}
              />
              {isCylinderProduct(products.find((p) => p.product_id === item.product_id)) ? (
                <label className="flex items-center gap-1"><input type="number" aria-label="Without cylinder quantity" min={0} max={item.quantity} step={1} value={item.without_cylinder_qty || ""} onChange={(event) => updateWithoutCylinder(index, Number(event.target.value))} className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white px-2 py-2 text-right tabular-nums" /><span className="text-[10px] text-slate-400">/{item.quantity}</span></label>
              ) : <span />}
              <button
                type="button"
                onClick={() => removeItemLine(index)}
                title="Remove this line"
                aria-label="Remove product line"
                className="h-10 rounded-lg border border-[#e2e8f0] text-sm text-slate-500 transition hover:border-red-500 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
          {duplicateWarning ? (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              {duplicateWarning}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setItems((c) => [...c, { product_id: 0, quantity: 0, without_cylinder_qty: 0 }])}
            className="mb-4 text-xs text-blue-700"
          >
            + Add line
          </button>

          <div className="mb-2 flex justify-end gap-8 text-sm text-slate-500"><span>Items subtotal</span><span className="w-28 text-right tabular-nums">{formatPeso(deliveryItemsSubtotal)}</span></div>
          <div className="mb-2 flex justify-end gap-8 text-sm text-slate-500"><span>VAT Breakdown ({vatRate}%)</span><span className="w-28 text-right tabular-nums">{formatPeso(deliveryVatAmount)}</span></div>
          {deliveryCylinderFeeTotal > 0 ? <div className="mb-2 flex justify-end gap-8 text-sm text-slate-500"><span>Cylinder exchange/deposit fee</span><span className="w-28 text-right tabular-nums">{formatPeso(deliveryCylinderFeeTotal)}</span></div> : null}
          {deliveryError ? <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{deliveryError}</p> : null}
          <div className="mb-4 flex justify-end border-t border-[#e2e8f0] pt-3 text-base font-semibold">
            <span className="mr-6">Total Amount Due</span>
            <span className="tabular-nums">₱{deliveryTotal.toFixed(2)}</span>
          </div>

          <button className="block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">
            Create Delivery
          </button>
        </form>
      ) : null}

      {editingDelivery ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-delivery-title"
            onSubmit={handleEditSubmit}
            className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Delivery Order</p>
                <h2 id="edit-delivery-title" className="text-xl font-semibold">Edit Delivery</h2>
              </div>
              <span className="text-xs font-semibold text-slate-500">{editingDelivery.reference_no || `#${editingDelivery.delivery_id}`}</span>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer *</span>
                <select
                  required
                  className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2"
                  value={editCustomerId}
                  onChange={(e) => setEditCustomerId(e.target.value)}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.customer_id} value={customer.customer_id}>{customer.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</span>
                <input
                  required
                  className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Date</span>
                <input
                  type="date"
                  required
                  className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2"
                  value={editDeliveryDate}
                  onChange={(e) => setEditDeliveryDate(e.target.value)}
                />
              </label>
            </div>

            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mode of payment</p>
              <div className="flex gap-2">
                {(["cod", "gcash"] as const).map((method) => (
                  <button key={method} type="button" onClick={() => setEditPaymentMethod(method)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${editPaymentMethod === method ? "border-blue-600 bg-blue-600/15 text-blue-700" : "border-[#e2e8f0] text-slate-500"}`}>{method === "cod" ? "COD" : "GCash"}</button>
                ))}
              </div>
            </div>
            {editPaymentMethod === "gcash" ? (
              <div className="mb-3 grid gap-3 rounded-lg border border-[#e2e8f0] bg-slate-50 p-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">GCash Mobile Number</span><input inputMode="numeric" required placeholder="09XX XXX XXXX" value={editGcashMobile} onChange={(event) => setEditGcashMobile(event.target.value)} className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm" /></label>
                <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reference Number</span><input required placeholder="From the customer confirmation" value={editGcashReference} onChange={(event) => setEditGcashReference(event.target.value)} className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm" /></label>
              </div>
            ) : null}

            <div className="mb-2 hidden grid-cols-[1fr_80px_100px_40px] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
              <span>Product</span><span>Quantity</span><span>Without cylinder</span><span />
            </div>
            {editItems.map((item, index) => (
              <div key={index} className="mb-2 grid grid-cols-[1fr_70px_90px_36px] gap-2 sm:grid-cols-[1fr_80px_100px_40px]">
                <select
                  required
                  aria-label="Product"
                  className="rounded-lg border border-[#e2e8f0] bg-white px-3 py-2"
                  value={item.product_id}
                  onChange={(e) => selectEditProduct(index, Number(e.target.value))}
                >
                  <option value={0}>Select product</option>
                  {products.map((product) => (
                    <option key={product.product_id} value={product.product_id}>{product.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="Quantity"
                  className="no-spinner rounded-lg border border-[#e2e8f0] px-3 py-2"
                  value={item.quantity || ""}
                  onChange={(e) => setEditItems((current) => current.map((line, i) =>
                    i === index ? { ...line, quantity: Number(e.target.value), without_cylinder_qty: Math.min(line.without_cylinder_qty, Number(e.target.value) || 0) } : line,
                  ))}
                />
                {isCylinderProduct(products.find((product) => product.product_id === item.product_id)) ? (
                  <label className="flex items-center gap-1"><input type="number" aria-label="Without cylinder quantity" min={0} max={item.quantity} step={1} value={item.without_cylinder_qty || ""} onChange={(event) => updateWithoutCylinder(index, Number(event.target.value), true)} className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white px-2 py-2 text-right tabular-nums" /><span className="text-[10px] text-slate-400">/{item.quantity}</span></label>
                ) : <span />}
                <button
                  type="button"
                  aria-label="Remove product line"
                  onClick={() => setEditItems((current) => current.length === 1
                    ? [{ product_id: 0, quantity: 0, without_cylinder_qty: 0 }]
                    : current.filter((_, i) => i !== index),
                  )}
                  className="h-10 rounded-lg border border-[#e2e8f0] text-slate-500 hover:border-red-500 hover:text-red-600"
                >×</button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditItems((current) => [...current, { product_id: 0, quantity: 0, without_cylinder_qty: 0 }])}
              className="mb-3 text-xs font-semibold text-blue-700"
            >
              + Add line
            </button>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</span>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Delivery instructions"
              />
            </label>

            <div className="mb-2 flex justify-end gap-8 text-sm text-slate-500"><span>Items subtotal</span><span className="w-28 text-right tabular-nums">{formatPeso(editItemsSubtotal)}</span></div>
            <div className="mb-2 flex justify-end gap-8 text-sm text-slate-500"><span>VAT Breakdown ({vatRate}%)</span><span className="w-28 text-right tabular-nums">{formatPeso(editVatAmount)}</span></div>
            {editCylinderFeeTotal > 0 ? <div className="mb-2 flex justify-end gap-8 text-sm text-slate-500"><span>Cylinder exchange/deposit fee</span><span className="w-28 text-right tabular-nums">{formatPeso(editCylinderFeeTotal)}</span></div> : null}
            <div className="mb-4 flex justify-end border-t border-[#e2e8f0] pt-3 text-base font-semibold">
              <span className="mr-6">TOTAL AMOUNT DUE</span>
              <span className="tabular-nums">₱{editTotal.toFixed(2)}</span>
            </div>
            {editError ? <p className="mb-3 text-sm text-red-600">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={editSaving}
                onClick={() => setEditingDelivery(null)}
                className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm font-semibold text-slate-600"
              >CANCEL</button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >{editSaving ? "UPDATING…" : "UPDATE"}</button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Create this delivery order?"
        size="lg"
        message={
          <div className="space-y-4 text-slate-700">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Information</h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <ReviewField label="Customer" value={customers.find((c) => String(c.customer_id) === customerId)?.name || "—"} />
                <ReviewField label="Phone Number" value={phone || "—"} />
                <ReviewField label="Delivery Address" value={address || "—"} />
              </dl>
            </section>
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Details</h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <ReviewField label="Delivery Date" value={deliveryDate ? new Date(`${deliveryDate}T00:00:00`).toLocaleDateString() : "—"} />
                <ReviewField label="Payment Method" value={paymentMethod === "gcash" ? "GCash" : "COD"} />
                {paymentMethod === "gcash" ? <>
                  <ReviewField label="GCash Mobile" value={gcashMobile || "—"} />
                  <ReviewField label="Reference Number" value={gcashReference || "—"} />
                </> : null}
              </dl>
            </section>
            <section className="overflow-hidden rounded-xl border border-slate-200">
              <h3 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Order Line Items</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Without Cylinder</th><th className="px-4 py-2 text-right">Unit Price</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.filter((item) => item.product_id > 0).map((item, index) => {
                      const product = products.find((p) => p.product_id === item.product_id);
                      return <tr key={`${item.product_id}-${index}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">{product?.name || "Product"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{isCylinderProduct(product) ? item.without_cylinder_qty || 0 : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPeso(product?.selling_price || 0)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financial Summary</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <ReviewAmount label="Subtotal" value={deliveryItemsSubtotal} />
                <ReviewAmount label={`VAT Breakdown (${vatRate}%)`} value={deliveryVatAmount} />
                {deliveryCylinderFeeTotal > 0 ? <ReviewAmount label="Cylinder Exchange/Deposit Fee" value={deliveryCylinderFeeTotal} /> : null}
                <div className="flex justify-between border-t border-blue-200 pt-3 text-base font-semibold text-slate-900"><dt>Total Amount Due</dt><dd className="tabular-nums">{formatPeso(deliveryTotal)}</dd></div>
              </dl>
            </section>
          </div>
        }
        confirmLabel="Confirm & Create Delivery"
        cancelLabel="Go back"
        busy={saving}
        onConfirm={confirmCreate}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {paginatedDeliveries.map((delivery) => (
          <button
            key={delivery.delivery_id}
            type="button"
            onClick={() => setViewingDelivery(delivery)}
            aria-label={`Delivery ${delivery.reference_no || `number ${delivery.delivery_id}`}, ${delivery.status.replaceAll("_", " ")}, customer ${delivery.customer.name}`}
            className="rounded-2xl border border-[#e2e8f0] bg-white p-5 text-left transition hover:border-blue-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-slate-900">
                {delivery.reference_no || `#${delivery.delivery_id}`}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[delivery.status] || "bg-slate-100 text-slate-600"}`}
              >
                {delivery.status.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-3 truncate font-medium text-slate-900">{delivery.customer.name}</p>
          </button>
        ))}
      </div>
      {visibleDeliveries.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">No delivery orders match this status.</div>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs text-slate-500">
          {visibleDeliveries.length === 0
            ? "Showing 0 of 0 orders"
            : `Showing ${pageStart + 1}–${Math.min(pageStart + ordersPerPage, visibleDeliveries.length)} of ${visibleDeliveries.length} orders`}
        </p>
        <nav aria-label="Delivery orders pagination" className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >Previous</button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              aria-current={pageNumber === page ? "page" : undefined}
              onClick={() => setCurrentPage(pageNumber)}
              className={`min-w-9 rounded-lg border px-3 py-1.5 text-sm ${pageNumber === page ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >{pageNumber}</button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >Next</button>
        </nav>
      </div>
      {viewingDelivery ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingDelivery(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="delivery-details-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Delivery Details</p>
                <h2 id="delivery-details-title" className="mt-1 text-xl font-semibold">{viewingDelivery.reference_no || `#${viewingDelivery.delivery_id}`}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <span>SO {viewingDelivery.sales_order_no || "—"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[viewingDelivery.status] || "bg-slate-100 text-slate-600"}`}>{viewingDelivery.status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{new Date(viewingDelivery.created_at).toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {viewingDelivery.status === "pending" ? (
                  <button
                    type="button"
                    disabled={busyId === viewingDelivery.delivery_id}
                    onClick={() => void handleAction(viewingDelivery.delivery_id, "dispatch")}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {busyId === viewingDelivery.delivery_id ? "Dispatching..." : "Dispatch"}
                  </button>
                ) : null}
                {viewingDelivery.status === "in_transit" ? (
                  <button
                    type="button"
                    disabled={busyId === viewingDelivery.delivery_id}
                    onClick={() => {
                      setCompletionTarget(viewingDelivery);
                      setAmountReceived(viewingDelivery.payment_method === "gcash" ? Number(viewingDelivery.total_amount).toFixed(2) : "");
                      setEmptyCylindersReturned("0");
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {busyId === viewingDelivery.delivery_id ? "Completing..." : "Delivered"}
                  </button>
                ) : null}
                <button type="button" aria-label="Close delivery details" onClick={() => setViewingDelivery(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Close</button>
              </div>
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer &amp; Shipping</h3>
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div><p className="text-xs text-slate-500">Customer</p><p className="font-medium">{viewingDelivery.customer.name}</p></div>
                  <div><p className="text-xs text-slate-500">Delivery Location / Address</p><p className="font-medium">{viewingDelivery.address || "—"}</p></div>
                  <div><p className="text-xs text-slate-500">Payment Method</p><p className="font-medium">{viewingDelivery.payment_method === "gcash" ? "GCash" : viewingDelivery.payment_method ? "COD" : "—"}</p></div>
                  {viewingDelivery.payment_method === "gcash" ? <>
                    <div><p className="text-xs text-slate-500">GCash Mobile Number</p><p className="font-medium tabular-nums">{viewingDelivery.gcash_mobile || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Reference Number</p><p className="font-medium tabular-nums">{viewingDelivery.gcash_reference || "—"}</p></div>
                  </> : null}
                  {viewingDelivery.customer.phone ? <div><p className="text-xs text-slate-500">Contact</p><p className="font-medium">{viewingDelivery.customer.phone}</p></div> : null}
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Order Items</h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit Price</th><th className="px-4 py-3 text-right">Subtotal</th><th className="px-4 py-3 text-right">Cylinder Fee</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingDelivery.items.map((item, index) => {
                        const unitPrice = Number(item.product.selling_price || 0);
                        return <tr key={`${item.product_id}-${index}`}><td className="px-4 py-3 font-medium">{item.product.name}{Number(item.without_cylinder_qty) > 0 ? <span className="block text-xs font-normal text-slate-500">{item.without_cylinder_qty} without cylinder</span> : null}</td><td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td><td className="px-4 py-3 text-right tabular-nums">{formatPeso(unitPrice)}</td><td className="px-4 py-3 text-right tabular-nums">{formatPeso(unitPrice * item.quantity)}</td><td className="px-4 py-3 text-right tabular-nums">{formatPeso(Number(item.cylinder_fee || 0))}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="grid gap-4 sm:grid-cols-2">
                <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery Notes</h3><p className="min-h-16 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{viewingDelivery.notes?.trim() || "No delivery notes."}</p></div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Amount</h3>
                  <div className="mt-3 flex items-center justify-between text-sm text-slate-600"><span>Items subtotal</span><span>{formatPeso(viewingDelivery.items.reduce((sum, item) => sum + Number(item.product.selling_price || 0) * item.quantity, 0))}</span></div>
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>VAT Breakdown ({vatRate}%)</span><span>{formatPeso(calculateVatAmount(viewingDelivery.items.reduce((sum, item) => sum + Number(item.product.selling_price || 0) * item.quantity, 0), vatRate))}</span></div>
                  {viewingDelivery.items.some((item) => Number(item.cylinder_fee || 0) > 0) ? <div className="mt-2 flex items-center justify-between text-sm text-slate-600"><span>Cylinder exchange/deposit fee</span><span>{formatPeso(viewingDelivery.items.reduce((sum, item) => sum + Number(item.cylinder_fee || 0), 0))}</span></div> : null}
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 font-semibold text-slate-900"><span>Total Amount Due</span><span className="tabular-nums">{formatPeso(viewingDelivery.total_amount)}</span></div>
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
      {completionTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && busyId !== completionTarget.delivery_id) setCompletionTarget(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="completion-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Delivery Completion</p>
              <h2 id="completion-title" className="mt-1 text-xl font-semibold text-slate-900">Confirm delivery received</h2>
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              <section className="rounded-xl bg-slate-50 p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div><p className="text-xs text-slate-500">Customer</p><p className="font-semibold text-slate-900">{completionTarget.customer.name}</p><p className="text-sm text-slate-600">{completionTarget.customer.phone || ""}</p><p className="text-sm text-slate-600">{completionTarget.address}</p></div>
                  <div className="text-right"><p className="text-xs text-slate-500">Total amount due</p><p className="text-lg font-bold tabular-nums text-slate-900">{formatPeso(completionTotalDue)}</p></div>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Ordered items</h3>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {completionTarget.items.map((item, index) => {
                    const product = products.find((entry) => entry.product_id === item.product_id) || item.product;
                    const cylindersBefore = completionTarget.items.slice(0, index).reduce((sum, previous) => {
                      const previousProduct = products.find((entry) => entry.product_id === previous.product_id) || previous.product;
                      return sum + (isCylinderProduct(previousProduct) ? previous.quantity : 0);
                    }, 0);
                    const returnedForLine = isCylinderProduct(product) ? Math.max(0, Math.min(item.quantity, completionReturnedCount - cylindersBefore)) : 0;
                    const lineCylinderFee = (isCylinderProduct(product) ? item.quantity - returnedForLine : 0) * cylinderFee;
                    const lineTotal = Number(item.product.selling_price || 0) * item.quantity + lineCylinderFee;
                    return <div key={`${item.product_id}-${index}`} className="flex justify-between gap-4 px-4 py-3 text-sm"><span className="font-medium text-slate-800">{item.product.name}{isCylinderProduct(product) ? <span className="block text-xs font-normal text-slate-500">Cylinder fee: {formatPeso(lineCylinderFee)}</span> : null}</span><span className="shrink-0 tabular-nums text-slate-600">× {item.quantity} · {formatPeso(lineTotal)}</span></div>;
                  })}
                </div>
                <div className="mt-2 flex justify-between text-sm text-slate-600"><span>Cylinder Fee</span><span className="tabular-nums">{formatPeso(completionCylinderFee)}</span></div>
              </section>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">Amount Received <span className="text-red-600">*</span>
                  <div className="mt-1 flex items-center rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100"><span className="pl-3 text-slate-500">₱</span><input type="number" min="0" step="0.01" inputMode="decimal" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} className="h-12 w-full rounded-lg border-0 bg-transparent px-3 text-base outline-none" /></div>
                  <div className={`mt-2 flex justify-between rounded-lg px-3 py-2 text-sm font-semibold ${completionShort > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    <span>{completionShort > 0 ? "Short by" : "Change"}</span>
                    <span className="tabular-nums">{formatPeso(completionShort > 0 ? completionShort : completionChange)}</span>
                  </div>
                </label>
                <label className="block text-sm font-medium text-slate-700">Number of Empty Cylinders Returned <span className="text-red-600">*</span>
                  <input type="number" min="0" max={completionCylinderCount} step="1" inputMode="numeric" value={emptyCylindersReturned} onChange={(event) => setEmptyCylindersReturned(event.target.value)} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </label>
              </div>
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                <button type="button" disabled={busyId === completionTarget.delivery_id} onClick={() => setCompletionTarget(null)} className="h-12 rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="button" disabled={busyId === completionTarget.delivery_id || amountReceived === "" || !Number.isFinite(Number(amountReceived)) || Number(amountReceived) < completionTotalDue || !Number.isInteger(Number(emptyCylindersReturned)) || Number(emptyCylindersReturned) < 0 || Number(emptyCylindersReturned) > completionCylinderCount} onClick={async () => {
                  const completed = await handleAction(completionTarget.delivery_id, "complete", { amount_received: Number(amountReceived), empty_cylinders_returned: Number(emptyCylindersReturned) });
                  if (completed) setCompletionTarget(null);
                }} className="h-12 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{busyId === completionTarget.delivery_id ? "Completing..." : "Confirm Completion"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {isShiftAlertOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsShiftAlertOpen(false); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="delivery-action-alert-title" aria-describedby="delivery-action-alert-message" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 id="delivery-action-alert-title" className="text-lg font-semibold text-slate-900">
                  {shiftAlertMessage.toLowerCase().startsWith("no open shift") ? "Cash Shift Required" : "Action Required"}
                </h2>
                <p id="delivery-action-alert-message" className="mt-2 text-sm leading-6 text-slate-600">
                  {shiftAlertMessage.toLowerCase().startsWith("no open shift")
                    ? "No open shift found. Please open a cash shift in Cash Management or POS before processing deliveries."
                    : shiftAlertMessage}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" autoFocus onClick={() => setIsShiftAlertOpen(false)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                OK
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function ReviewAmount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatPeso(value)}</dd>
    </div>
  );
}
