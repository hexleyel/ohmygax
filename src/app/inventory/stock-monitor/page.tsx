"use client";

import { useEffect, useState } from "react";
import { listProducts, updateProduct } from "@/utils/api-services/productService";
import { listWarehouseLocations } from "@/utils/api-services/warehouseLocationService";
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
};

function statusOf(p: Product) {
  if (p.old_stock_qty <= 0) return "out";
  if (p.old_stock_qty <= p.min_stock) return "low";
  return "active";
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationError, setLocationError] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([listProducts(), listWarehouseLocations()])
      .then(([items, locations]) => {
        setProducts(items);
        setLocationOptions(locations);
      })
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    active: products.filter((p) => statusOf(p) === "active").length,
    low: products.filter((p) => statusOf(p) === "low").length,
    out: products.filter((p) => statusOf(p) === "out").length,
  };

  const filtered = products.filter((p) => filter === "all" || statusOf(p) === filter);

  async function saveLocation(productId: number) {
    setSavingLocation(true);
    setLocationError("");
    try {
      await updateProduct(productId, { location: locationDraft.trim() });
      setProducts(await listProducts());
      if (locationDraft.trim()) {
        setLocationOptions((locations) =>
          Array.from(new Set([...locations, locationDraft.trim()])).sort((a, b) => a.localeCompare(b)),
        );
      }
      setEditingId(null);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Failed to update location.");
    } finally {
      setSavingLocation(false);
    }
  }

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
              <th className="px-4 py-3">Current Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Storage / Rack Location</th>
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
                    </td>
                    <td className="px-4 py-3">
                      {editingId === p.product_id ? (
                        <div className="flex min-w-64 items-center gap-2">
                          <input
                            list="stock-location-options"
                            maxLength={80}
                            autoFocus
                            value={locationDraft}
                            onChange={(event) => setLocationDraft(event.target.value.toUpperCase())}
                            placeholder="e.g. RACK-A1"
                            className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <button type="button" disabled={savingLocation} onClick={() => void saveLocation(p.product_id)} className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Save</button>
                          <button type="button" disabled={savingLocation} onClick={() => { setEditingId(null); setLocationError(""); }} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-700">{p.location || "UNASSIGNED"}</span>
                          <button type="button" onClick={() => { setEditingId(p.product_id); setLocationDraft(p.location || ""); setLocationError(""); }} className="whitespace-nowrap rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700">Edit Location</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <datalist id="stock-location-options">
        {locationOptions.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
      {locationError ? <p role="alert" className="mt-3 text-sm text-red-600">{locationError}</p> : null}
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
