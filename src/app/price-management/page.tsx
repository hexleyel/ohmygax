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
import { peso } from "@/lib/format";
import AdminOnly from "@/components/AdminOnly";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  base_price: number;
  margin_pct: number;
  selling_price: number;
};

type Draft = { margin: string; selling: string };

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
    return (
      drafts[product.product_id] ?? {
        margin: String(product.margin_pct),
        selling: Number(product.selling_price).toFixed(2),
      }
    );
  }

  /** Editing either field recomputes the other, so the two never disagree. */
  function editMargin(product: Product, margin: string) {
    const base = Number(product.base_price);
    setDrafts((current) => ({
      ...current,
      [product.product_id]: {
        margin,
        selling: calculateSellingPrice(base, Number(margin || 0)).toFixed(2),
      },
    }));
  }

  function editSelling(product: Product, selling: string) {
    const base = Number(product.base_price);
    setDrafts((current) => ({
      ...current,
      [product.product_id]: {
        // Null base means the margin is undefined; keep the previous value
        // rather than showing NaN while the user is still typing.
        margin:
          calculateMarginPct(base, Number(selling || 0))?.toFixed(2) ??
          String(product.margin_pct),
        selling,
      },
    }));
  }

  async function savePrice(product: Product) {
    setError("");
    const draft = draftFor(product);
    const base = Number(product.base_price);

    const margin_pct = Number(draft.margin);

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

    try {
      await updateProduct(product.product_id, { margin_pct });
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
                return (
                  <tr key={product.product_id} className="border-t border-[#e2e8f0]">
                    <td className="px-4 py-3">{product.sku}</td>
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3">{peso(product.base_price)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={draft.margin}
                        onChange={(e) => editMargin(product, e.target.value)}
                        className="no-spinner w-20 rounded-lg border border-[#e2e8f0] bg-white px-2 py-1 text-center tabular-nums text-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                          ₱
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={draft.selling}
                          onChange={(e) => editSelling(product, e.target.value)}
                          className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white py-1 pl-5 pr-2 text-right tabular-nums font-semibold text-slate-900"
                        />
                      </div>
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
