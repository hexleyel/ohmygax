"use client";

import { useEffect, useState } from "react";
import { listProducts, updateProduct } from "@/utils/api-services/productService";
import { listWarehouseLocations } from "@/utils/api-services/warehouseLocationService";
import AdminOnly from "@/components/AdminOnly";
import ConfirmDialog from "@/components/ConfirmDialog";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  uom: string;
  stock_qty: number;
  new_stock_qty: number;
  old_stock_qty: number;
  location: string | null;
};

function WarehousePageView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [locationConfirmation, setLocationConfirmation] = useState<{ product: Product; location: string } | null>(null);
  const [locationSubmitting, setLocationSubmitting] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [transferConfirmation, setTransferConfirmation] = useState<{ product: Product; quantity: number } | null>(null);
  const [transferQuantity, setTransferQuantity] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  async function load() {
    const [nextProducts, nextLocations] = await Promise.all([
      listProducts(),
      listWarehouseLocations(),
    ]);
    setProducts(nextProducts);
    setLocationOptions(nextLocations);
  }

  useEffect(() => {
    load();
  }, []);

  function requestLocationSave(product: Product) {
    setLocationError("");
    setLocationConfirmation({ product, location: locationDraft.trim() });
  }

  async function confirmLocationSave() {
    if (!locationConfirmation) return;
    setLocationSubmitting(true);
    setLocationError("");
    try {
      await updateProduct(locationConfirmation.product.product_id, { location: locationConfirmation.location });
      setLocationConfirmation(null);
      setEditingId(null);
      await load();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Failed to update location.");
      setLocationConfirmation(null);
    } finally {
      setLocationSubmitting(false);
    }
  }

  function requestStockTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingProduct) return;
    const quantity = Number(transferQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > adjustingProduct.new_stock_qty) {
      setTransferError(`Enter a whole number from 1 to ${adjustingProduct.new_stock_qty}.`);
      return;
    }

    setTransferConfirmation({ product: adjustingProduct, quantity });
  }

  async function confirmStockTransfer() {
    if (!transferConfirmation) return;
    const { product, quantity } = transferConfirmation;
    setTransferSubmitting(true);
    setTransferError("");
    try {
      const response = await fetch(`/api/inventory/${product.product_id}/transfer-to-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to transfer stock.");
      setTransferConfirmation(null);
      setAdjustingProduct(null);
      setTransferQuantity("");
      await load();
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : "Failed to transfer stock.");
      setTransferConfirmation(null);
    } finally {
      setTransferSubmitting(false);
    }
  }

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const key = p.location || "UNASSIGNED";
    acc[key] = acc[key] || [];
    acc[key].push(p);
    return acc;
  }, {});

  const filteredEntries = Object.entries(grouped).filter(
    ([location, items]) =>
      !search ||
      location.toLowerCase().includes(search.toLowerCase()) ||
      items.some((p) => p.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Inventory</p>
        <h1 className="text-3xl font-semibold uppercase">Warehouse</h1>
      </div>

      <input
        className="mb-4 w-full max-w-sm rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 py-2 text-sm"
        placeholder="Search by location or product name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {locationError ? <p className="mb-3 text-sm text-red-600">{locationError}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="w-full min-w-[1050px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[25%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[33%]" />
          </colgroup>
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3 text-center">Current Stock</th>
              <th className="px-4 py-3 text-center">Reserve Stock</th>
              <th className="py-3 pl-8 pr-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map(([location, items]) =>
              items.map((product, idx) => (
                <tr key={product.product_id} className="border-t border-[#e2e8f0]">
                  {idx === 0 ? (
                    <td className="px-4 py-3 font-semibold" rowSpan={items.length}>
                      {location}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">{product.name}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{product.old_stock_qty}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{product.new_stock_qty}</td>
                  <td className="py-3 pl-8 pr-5 text-right">
                    <div className="ml-auto flex min-h-9 w-fit max-w-full items-center justify-end gap-2 whitespace-nowrap">
                      {editingId === product.product_id ? (
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          autoFocus
                          list="warehouse-location-options"
                          maxLength={80}
                          placeholder="Search or enter a rack / bin"
                          className="min-w-0 flex-1 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-2 py-1 text-xs"
                          value={locationDraft}
                          onChange={(e) => setLocationDraft(e.target.value.toUpperCase())}
                        />
                        <button
                          type="button"
                          onClick={() => requestLocationSave(product)}
                          className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setLocationDraft("");
                            setLocationError("");
                          }}
                          className="shrink-0 rounded-md border border-[#e2e8f0] px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400"
                        >
                          Cancel
                        </button>
                        </div>
                      ) : (
                        <button
                        type="button"
                        onClick={() => {
                          setEditingId(product.product_id);
                          setLocationDraft(product.location || "");
                        }}
                        className="w-[82px] shrink-0 rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                      >
                        Transfer
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTransferError("");
                          setTransferQuantity("");
                          setAdjustingProduct(product);
                        }}
                        className="w-[105px] shrink-0 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Release Stock
                      </button>
                    </div>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      <datalist id="warehouse-location-options">
        {locationOptions.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>

      {adjustingProduct ? (() => {
        const quantity = Number(transferQuantity);
        const validQuantity = Number.isInteger(quantity) && quantity >= 0 && quantity <= adjustingProduct.new_stock_qty;
        const resultingActive = adjustingProduct.old_stock_qty + (validQuantity ? quantity : 0);
        const resultingReserve = adjustingProduct.new_stock_qty - (validQuantity ? quantity : 0);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="warehouse-adjust-title"
              onSubmit={requestStockTransfer}
              className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Warehouse</p>
              <h2 id="warehouse-adjust-title" className="mb-5 text-xl font-semibold">Release Reserve Stock to Current Stock</h2>

              <dl className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                <dt className="text-slate-500">Target Active Inventory</dt>
                <dd className="text-right font-medium">{adjustingProduct.location || "UNASSIGNED"}</dd>
                <dt className="text-slate-500">Product Name</dt>
                <dd className="text-right font-medium">{adjustingProduct.name}</dd>
                <dt className="text-slate-500">Available Current Stock</dt>
                <dd className="text-right font-medium">{adjustingProduct.old_stock_qty}</dd>
                <dt className="text-slate-500">Available Reserve Stock</dt>
                <dd className="text-right font-medium">{adjustingProduct.new_stock_qty}</dd>
              </dl>

              <label htmlFor="warehouse-transfer-quantity" className="mb-1 block text-sm font-medium text-slate-700">
                Quantity to Add to Active
              </label>
              <input
                id="warehouse-transfer-quantity"
                type="number"
                min="1"
                max={adjustingProduct.new_stock_qty}
                step="1"
                placeholder="0"
                value={transferQuantity}
                onChange={(event) => setTransferQuantity(event.target.value)}
                className="mb-3 w-full [appearance:textfield] rounded-lg border border-[#e2e8f0] px-3 py-2 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-4 text-sm">
                <span className="text-slate-500">Adjusted Current Stock</span>
                <span className="text-right font-semibold">{resultingActive}</span>
                <span className="text-slate-500">Adjusted Reserve Stock</span>
                <span className="text-right font-semibold">{resultingReserve}</span>
              </div>

              {transferError ? <p className="mb-4 text-sm text-red-600">{transferError}</p> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={transferSubmitting}
                  onClick={() => setAdjustingProduct(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferSubmitting || !validQuantity || quantity < 1}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {transferSubmitting ? "Transferring…" : "Confirm Transfer"}
                </button>
              </div>
            </form>
          </div>
        );
      })() : null}

      <ConfirmDialog
        open={Boolean(locationConfirmation)}
        title="Confirm Location Update"
        message={locationConfirmation ? `Are you sure you want to update the location of ${locationConfirmation.product.name} to ${locationConfirmation.location || "Unassigned"}?` : null}
        confirmLabel="Save Location"
        cancelLabel="Cancel"
        busy={locationSubmitting}
        onConfirm={confirmLocationSave}
        onCancel={() => setLocationConfirmation(null)}
      />

      <ConfirmDialog
        open={Boolean(transferConfirmation)}
        title="Confirm Stock Release"
        message={transferConfirmation ? `Are you sure you want to release ${transferConfirmation.quantity} ${transferConfirmation.product.uom.toUpperCase()} of ${transferConfirmation.product.name} from Reserve Stock to Current Stock?` : null}
        confirmLabel="Confirm Transfer"
        cancelLabel="Cancel"
        busy={transferSubmitting}
        onConfirm={confirmStockTransfer}
        onCancel={() => setTransferConfirmation(null)}
      />
    </div>
  );
}

export default function WarehousePage() {
  return (
    <AdminOnly>
      <WarehousePageView />
    </AdminOnly>
  );
}
