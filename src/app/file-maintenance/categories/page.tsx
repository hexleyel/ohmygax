"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createCategory,
  listCategories,
  updateCategory,
} from "@/utils/api-services/categoryService";
import ConfirmDialog from "@/components/ConfirmDialog";
import AdminOnly from "@/components/AdminOnly";

type Category = {
  category_id: number;
  code: string;
  name: string;
  is_cylinder: boolean;
  isArchived: boolean;
  status: string;
  product_count: number;
};

function CategoriesPageView() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [archivedCategories, setArchivedCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [isCylinder, setIsCylinder] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [restoreBusyId, setRestoreBusyId] = useState<number | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setCategories(await listCategories());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    listCategories()
      .then((rows) => { if (active) setCategories(rows); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function clearForm() {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setIsCylinder(false);
    setError("");
  }

  function startAdd() {
    setEditingId(null);
    setName("");
    setIsCylinder(false);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function startEdit(category: Category) {
    setEditingId(category.category_id);
    setName(category.name);
    setIsCylinder(category.is_cylinder);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || saveConfirmOpen) return;
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    setError("");
    setSaveConfirmOpen(true);
  }

  async function confirmSave() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const data = {
        name: name.trim(),
        isCylinder: Boolean(isCylinder),
      };
      if (editingId) await updateCategory(editingId, data);
      else await createCategory(data);
      const successMessage = editingId ? "Category updated successfully." : "Category created successfully.";
      setSaveConfirmOpen(false);
      clearForm();
      await load();
      setSuccess(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
      setSaveConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function openArchive() {
    setShowArchive(true);
    setArchiveError("");
    setArchiveLoading(true);
    try {
      setArchivedCategories(await listCategories({ status: "archived" }));
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Failed to load archived categories");
    } finally {
      setArchiveLoading(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    if (archiveTarget.product_count > 0) {
      setArchiveError("Cannot archive: Category contains active products.");
      return;
    }
    setArchiveBusy(true);
    setArchiveError("");
    try {
      await updateCategory(archiveTarget.category_id, { status: "archived" });
      await load();
      setArchiveTarget(null);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Failed to archive category");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function confirmRestoreCategory() {
    if (!restoreTarget) return;
    const category = restoreTarget;
    setRestoreBusyId(category.category_id);
    setArchiveError("");
    try {
      await updateCategory(category.category_id, { status: "active" });
      setArchivedCategories((current) => current.filter((row) => row.category_id !== category.category_id));
      await load();
      setSuccess(`${category.name} restored successfully.`);
      setRestoreTarget(null);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Failed to restore category");
    } finally {
      setRestoreBusyId(null);
    }
  }

  const filteredCategories = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? categories.filter((category) => category.name.toLocaleLowerCase().includes(term)) : categories;
  }, [categories, search]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">File Maintenance</p>
          <h1 className="text-3xl font-semibold uppercase">Categories</h1>
          <p className="mt-1 text-sm text-slate-500">{categories.length} ACTIVE CATEGORIES</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void openArchive()} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-500 hover:text-blue-700">
            View Archive
          </button>
          <button type="button" onClick={() => showForm ? clearForm() : startAdd()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            {showForm ? "Close Form" : "New Category"}
          </button>
        </div>
      </div>

      {success && !showArchive ? <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</p> : null}

      {showForm ? (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-[#e2e8f0] bg-white p-5">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">{editingId ? "Edit Category" : "New Category"}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category Name</span>
              <input autoFocus required className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="grid gap-3 self-end">
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[#e2e8f0] px-3 py-2">
                <input type="checkbox" checked={isCylinder} onChange={(event) => setIsCylinder(event.target.checked)} />
                <span className="text-sm font-medium">Is Cylinder Category</span>
              </label>
            </div>
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-4 flex gap-3">
            <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={clearForm} className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600">Cancel</button>
          </div>
        </form>
      ) : null}

      {!showForm && error ? <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</p> : null}

      <label className="mb-4 block max-w-md">
        <span className="sr-only">Search categories</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories by name..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </label>

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Category Name</th>
              <th className="px-4 py-3 text-center">Cylinder</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : filteredCategories.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">{search ? "No matching categories." : "No categories yet."}</td></tr>
            ) : filteredCategories.map((category) => (
              <tr key={category.category_id} className="border-t border-[#e2e8f0]">
                <td className="px-4 py-3 font-medium">{category.name}</td>
                <td className="px-4 py-3 text-center"><BooleanBadge value={category.is_cylinder} /></td>
                <td className="px-4 py-3 tabular-nums">{category.product_count}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEdit(category)} className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700">Edit</button>
                    <button type="button" onClick={() => { setArchiveTarget(category); setArchiveError(""); }} className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50">Archive</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={saveConfirmOpen}
        title={editingId ? "Update Category?" : "Save Category?"}
        message={`Are you sure you want to ${editingId ? "update" : "save"} this category?`}
        confirmLabel={editingId ? "Update Category" : "Save Category"}
        cancelLabel="Go back"
        busy={busy}
        onConfirm={confirmSave}
        onCancel={() => setSaveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive Category?"
        message={archiveTarget ? (
          <span>
            Are you sure you want to archive <strong className="text-slate-900">{archiveTarget.name}</strong>?
            {archiveTarget.product_count > 0 ? <span role="alert" className="mt-2 block font-medium text-red-600">Cannot archive: Category contains active products.</span> : null}
            {archiveError ? <span role="alert" className="mt-2 block text-red-600">{archiveError}</span> : null}
          </span>
        ) : null}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        tone="danger"
        busy={archiveBusy}
        confirmDisabled={Boolean(archiveTarget && archiveTarget.product_count > 0)}
        onConfirm={confirmArchive}
        onCancel={() => { if (!archiveBusy) setArchiveTarget(null); }}
      />

      {showArchive ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !restoreBusyId) setShowArchive(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="category-archive-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="category-archive-title" className="text-xl font-semibold text-slate-900">Archived Categories</h2><p className="mt-1 text-sm text-slate-500">Restore an archived category to return it to the active list.</p></div>
              <button type="button" onClick={() => setShowArchive(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">Close</button>
            </div>
            {success && showArchive ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</p> : null}
            {archiveError && !archiveTarget ? <p role="alert" className="mt-4 text-sm text-red-600">{archiveError}</p> : null}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Category Name</th><th className="px-4 py-3 text-center">Cylinder</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Action</th></tr></thead>
                <tbody>
                  {archiveLoading ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Loading archive…</td></tr> : archivedCategories.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No archived categories.</td></tr> : archivedCategories.map((category) => (
                    <tr key={category.category_id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-900">{category.name}</td>
                      <td className="px-4 py-3 text-center"><BooleanBadge value={category.is_cylinder} /></td>
                      <td className="px-4 py-3 tabular-nums">{category.product_count}</td>
                      <td className="px-4 py-3"><button type="button" disabled={restoreBusyId === category.category_id} onClick={() => { setArchiveError(""); setRestoreTarget(category); }} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Restore</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={restoreTarget !== null}
        title="Restore Category"
        message={restoreTarget ? `Are you sure you want to restore '${restoreTarget.name}' back to the active list?` : null}
        confirmLabel="Yes, Restore"
        cancelLabel="Cancel"
        busy={restoreBusyId !== null}
        onConfirm={confirmRestoreCategory}
        onCancel={() => { if (restoreBusyId === null) setRestoreTarget(null); }}
      />
    </div>
  );
}

function BooleanBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700">YES</span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">NO</span>
  );
}

export default function CategoriesPage() {
  return <AdminOnly><CategoriesPageView /></AdminOnly>;
}
