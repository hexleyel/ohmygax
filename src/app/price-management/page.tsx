"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProducts, updateProduct } from "@/utils/api-services/productService";
import { getSettings } from "@/utils/api-services/settingsService";
import {
  calculateMarginPct,
  calculateSellingPrice,
  validateMarginPricing,
} from "@/lib/calc";
import AdminOnly from "@/components/AdminOnly";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  base_price: number;
  margin_pct: number;
  selling_price: number;
};

type Draft = { base: string; margin: string; selling: string };

function PriceManagementPageView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [error, setError] = useState("");
  const [currentVat, setCurrentVat] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [productData, settings] = await Promise.all([
        listProducts(),
        getSettings(),
      ]);
      setProducts(productData);
      setCurrentVat(settings.vat_rate || "0");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function draftFor(product: Product): Draft {
    const pending = Number(product.base_price) <= 0 || Number(product.selling_price) <= 0;
    return (
      drafts[product.product_id] ?? {
        base: String(product.base_price),
        margin: pending ? "" : String(product.margin_pct),
        selling: pending ? "" : Number(product.selling_price).toFixed(2),
      }
    );
  }

  /** Editing either field recomputes the other, so the two never disagree. */
  function editMargin(product: Product, margin: string) {
    const base = Number(draftFor(product).base);
    setDrafts((current) => ({
      ...current,
      [product.product_id]: {
        ...draftFor(product),
        margin,
        selling: base > 0 && margin.trim() ? calculateSellingPrice(base, Number(margin)).toFixed(2) : "",
      },
    }));
  }

  function editSelling(product: Product, selling: string) {
    const draft = draftFor(product);
    const base = Number(draft.base);
    setDrafts((current) => ({
      ...current,
      [product.product_id]: {
        ...draft,
        // Null base means the margin is undefined; keep the previous value
        // rather than showing NaN while the user is still typing.
        margin:
          calculateMarginPct(base, Number(selling || 0))?.toFixed(2) ??
          draft.margin,
        selling,
      },
    }));
  }

  function editBase(product: Product, base: string) {
    const draft = draftFor(product);
    setDrafts((current) => ({
      ...current,
      [product.product_id]: {
        ...draft,
        base,
        selling: base.trim() && draft.margin.trim()
          ? calculateSellingPrice(Number(base), Number(draft.margin)).toFixed(2)
          : "",
      },
    }));
  }

  async function savePrice(product: Product) {
    setError("");
    const draft = draftFor(product);
    const base = Number(draft.base);

    const margin_pct = Number(draft.margin);

    if (!draft.base.trim() || !draft.margin.trim()) {
      setError(`${product.name}: enter both the base price and margin before saving.`);
      return;
    }

    // Same rule the API applies, so the two can't disagree.
    const pricingProblem = validateMarginPricing(base, margin_pct);
    if (pricingProblem) {
      setError(`${product.name}: ${pricingProblem}`);
      return;
    }
    if (Number(draft.selling) < 0) {
      setError(`${product.name}: selling price can't be negative.`);
      return;
    }
    if (calculateSellingPrice(base, margin_pct) <= 0) {
      setError(`${product.name}: selling price must be above 0.`);
      return;
    }

    try {
      await updateProduct(product.product_id, { base_price: base, margin_pct });
      setDrafts((current) => {
        const next = { ...current };
        delete next[product.product_id];
        return next;
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save price");
    }
  }


  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
          Price Management
        </p>
        <h1 className="text-3xl font-semibold uppercase">Pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          ADMIN-ONLY · ADJUST MARGINS &amp; BASE PRICES
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="w-full max-w-xs rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5 md:col-span-1">
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
            VAT Rate
          </p>
          <p className="mb-4 text-3xl font-semibold text-blue-600">
            {currentVat}% VAT
          </p>
          <Link
            href="/settings"
            className="block w-full rounded-lg border border-[#e2e8f0] px-4 py-2 text-center text-sm font-semibold text-slate-600 transition hover:border-blue-600 hover:text-blue-700"
          >
            Open Settings
          </Link>
        </div>

      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Product Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Base Price</th>
              <th className="px-4 py-3">Margin %</th>
              <th className="px-4 py-3">Selling Price</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const draft = draftFor(product);
                const dirty = drafts[product.product_id] !== undefined;
                const pending = Number(product.base_price) <= 0 || Number(product.selling_price) <= 0;
                return (
                  <tr key={product.product_id} className={`border-t border-[#e2e8f0] ${pending ? "bg-amber-50/70" : ""}`}>
                    <td className="px-4 py-3">{product.sku}</td>
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Base price for ${product.name}`}
                        value={draft.base}
                        onChange={(event) => editBase(product, event.target.value)}
                        className="no-spinner w-28 rounded-lg border border-[#e2e8f0] bg-white px-2 py-1 text-right tabular-nums text-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`Margin percent for ${product.name}`}
                          placeholder={pending ? "Pending" : "0"}
                          value={draft.margin}
                          onChange={(e) => editMargin(product, e.target.value)}
                          className="no-spinner w-24 rounded-lg border border-[#e2e8f0] bg-white px-2 py-1 text-center tabular-nums text-slate-900"
                        />
                        {pending ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-800">Pending</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                          ₱
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`Selling price for ${product.name}`}
                          placeholder={pending ? "Pending" : "0.00"}
                          readOnly={pending}
                          value={draft.selling}
                          onChange={(e) => editSelling(product, e.target.value)}
                          className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white py-1 pl-5 pr-2 text-right tabular-nums font-semibold text-slate-900 read-only:bg-slate-50"
                        />
                      </div>
                      {pending ? <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Pricing required</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!dirty}
                        onClick={() => savePrice(product)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 transition hover:border-blue-600 hover:text-blue-700 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </td>
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

export default function PriceManagementPage() {
  return (
    <AdminOnly>
      <PriceManagementPageView />
    </AdminOnly>
  );
}
