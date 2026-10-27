"use client";

import { useEffect, useState } from "react";
import { getSalesReport } from "@/utils/api-services/reportService";
import { listPurchaseOrders } from "@/utils/api-services/purchaseOrderService";
import { listDeliveries } from "@/utils/api-services/deliveryService";
import { listProducts } from "@/utils/api-services/productService";
import AdminOnly from "@/components/AdminOnly";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";

const TABS = [
  "Sales",
  "Annual",
  "Transactions",
  "Delivery",
  "Stock",
  "Purchase Orders",
  "Receiving",
] as const;

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function ReportsPageView() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [sales, setSales] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [tablePage, setTablePage] = useState(1);

  async function load(fromDate = from, toDate = to) {
    setLoadError("");
    try {
      const [salesData, orderData, deliveryData, productData] = await Promise.all([
        getSalesReport({
          ...(fromDate ? { from: fromDate } : {}),
          ...(toDate ? { to: toDate } : {}),
          tzOffset: String(new Date().getTimezoneOffset()),
        }),
        // Reports cover the full history, not the recent-only default the
        // Purchase Orders screen uses.
        listPurchaseOrders({ all: "1" }),
        listDeliveries(),
        listProducts({ all: "1" }),
      ]);
      setSales(salesData);
      setOrders(orderData);
      setDeliveries(deliveryData);
      setProducts(productData);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load report data.");
    }
  }

  useEffect(() => {
    const today = dateInputValue(new Date());
    const year = String(new Date().getFullYear());
    setFrom(today);
    setTo(today);
    setSelectedYear(year);
    void load(today, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(nextTab: (typeof TABS)[number]) {
    setTab(nextTab);
    setTablePage(1);
    if (nextTab === "Annual" && selectedYear) {
      void load(`${selectedYear}-01-01`, `${selectedYear}-12-31`);
    } else if ((nextTab === "Sales" || nextTab === "Transactions") && from && to) {
      void load(from, to);
    }
  }

  /** Case-insensitive match across any of the given values. */
  function matches(...values: (string | number | null | undefined)[]) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return values.some((v) =>
      String(v ?? "").toLowerCase().includes(q),
    );
  }

  function exportCsv() {
    if (!sales) return;
    const rows = [
      ["Transaction ID", "Date", "Payment", "Total"],
      ...sales.transactions.map((t: any) => [
        t.transaction_id,
        new Date(t.transaction_date).toISOString(),
        t.payment_method,
        t.total_amount,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredTransactions = (sales?.transactions ?? []).filter((transaction: any) =>
    matches(transaction.transaction_id, transaction.reference_no, transaction.payment_method, transaction.user?.full_name),
  );
  const filteredDeliveries = deliveries.filter((delivery) =>
    matches(delivery.delivery_id, delivery.reference_no, delivery.sales_order_no, delivery.customer?.name, delivery.status),
  );
  const filteredProducts = products.filter((product) => matches(product.sku, product.name));
  const filteredOrders = orders
    .filter((order) => (tab === "Receiving" ? order.status === "received" : true))
    .filter((order) => matches(order.po_id, order.supplier?.name, order.status));
  const transactionPage = clampPage(tablePage, filteredTransactions.length);
  const deliveryPage = clampPage(tablePage, filteredDeliveries.length);
  const stockPage = clampPage(tablePage, filteredProducts.length);
  const ordersPage = clampPage(tablePage, filteredOrders.length);
  const pagedTransactions = pageSlice(filteredTransactions, transactionPage);
  const pagedDeliveries = pageSlice(filteredDeliveries, deliveryPage);
  const pagedProducts = pageSlice(filteredProducts, stockPage);
  const pagedOrders = pageSlice(filteredOrders, ordersPage);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Reports</p>
          <h1 className="text-3xl font-semibold uppercase">Reports &amp; Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">ADMINISTRATIVE REPORTING</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setTablePage(1); }}
            placeholder="Search product code, product, TXN #, customer…"
            className="w-64 rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm"
          />
          {tab === "Sales" ? (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Start Date
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setTablePage(1); }}
                  className="rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                End Date
                <input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setTablePage(1); }}
                  className="rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm text-slate-700"
                />
              </label>
              <button
                type="button"
                onClick={() => { setTablePage(1); void load(from, to); }}
                className="rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm text-slate-600"
              >
                Apply Range
              </button>
            </>
          ) : null}
          {tab === "Annual" ? (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Calendar Year
              <select
                value={selectedYear}
                onChange={(event) => {
                  const year = event.target.value;
                  setSelectedYear(year);
                  setTablePage(1);
                  if (year) void load(`${year}-01-01`, `${year}-12-31`);
                }}
                className="rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm text-slate-700"
              >
                {Array.from({ length: 11 }, (_, index) => new Date().getFullYear() + 1 - index).map((year) => (
                  <option key={year} value={String(year)}>{year}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Export
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectTab(t)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase transition ${
              tab === t
                ? "border-blue-600 bg-blue-600/15 text-blue-700"
                : "border-[#e2e8f0] text-slate-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loadError ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {(tab === "Sales" || tab === "Annual") && sales ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard label="Total Sales" value={`₱${sales.totalSales.toFixed(2)}`} />
            <SummaryCard label="Total VAT" value={`₱${sales.totalVat.toFixed(2)}`} />
            <SummaryCard label="Transactions" value={String(sales.transactionCount)} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
            <p className="border-b border-[#e2e8f0] px-4 py-3 text-sm font-semibold uppercase text-slate-600">
              Product Performance
            </p>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f1f5f9] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Product Code</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Qty Sold</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {sales.productPerformance
                  .filter((p: any) => matches(p.sku, p.name))
                  .map((p: any) => (
                  <tr key={p.sku} className="border-t border-[#e2e8f0]">
                    <td className="px-4 py-3">{p.sku}</td>
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3">{p.qty}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">₱{p.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "Transactions" && sales ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-slate-500">
              <tr>
                <th className="px-4 py-3">TXN</th>
                <th className="px-4 py-3">Cashier</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {pagedTransactions.map((t: any) => (
                <tr key={t.transaction_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3 text-blue-600">#{t.transaction_id}</td>
                  <td className="px-4 py-3">{t.user.full_name}</td>
                  <td className="px-4 py-3 uppercase">{t.payment_method}</td>
                  <td className="px-4 py-3">₱{Number(t.total_amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={transactionPage} total={filteredTransactions.length} onChange={setTablePage} label="transactions" />
        </div>
      ) : null}

      {tab === "Delivery" ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-slate-500">
              <tr>
                <th className="px-4 py-3">Delivery #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {pagedDeliveries.map((d) => (
                <tr key={d.delivery_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3">#{d.delivery_id}</td>
                  <td className="px-4 py-3">{d.customer.name}</td>
                  <td className="px-4 py-3 capitalize">{d.status.replace("_", " ")}</td>
                  <td className="px-4 py-3">₱{Number(d.total_amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={deliveryPage} total={filteredDeliveries.length} onChange={setTablePage} label="deliveries" />
        </div>
      ) : null}

      {tab === "Stock" ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Min</th>
                <th className="px-4 py-3">Value</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map((p) => (
                <tr key={p.product_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">{p.stock_qty}</td>
                  <td className="px-4 py-3">{p.min_stock}</td>
                  <td className="px-4 py-3">₱{(p.stock_qty * p.selling_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={stockPage} total={filteredProducts.length} onChange={setTablePage} label="products" />
        </div>
      ) : null}

      {(tab === "Purchase Orders" || tab === "Receiving") ? (
        <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f1f5f9] text-slate-500">
              <tr>
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((o) => (
                  <tr key={o.po_id} className="border-t border-[#e2e8f0]">
                    <td className="px-4 py-3">#{o.po_id}</td>
                    <td className="px-4 py-3">{o.supplier.name}</td>
                    <td className="px-4 py-3 capitalize">{o.status === "back-order" ? "Back Order" : o.status}</td>
                    <td className="px-4 py-3">₱{Number(o.total_amount).toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <Pagination page={ordersPage} total={filteredOrders.length} onChange={setTablePage} label={tab === "Receiving" ? "receiving records" : "purchase orders"} />
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-blue-600">{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <AdminOnly>
      <ReportsPageView />
    </AdminOnly>
  );
}
