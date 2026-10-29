"use client";

import { useEffect, useState } from "react";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
} from "@/utils/api-services/customerService";
import ConfirmDialog from "@/components/ConfirmDialog";

type Customer = {
  customer_id: number;
  name: string;
  phone: string;
  address: string;
  address_secondary: string | null;
  email: string | null;
  notes: string | null;
  type: string;
  deliveryCount: number;
  activeDeliveryCount: number;
  totalSpent: number;
};

const emptyForm = { name: "", phone: "", address: "", address_secondary: "", email: "", notes: "" };
const CUSTOMER_NAME_PATTERN = /^[\p{L}\s.-]+$/u;
const CUSTOMER_PHONE_PATTERN = /^\+?\d{10,11}$/;
const CUSTOMER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return `${value.trimStart().startsWith("+") ? "+" : ""}${digits}`.slice(0, 12);
}

const TYPE_STYLES: Record<string, string> = {
  new: "bg-slate-500/15 text-slate-500",
  regular: "bg-sky-500/15 text-sky-700",
  loyal: "bg-purple-500/15 text-purple-700",
  vip: "bg-blue-600/15 text-blue-700",
  bulk: "bg-emerald-500/15 text-emerald-700",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({ name: false, phone: false, address: false, email: false });

  async function load() {
    setLoading(true);
    try {
      setCustomers(await listCustomers());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function closeForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
    setTouched({ name: false, phone: false, address: false, email: false });
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.customer_id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      address_secondary: customer.address_secondary || "",
      email: customer.email || "",
      notes: customer.notes || "",
    });
    setTouched({ name: false, phone: false, address: false, email: false });
    setShowForm(true);
  }

  const nameValue = form.name.trim();
  const phoneValue = form.phone.trim();
  const addressValue = form.address.trim();
  const emailValue = form.email.trim();
  const fieldErrors = {
    name: !nameValue
      ? "Name is required."
      : !CUSTOMER_NAME_PATTERN.test(nameValue) || !/\p{L}/u.test(nameValue)
        ? "Use letters, spaces, hyphens, and periods only."
        : "",
    phone: !phoneValue
      ? "Phone is required."
      : !CUSTOMER_PHONE_PATTERN.test(phoneValue)
        ? "Enter 10 or 11 digits, with an optional + prefix."
        : "",
    address: !addressValue ? "Primary address is required." : "",
    email: emailValue && !CUSTOMER_EMAIL_PATTERN.test(emailValue)
      ? "Enter a valid email address, such as user@example.com."
      : "",
  };
  const canSave = !fieldErrors.name && !fieldErrors.phone && !fieldErrors.address && !fieldErrors.email;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!canSave) {
      setTouched({ name: true, phone: true, address: true, email: true });
      return;
    }
    setSaveConfirmOpen(true);
  }

  async function confirmSaveCustomer() {
    setSaving(true);
    setError("");
    try {
      const customerData = {
        ...form,
        name: nameValue,
        phone: phoneValue,
        address: addressValue,
        address_secondary: form.address_secondary.trim(),
        email: emailValue,
        notes: form.notes.trim(),
      };
      if (editingId) {
        await updateCustomer(editingId, customerData);
      } else {
        await createCustomer(customerData);
      }
      setSaveConfirmOpen(false);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save customer");
      setSaveConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await deleteCustomer(deleteTarget.customer_id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete customer");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const vipCount = customers.filter((c) => c.type === "vip").length;
  const bulkCount = customers.filter((c) => c.type === "bulk").length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Delivery</p>
          <h1 className="text-3xl font-semibold uppercase">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {customers.length} CUSTOMERS · {vipCount} VIP · {bulkCount} BULK
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showForm) {
              closeForm();
              return;
            }
            setEditingId(null);
            setForm(emptyForm);
            setError("");
            setShowForm(true);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          New Customer
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label htmlFor="customer-name" className="block text-sm font-medium text-gray-700">
              <span className="mb-1 block">Name <span className="text-red-500">*</span></span>
              <input
                id="customer-name"
                required
                autoComplete="name"
                aria-invalid={Boolean(touched.name && fieldErrors.name)}
                aria-describedby={touched.name && fieldErrors.name ? "customer-name-error" : undefined}
                className={`w-full rounded-lg border bg-[#f1f5f9] px-3 py-2 ${touched.name && fieldErrors.name ? "border-red-400" : "border-[#e2e8f0]"}`}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onBlur={() => setTouched((current) => ({ ...current, name: true }))}
              />
              {touched.name && fieldErrors.name ? <span id="customer-name-error" className="mt-1 block text-xs text-red-600">{fieldErrors.name}</span> : null}
            </label>
            <label htmlFor="customer-phone" className="block text-sm font-medium text-gray-700">
              <span className="mb-1 block">Phone <span className="text-red-500">*</span></span>
              <input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                maxLength={12}
                aria-invalid={Boolean(touched.phone && fieldErrors.phone)}
                aria-describedby={touched.phone && fieldErrors.phone ? "customer-phone-error" : undefined}
                className={`w-full rounded-lg border bg-[#f1f5f9] px-3 py-2 ${touched.phone && fieldErrors.phone ? "border-red-400" : "border-[#e2e8f0]"}`}
                placeholder="e.g. 09123456789"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: sanitizePhone(e.target.value) })}
                onBlur={() => setTouched((current) => ({ ...current, phone: true }))}
              />
              {touched.phone && fieldErrors.phone ? <span id="customer-phone-error" className="mt-1 block text-xs text-red-600">{fieldErrors.phone}</span> : null}
            </label>
            <label htmlFor="customer-address" className="block text-sm font-medium text-gray-700 md:col-span-2">
              <span className="mb-1 block">Primary Address <span className="text-red-500">*</span></span>
              <input
                id="customer-address"
                required
                autoComplete="street-address"
                aria-invalid={Boolean(touched.address && fieldErrors.address)}
                aria-describedby={touched.address && fieldErrors.address ? "customer-address-error" : undefined}
                className={`w-full rounded-lg border bg-[#f1f5f9] px-3 py-2 ${touched.address && fieldErrors.address ? "border-red-400" : "border-[#e2e8f0]"}`}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                onBlur={() => setTouched((current) => ({ ...current, address: true }))}
              />
              {touched.address && fieldErrors.address ? <span id="customer-address-error" className="mt-1 block text-xs text-red-600">{fieldErrors.address}</span> : null}
            </label>
            <label htmlFor="customer-email" className="block text-sm font-medium text-gray-700">
              <span className="mb-1 block">Email <span className="font-normal text-gray-500">(optional)</span></span>
              <input
                id="customer-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(touched.email && fieldErrors.email)}
                aria-describedby={touched.email && fieldErrors.email ? "customer-email-error" : undefined}
                className={`w-full rounded-lg border bg-[#f1f5f9] px-3 py-2 ${touched.email && fieldErrors.email ? "border-red-400" : "border-[#e2e8f0]"}`}
                placeholder="name@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onBlur={() => setTouched((current) => ({ ...current, email: true }))}
              />
              {touched.email && fieldErrors.email ? <span id="customer-email-error" className="mt-1 block text-xs text-red-600">{fieldErrors.email}</span> : null}
            </label>
            <label htmlFor="customer-address-secondary" className="block text-sm font-medium text-gray-700 md:col-span-2">
              <span className="mb-1 block">Secondary Address <span className="font-normal text-gray-500">(optional)</span></span>
              <input
                id="customer-address-secondary"
                autoComplete="address-line2"
                className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
                value={form.address_secondary}
                onChange={(e) => setForm({ ...form, address_secondary: e.target.value })}
              />
            </label>
            <label htmlFor="customer-notes" className="block text-sm font-medium text-gray-700 md:col-span-2">
              <span className="mb-1 block">Notes <span className="font-normal text-gray-500">(optional)</span></span>
              <input
                id="customer-notes"
                className="w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" disabled={!canSave || saving} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {editingId ? "Update Customer" : "Save Customer"}
            </button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-[#e2e8f0] px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Deliveries</th>
              <th className="px-4 py-3">Total Spent</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.customer_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3">
                    <p>{customer.name}</p>
                    {customer.notes ? (
                      <p className="text-xs text-slate-500">{customer.notes}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{customer.phone}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-900">{customer.address}</p>
                    {customer.address_secondary ? (
                      <p className="text-xs text-slate-500">
                        Alt: {customer.address_secondary}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLES[customer.type]}`}
                    >
                      {customer.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {customer.deliveryCount} total
                    {customer.activeDeliveryCount > 0 ? (
                      <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {customer.activeDeliveryCount} ACTIVE
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">₱{Number(customer.totalSpent).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(customer)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(customer)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-red-500 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={saveConfirmOpen}
        title={editingId ? "Update Customer?" : "Save Customer?"}
        message={editingId ? "Are you sure you want to update this customer?" : "Are you sure you want to save this customer?"}
        confirmLabel={editingId ? "Update Customer" : "Save Customer"}
        cancelLabel="Go back"
        busy={saving}
        onConfirm={confirmSaveCustomer}
        onCancel={() => setSaveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this customer?"
        message={
          deleteTarget ? (
            <span>
              <strong className="text-slate-900">{deleteTarget.name}</strong> will
              be removed permanently. Customers with delivery history can&apos;t be
              deleted — edit them instead.
            </span>
          ) : null
        }
        confirmLabel="Yes, delete"
        cancelLabel="Keep customer"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
