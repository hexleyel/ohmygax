"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  createSupplier,
  listSuppliers,
  updateSupplier,
  updateSupplierStatus,
} from "@/utils/api-services/supplierService";
import { listProducts } from "@/utils/api-services/productService";
import { listCategories } from "@/utils/api-services/categoryService";
import { listUoms } from "@/utils/api-services/uomService";
import AdminOnly from "@/components/AdminOnly";
import ConfirmDialog from "@/components/ConfirmDialog";

type Supplier = {
  supplier_id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string | null;
  address: string;
  status: string;
  suppliedProducts: { product_id: number; sku: string; name: string }[];
};

type Product = { product_id: number; sku: string; name: string; category: string; uom: string };
type Category = { category_id: number; code: string; name: string };
type Uom = { uom_id: number; code: string; name: string };

function isInactiveSupplier(supplier: Supplier) {
  return ["inactive", "archived"].includes((supplier.status || "").toLowerCase());
}

const emptyForm = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
};

type SupplierField = keyof typeof emptyForm;
type SupplierFieldErrors = Partial<Record<SupplierField, string>>;

function SuppliersPageView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SupplierFieldErrors>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<"active" | "inactive" | "all">("active");
  const [archiveTarget, setArchiveTarget] = useState<Supplier | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<Supplier | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [supplierData, productData, categoryData, uomData] = await Promise.all([
        listSuppliers("all"),
        listProducts(),
        listCategories(),
        listUoms(),
      ]);
      setSuppliers(supplierData);
      setProducts(productData);
      setCategories(categoryData);
      setUoms(uomData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function closeForm() {
    setForm(emptyForm);
    setSelectedProducts([]);
    setEditingId(null);
    setShowForm(false);
    setActionError("");
    setFieldErrors({});
    setExpandedCategory(null);
  }

  function validateSupplier(): SupplierFieldErrors {
    const errors: SupplierFieldErrors = {};
    const textOnly = /^[\p{L}\p{M}\s.'’-]+$/u;
    if (!form.name.trim()) errors.name = "Supplier name is required.";
    else if (!textOnly.test(form.name.trim())) errors.name = "Use letters and standard name punctuation only.";
    if (!form.contact_person.trim()) errors.contact_person = "Contact person is required.";
    else if (!textOnly.test(form.contact_person.trim())) errors.contact_person = "Use letters and standard name punctuation only.";
    if (!form.phone.trim()) errors.phone = "Phone or mobile number is required.";
    else if (!/^\d{7,15}$/.test(form.phone.trim())) errors.phone = "Enter 7 to 15 digits only.";
    if (form.email.trim() && !/^[^\s@]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(form.email.trim())) {
      errors.email = "Enter a valid email address with a domain.";
    }
    if (!form.address.trim()) errors.address = "Address is required.";
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateSupplier();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setActionError("");
    setSaveConfirmOpen(true);
  }

  function updateField(field: SupplierField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function confirmSaveSupplier() {
    setSaveBusy(true);
    setActionError("");
    try {
      if (editingId) {
        await updateSupplier(editingId, {
          ...form,
          status: suppliers.find((supplier) => supplier.supplier_id === editingId)?.status ?? "active",
          product_ids: selectedProducts,
        });
      } else {
        await createSupplier({ ...form, product_ids: selectedProducts });
      }
      setSaveConfirmOpen(false);
      closeForm();
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to save supplier");
      setSaveConfirmOpen(false);
    } finally {
      setSaveBusy(false);
    }
  }

  function startEdit(supplier: Supplier) {
    setEditingId(supplier.supplier_id);
    setForm({
      name: supplier.name,
      contact_person: supplier.contact_person,
      phone: supplier.phone,
      email: supplier.email || "",
      address: supplier.address,
    });
    setSelectedProducts(supplier.suppliedProducts.map((p) => p.product_id));
    setFieldErrors({});
    setExpandedCategory(null);
    setShowForm(true);
  }

  function toggleProduct(id: number) {
    setSelectedProducts((current) =>
      current.includes(id) ? current.filter((p) => p !== id) : [...current, id],
    );
  }

  function sizeLabel(product: Product) {
    const size = product.name.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/i)?.[0];
    if (size) return size.replace(/\s+/g, "").toLowerCase();
    const uom = uoms.find((unit) => unit.code.toLowerCase() === product.uom.toLowerCase());
    return `${uom?.code.toUpperCase() ?? product.uom.toUpperCase()} · ${product.name}`;
  }

  const visibleSuppliers = suppliers.filter((supplier) =>
    supplierFilter === "all" || (supplierFilter === "inactive"
      ? isInactiveSupplier(supplier)
      : !isInactiveSupplier(supplier)),
  );

  async function setSupplierStatus(supplier: Supplier, status: "active" | "inactive") {
    setStatusBusy(true);
    setActionError("");
    try {
      await updateSupplierStatus(supplier.supplier_id, status);
      await load();
      setArchiveTarget(null);
      setReactivateTarget(null);
      if (viewingSupplier?.supplier_id === supplier.supplier_id) setViewingSupplier(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update supplier status");
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <ConfirmDialog
        open={saveConfirmOpen}
        title={editingId ? "Update Supplier?" : "Save Supplier?"}
        message={editingId ? "Are you sure you want to update this supplier?" : "Are you sure you want to save this supplier?"}
        confirmLabel={editingId ? "Update Supplier" : "Save Supplier"}
        cancelLabel="Go back"
        busy={saveBusy}
        onConfirm={confirmSaveSupplier}
        onCancel={() => setSaveConfirmOpen(false)}
      />
      <ConfirmDialog
        open={reactivateTarget !== null}
        title="Reactivate Supplier"
        message={reactivateTarget ? (
          <span>
            Are you sure you want to reactivate <strong className="text-slate-900">{reactivateTarget.name}</strong>? This will restore them to the Active Suppliers list.
            {actionError ? <span role="alert" className="mt-2 block text-rose-600">{actionError}</span> : null}
          </span>
        ) : null}
        confirmLabel="Reactivate"
        cancelLabel="Cancel"
        busy={statusBusy}
        onConfirm={() => { if (reactivateTarget) void setSupplierStatus(reactivateTarget, "active"); }}
        onCancel={() => { if (!statusBusy) { setReactivateTarget(null); setActionError(""); } }}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
            File Maintenance
          </p>
          <h1 className="text-3xl font-semibold uppercase">Suppliers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {suppliers.filter((supplier) => !isInactiveSupplier(supplier)).length} ACTIVE SUPPLIERS
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="sr-only">Filter suppliers</span>
          <select
            value={supplierFilter}
            onChange={(event) => setSupplierFilter(event.target.value as typeof supplierFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="active">Active Suppliers</option>
            <option value="inactive">Archived / Inactive Suppliers</option>
            <option value="all">All Suppliers</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            if (showForm) {
              closeForm();
              return;
            }
            setEditingId(null);
            setForm(emptyForm);
            setSelectedProducts([]);
            setFieldErrors({});
            setExpandedCategory(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          + Add Supplier
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5"
        >
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {editingId ? "Edit Supplier" : "Add Supplier"}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <SupplierInput label="Supplier Name" required error={fieldErrors.name}>
              <input className={supplierInputClass(fieldErrors.name)} value={form.name} onChange={(e) => updateField("name", e.target.value)} />
            </SupplierInput>
            <SupplierInput label="Contact Person" required error={fieldErrors.contact_person}>
              <input className={supplierInputClass(fieldErrors.contact_person)} value={form.contact_person} onChange={(e) => updateField("contact_person", e.target.value)} />
            </SupplierInput>
            <SupplierInput label="Phone / Mobile Number" required error={fieldErrors.phone}>
              <input inputMode="numeric" placeholder="09XXXXXXXXX" className={supplierInputClass(fieldErrors.phone)} value={form.phone} onChange={(e) => updateField("phone", e.target.value.replace(/\D/g, ""))} />
            </SupplierInput>
            <SupplierInput label="Email" error={fieldErrors.email}>
              <input type="text" inputMode="email" placeholder="name@example.com" className={supplierInputClass(fieldErrors.email)} value={form.email} onChange={(e) => updateField("email", e.target.value)} />
            </SupplierInput>
            <SupplierInput label="Address" required error={fieldErrors.address} className="md:col-span-2">
              <input className={supplierInputClass(fieldErrors.address)} value={form.address} onChange={(e) => updateField("address", e.target.value)} />
            </SupplierInput>
          </div>

          <div className="mt-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">Supplied Products</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const categoryProducts = products.filter((product) => product.category === category.code);
                if (categoryProducts.length === 0) return null;
                const active = expandedCategory === category.code;
                const selectedInCategory = categoryProducts.filter((product) => selectedProducts.includes(product.product_id)).length;
                return (
                  <button
                    type="button"
                    key={category.category_id}
                    aria-expanded={active}
                    onClick={() => setExpandedCategory(active ? null : category.code)}
                    className={`rounded-xl border px-5 py-3 text-base font-bold transition ${active ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-blue-400"}`}
                  >
                    {category.name}{selectedInCategory ? ` · ${selectedInCategory} selected` : ""}
                  </button>
                );
              })}
            </div>
            {expandedCategory ? (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-600">
                  {categories.find((category) => category.code === expandedCategory)?.name} sizes / units
                </p>
                <div className="flex flex-wrap gap-2">
                  {products.filter((product) => product.category === expandedCategory).map((product) => {
                    const selected = selectedProducts.includes(product.product_id);
                    return (
                      <button
                        type="button"
                        key={product.product_id}
                        aria-pressed={selected}
                        onClick={() => toggleProduct(product.product_id)}
                        className={`rounded-lg border px-4 py-3 text-base font-bold transition ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400"}`}
                      >
                        {sizeLabel(product)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selectedProducts.length ? (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Selected supplied products">
                {products.filter((product) => selectedProducts.includes(product.product_id)).map((product) => (
                  <span key={product.product_id} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{product.sku}</span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">
              {editingId ? "Update Supplier" : "Save Supplier"}
            </button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-[#e2e8f0] px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {actionError && !archiveTarget ? (
        <p role="alert" className="mb-4 text-sm text-rose-600">{actionError}</p>
      ) : null}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : visibleSuppliers.length === 0 ? (
        <p className="text-slate-500">No suppliers found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleSuppliers.map((supplier) => (
            <div
              key={supplier.supplier_id}
              role="button"
              tabIndex={0}
              onClick={() => setViewingSupplier(supplier)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setViewingSupplier(supplier);
                }
              }}
              className="cursor-pointer rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5 transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{supplier.name}</h3>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${isInactiveSupplier(supplier) ? "bg-slate-200 text-slate-600" : "bg-emerald-500/15 text-emerald-700"}`}>
                    {(supplier.status || "active").toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); startEdit(supplier); }}
                    className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                  >
                    Edit
                  </button>
                  {isInactiveSupplier(supplier) ? (
                    <button
                      type="button"
                      disabled={statusBusy}
                      onClick={(event) => { event.stopPropagation(); setActionError(""); setReactivateTarget(supplier); }}
                      className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setActionError(""); setArchiveTarget(supplier); }}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-500">Address: {supplier.address}</p>
            </div>
          ))}
        </div>
      )}

      {viewingSupplier ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingSupplier(null); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="supplier-details-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Supplier Details</p>
            <h2 id="supplier-details-title" className="mt-1 text-2xl font-semibold text-slate-900">{viewingSupplier.name}</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail label="Contact Person" value={viewingSupplier.contact_person || "—"} />
              <Detail label="Phone Number" value={viewingSupplier.phone || "—"} />
              <Detail label="Email Address" value={viewingSupplier.email || "—"} />
              <Detail label="Address" value={viewingSupplier.address || "—"} />
            </dl>
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Supplied Products</p>
              <div className="flex flex-wrap gap-2">
                {viewingSupplier.suppliedProducts.length ? viewingSupplier.suppliedProducts.map((product) => (
                  <span key={product.product_id} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {product.name} <span className="text-blue-500">({product.sku})</span>
                  </span>
                )) : <span className="text-sm text-slate-400">No products linked.</span>}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setViewingSupplier(null)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700">Close</button>
            </div>
          </section>
        </div>
      ) : null}

      {archiveTarget ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !statusBusy) setArchiveTarget(null); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="archive-supplier-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 id="archive-supplier-title" className="text-xl font-semibold text-slate-900">Archive {archiveTarget.name}?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Are you sure you want to archive this supplier? Their purchase history and records will remain preserved.</p>
            {actionError ? <p role="alert" className="mt-3 text-sm text-rose-600">{actionError}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={statusBusy} onClick={() => setArchiveTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={statusBusy} onClick={() => void setSupplierStatus(archiveTarget, "inactive")} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{statusBusy ? "Archiving…" : "Archive"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function supplierInputClass(error?: string) {
  return `rounded-lg border bg-[#f1f5f9] px-3 py-2 outline-none focus:ring-2 ${error ? "border-red-500 focus:ring-red-100" : "border-[#e2e8f0] focus:border-blue-500 focus:ring-blue-100"}`;
}

function SupplierInput({
  label,
  required = false,
  error,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}{required ? <><span className="ml-1 text-red-600">*</span><span className="sr-only"> required</span></> : null}
      </span>
      {children}
      {error ? <span role="alert" className="text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

export default function SuppliersPage() {
  return (
    <AdminOnly>
      <SuppliersPageView />
    </AdminOnly>
  );
}
