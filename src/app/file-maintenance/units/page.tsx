"use client";

import { useEffect, useState } from "react";
import {
  createUom,
  listUoms,
  updateUom,
} from "@/utils/api-services/uomService";
import ConfirmDialog from "@/components/ConfirmDialog";
import AdminOnly from "@/components/AdminOnly";

type Uom = {
  uom_id: number;
  code: string;
  name: string;
  status: string;
  product_count: number;
};

function UnitsPageView() {
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [archivedUoms, setArchivedUoms] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<Uom | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Uom | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setUoms(await listUoms());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    listUoms()
      .then((rows) => {
        if (active) setUoms(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function startAdd() {
    setEditingId(null);
    setCode("");
    setName("");
    setError("");
    setShowForm(true);
  }

  function startEdit(uom: Uom) {
    setEditingId(uom.uom_id);
    setCode(uom.code.toUpperCase());
    setName(uom.name);
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setCode("");
    setName("");
    setError("");
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
        await updateUom(editingId, { code, name });
      } else {
        await createUom({ code, name });
      }
      setSaveConfirmOpen(false);
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save unit");
      setSaveConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function openArchive() {
    setShowArchive(true);
    setArchiveLoading(true);
    try {
      setArchivedUoms(await listUoms("archived"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archived units.");
    } finally {
      setArchiveLoading(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    if (archiveTarget.product_count > 0) {
      setError("Cannot archive: This unit of measurement is currently assigned to active products.");
      setArchiveTarget(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateUom(archiveTarget.uom_id, { status: "archived" });
      setUoms((current) => current.filter((uom) => uom.uom_id !== archiveTarget.uom_id));
      setSuccess(`${archiveTarget.code.toUpperCase()} archived successfully.`);
      setArchiveTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive unit.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return;
    setBusy(true);
    setError("");
    try {
      const restored = await updateUom(restoreTarget.uom_id, { status: "active" });
      setArchivedUoms((current) => current.filter((uom) => uom.uom_id !== restoreTarget.uom_id));
      setUoms((current) => [...current, { ...restored, product_count: restoreTarget.product_count }].sort((a, b) => a.code.localeCompare(b.code)));
      setSuccess(`${restoreTarget.code.toUpperCase()} restored successfully.`);
      setRestoreTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore unit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
            File Maintenance
          </p>
          <h1 className="text-3xl font-semibold uppercase">
            Unit of Measurement
          </h1>
          <p className="mt-1 text-sm text-slate-500">{uoms.length} UNITS</p>
        </div>
        {!showForm ? (
          <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void openArchive()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-500 hover:text-blue-700"
          >
            View Archive
          </button>
          <button
            type="button"
            onClick={startAdd}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + Add Unit
          </button>
          </div>
        ) : null}
      </div>

      {success && !showArchive ? <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</p> : null}

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5"
        >
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-600">
            {editingId ? "Edit Unit" : "New Unit"}
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Short Code
              </span>
              <input
                autoFocus={!editingId}
                placeholder="PCS"
                className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Unit Name
              </span>
              <input
                autoFocus={Boolean(editingId)}
                placeholder="Pieces"
                className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
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

      {error && !showForm ? (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : uoms.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No units yet.
                </td>
              </tr>
            ) : (
              uoms.map((uom) => (
                <tr key={uom.uom_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3 font-mono text-slate-900">{uom.code.toUpperCase()}</td>
                  <td className="px-4 py-3">{uom.name}</td>
                  <td className="px-4 py-3 tabular-nums">{uom.product_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(uom)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        title={
                          uom.product_count > 0
                            ? "Cannot archive while assigned to active products"
                            : undefined
                        }
                        onClick={() => { setSuccess(""); setError(""); setArchiveTarget(uom); }}
                        className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                      >
                        Archive
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
        title={editingId ? "Update Unit?" : "Save Unit?"}
        message="Are you sure you want to save this unit?"
        confirmLabel={editingId ? "Update Unit" : "Save Unit"}
        cancelLabel="Go back"
        busy={busy}
        onConfirm={confirmSave}
        onCancel={() => setSaveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archive Unit of Measurement?"
        message={archiveTarget ? <span>Are you sure you want to archive this unit of measurement?{archiveTarget.product_count > 0 ? <span role="alert" className="mt-2 block font-medium text-red-600">Cannot archive: This unit of measurement is currently assigned to active products.</span> : null}</span> : null}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        tone="danger"
        busy={busy}
        confirmDisabled={Boolean(archiveTarget && archiveTarget.product_count > 0)}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      {showArchive ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowArchive(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="uom-archive-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="uom-archive-title" className="text-xl font-semibold text-slate-900">Archived Units of Measurement</h2><p className="mt-1 text-sm text-slate-500">Restore a unit to return it to the active list.</p></div>
              <button type="button" onClick={() => setShowArchive(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">Close</button>
            </div>
            {success && showArchive ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</p> : null}
            {error && !archiveTarget && !restoreTarget ? <p role="alert" className="mt-4 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody>
                  {archiveLoading ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Loading archive…</td></tr> : archivedUoms.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No archived units.</td></tr> : archivedUoms.map((uom) => (
                    <tr key={uom.uom_id} className="border-t border-slate-100"><td className="px-4 py-3 font-mono">{uom.code.toUpperCase()}</td><td className="px-4 py-3">{uom.name}</td><td className="px-4 py-3 tabular-nums">{uom.product_count}</td><td className="px-4 py-3"><button type="button" disabled={busy} onClick={() => { setError(""); setRestoreTarget(uom); }} className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Restore</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={restoreTarget !== null}
        title="Restore Unit of Measurement"
        message={restoreTarget ? `Are you sure you want to restore '${restoreTarget.code.toUpperCase()}' back to the active list?` : null}
        confirmLabel="Yes, Restore"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={confirmRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

export default function UnitsPage() {
  return (
    <AdminOnly>
      <UnitsPageView />
    </AdminOnly>
  );
}
