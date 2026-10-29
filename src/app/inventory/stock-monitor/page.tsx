"use client";

import { useEffect, useState } from "react";
import { listProducts } from "@/utils/api-services/productService";
import AdminOnly from "@/components/AdminOnly";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  stock_qty: number;
  new_stock_qty: number;
  old_stock_qty: number;
  full_qty: number;
  empty_qty: number;
  min_stock: number;
  max_stock: number;
  location: string | null;
  base_price: number;
  selling_price: number;
};

function statusOf(p: Product) {
  if (p.old_stock_qty <= 0) return "out";
  if (p.old_stock_qty <= p.min_stock) return "low";
  return "active";
}

function hasPendingMargin(p: Product) {
  return Number(p.base_price) <= 0 || Number(p.selling_price) <= 0;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700",
  low: "bg-amber-500/15 text-amber-700",
  out: "bg-red-500/15 text-red-600",
};

function StockMonitorPageView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "low" | "out">("all");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listProducts()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    active: products.filter((p) => statusOf(p) === "active").length,
    low: products.filter((p) => statusOf(p) === "low").length,
    out: products.filter((p) => statusOf(p) === "out").length,
  };

  const filtered = products.filter((p) => filter === "all" || statusOf(p) === filter);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Inventory</p>
        <h1 className="text-3xl font-semibold uppercase">Stock Monitor</h1>
        <p className="mt-1 text-sm text-slate-500">
          {counts.active} ACTIVE · {counts.low} LOW · {counts.out} OUT
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(["all", "active", "low", "out"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase transition ${
              filter === f
                ? "border-blue-600 bg-blue-600/15 text-blue-700"
                : "border-[#e2e8f0] text-slate-500"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Minimum Stock</th>
              <th className="px-4 py-3">Reserve Stock</th>
              <th className="px-4 py-3">In Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bin Location</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  No products in this view.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const newStocks = p.new_stock_qty;
                const oldStocks = p.old_stock_qty;
                const totalStock = newStocks + oldStocks;
                const status = statusOf(p);
                const pct = p.min_stock > 0
                  ? Math.min(100, (oldStocks / p.min_stock) * 100)
                  : oldStocks > 0 ? 100 : 0;
                return (
                  <tr key={p.product_id} className="border-t border-[#e2e8f0]">
                    <td className="px-4 py-3">
                      <p>{p.name}</p>
                      <p className="text-xs text-slate-500">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="mb-1 text-xs text-slate-500">
                        <span className="tabular-nums">{totalStock}</span>
                      </div>
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#f1f5f9]">
                        <div
                          className={`h-full ${status === "out" ? "bg-red-500" : status === "low" ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${pct}%` }}
                          title={`${oldStocks} current stock available against ${p.min_stock} minimum`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{p.min_stock}</td>
                    <td className="px-4 py-3 tabular-nums">{newStocks}</td>
                    <td className="px-4 py-3 tabular-nums">{oldStocks}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[status]}`}
                      >
                        {status}
                      </span>
                      {hasPendingMargin(p) ? <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Margin Pending</span> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.location || "UNASSIGNED"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StockMonitorPage() {
  return (
    <AdminOnly>
      <StockMonitorPageView />
    </AdminOnly>
  );
}
