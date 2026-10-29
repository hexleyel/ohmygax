"use client";

import { useEffect, useState } from "react";
import {
  archiveProduct,
  createProduct,
  listProducts,
  restoreProduct,
  updateProduct,
} from "@/utils/api-services/productService";
import { listCategories } from "@/utils/api-services/categoryService";
import { listUoms } from "@/utils/api-services/uomService";
import ConfirmDialog from "@/components/ConfirmDialog";
import AdminOnly from "@/components/AdminOnly";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  uom: string;
  base_price: number;
  margin_pct: number;
  selling_price: number;
  stock_qty: number;
  full_qty: number;
  empty_qty: number;
  min_stock: number;
  max_stock: number;
  location: string | null;
  status: string;
};

type Category = { category_id: number; code: string; name: string; is_cylinder: boolean };
type Uom = { uom_id: number; code: string; name: string };

/** Newest products only — the full catalogue lives in Stock Monitor. */
const emptyForm = {
  name: "",
  category: "",
  uom: "pcs",
  base_price: "",
  min_stock: "",
};

function ProductsPageView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [page, setPage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  async function load(archived = false, term = search) {
    if (archived) setArchiveLoading(true);
    else setLoading(true);
    try {
      const data = await listProducts({
        ...(archived ? { status: "archived" } : {}),
        all: "1",
        ...(term.trim() ? { search: term.trim() } : {}),
      });
      if (archived) setArchivedProducts(data);
      else setProducts(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load products.";
      if (archived) setArchiveError(message);
      else setError(message);
    } finally {
      if (archived) setArchiveLoading(false);
      else setLoading(false);
    }
  }

  function openArchive() {
    setError("");
    setArchiveError("");
    setArchiveLoading(true);
    setArchivePage(1);
    setShowArchive(true);
  }

  useEffect(() => {
    listCategories().then((rows: Category[]) => {
      setCategories(rows);
      setForm((f) => (f.category ? f : { ...f, category: rows[0]?.code ?? "" }));
    });
    listUoms().then(setUoms);
  }, []);

  useEffect(() => {
    setPage(1);
    setArchivePage(1);
    const timer = setTimeout(() => {
      void load(false, search);
      if (showArchive) void load(true, search);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showArchive]);

  const activePage = clampPage(page, products.length, pageSize);
  const currentArchivePage = clampPage(archivePage, archivedProducts.length, pageSize);
  const visibleProducts = pageSlice(products, activePage, pageSize);
  const visibleArchivedProducts = pageSlice(archivedProducts, currentArchivePage, pageSize);

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
    }));
  }

  function startAdd() {
    setEditingId(null);
    setForm({ ...emptyForm, category: categories[0]?.code ?? "" });
    setError("");
    setShowForm(true);
  }

  function startEdit(product: Product) {
    setEditingId(product.product_id);
    setForm({
      name: product.name,
      category: product.category,
      uom: product.uom,
      min_stock: String(product.min_stock),
    });
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaveConfirmOpen(true);
  }

  async function confirmSave() {
    setBusy(true);
    try {
      if (editingId) {
        await updateProduct(editingId, {
          name: form.name,
          category: form.category,
          min_stock: form.min_stock,
        });
      } else {
        await createProduct(form);
      }
      setSaveConfirmOpen(false);
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
      setSaveConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchiveToggle() {
    if (!archiveTarget) return;
    setBusy(true);
    try {
      if (archiveTarget.status === "active") {
        await archiveProduct(archiveTarget.product_id);
      } else {
        await restoreProduct(archiveTarget.product_id);
      }
      setArchiveTarget(null);
      await Promise.all([load(false, search), load(true, search)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
      setArchiveTarget(null);
    } finally {
      setBusy(false);
    }
  }

  const editingProductCode = editingId
    ? products.find((p) => p.product_id === editingId)?.sku
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
            File Maintenance
          </p>
          <h1 className="text-3xl font-semibold uppercase">Products</h1>
          <p className="mt-1 text-sm text-slate-500">ACTIVE · {products.length} TOTAL PRODUCTS · PAGE {activePage} OF {Math.max(1, Math.ceil(products.length / pageSize))}{search.trim() ? ` · SEARCH "${search.trim().toUpperCase()}"` : ""}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openArchive}
            className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600 transition hover:border-blue-600 hover:text-blue-700"
          >
            View Archive
          </button>
          {!showForm ? (
            <button
              type="button"
              onClick={startAdd}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              New Product
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-4">
        <label className="block">
          <span className="sr-only">Search products</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all products by name or product code…"
            className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900 md:max-w-md"
          />
        </label>
      </div>
      {error && !showForm ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5"
        >
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {editingId ? "Edit Product" : "New Product"}
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Product Code">
              <ReadOnlyValue>
                {editingProductCode ?? "Assigned on save"}
              </ReadOnlyValue>
            </Field>

            <Field label="Product Name">
              <input
                className={inputClass}
                autoFocus
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
              />
            </Field>

            <Field label="Category">
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.category_id} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Minimum Stock">
              <input
                className={inputClass}
                type="number"
                min={0}
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
              />
            </Field>

            {!editingId ? (
              <Field label="Unit of Measurement (UOM)">
                <select
                  className={inputClass}
                  value={form.uom}
                  onChange={(e) => setForm({ ...form, uom: e.target.value })}
                >
                  {uoms.map((u) => (
                    <option key={u.uom_id} value={u.code}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {!editingId ? (
              <Field label="Base Price">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.base_price}
                  onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                />
              </Field>
            ) : null}
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex gap-3">
            <button
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Product Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Min Stock</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No products found.
                </td>
              </tr>
            ) : (
              visibleProducts.map((product) => (
                <tr key={product.product_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3 font-mono text-slate-900">
                    {product.sku}
                  </td>
                  <td className="px-4 py-3">{product.name}</td>
                  <td className="px-4 py-3">
                    {categories.find((c) => c.code === product.category)?.name ??
                      product.category}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{product.min_stock}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(product)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setArchiveTarget(product)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                      >
                        {product.status === "active" ? "Archive" : "Restore"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Items per page
          <select
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setArchivePage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700"
          >
            {[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <Pagination page={activePage} total={products.length} size={pageSize} onChange={setPage} label="products" />
      </div>

      {showArchive ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowArchive(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="products-archive-title" className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="products-archive-title" className="text-xl font-semibold text-slate-900">Archived Products</h2>
                <p className="mt-1 text-sm text-slate-500">{archivedProducts.length} archived products{search.trim() ? ` matching "${search.trim()}"` : ""}</p>
              </div>
              <button type="button" onClick={() => setShowArchive(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">Close</button>
            </div>
            {archiveError ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{archiveError}</p> : null}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Product Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Min Stock</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody>
                  {archiveLoading ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading archived products…</td></tr> : archivedProducts.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No archived products found.</td></tr> : visibleArchivedProducts.map((product) => (
                    <tr key={product.product_id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono">{product.sku}</td>
                      <td className="px-4 py-3">{product.name}</td>
                      <td className="px-4 py-3">{categories.find((category) => category.code === product.category)?.name ?? product.category}</td>
                      <td className="px-4 py-3 tabular-nums">{product.min_stock}</td>
                      <td className="px-4 py-3"><button type="button" onClick={() => setArchiveTarget(product)} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Restore</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Items per page
                <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); setArchivePage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700">
                  {[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <Pagination page={currentArchivePage} total={archivedProducts.length} size={pageSize} onChange={setArchivePage} label="products" />
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={saveConfirmOpen}
        title={editingId ? "Update Product?" : "Save Product?"}
        message="Are you sure you want to save this product?"
        confirmLabel={editingId ? "Update Product" : "Save Product"}
        cancelLabel="Go back"
        busy={busy}
        onConfirm={confirmSave}
        onCancel={() => setSaveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title={
          archiveTarget?.status === "active"
            ? "Archive this product?"
            : "Restore this product?"
        }
        message={
          archiveTarget ? (
            <span>
              {archiveTarget.status === "active" ? (
                <>
                  <strong className="text-slate-900">{archiveTarget.name}</strong>{" "}
                  will be hidden from POS and the pickers. Its history is kept
                  and it can be restored later.
                </>
              ) : (
                <>
                  <strong className="text-slate-900">{archiveTarget.name}</strong>{" "}
                  will appear in POS and the pickers again.
                </>
              )}
            </span>
          ) : null
        }
        confirmLabel={
          archiveTarget?.status === "active" ? "Yes, archive" : "Yes, restore"
        }
        cancelLabel="Go back"
        tone={archiveTarget?.status === "active" ? "danger" : undefined}
        busy={busy}
        onConfirm={confirmArchiveToggle}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-600";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** Non-editable value, shaded darker than the inputs so it reads as output. */
function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-200 px-3 py-2 font-semibold text-slate-700">
      {children}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <AdminOnly>
      <ProductsPageView />
    </AdminOnly>
  );
}
