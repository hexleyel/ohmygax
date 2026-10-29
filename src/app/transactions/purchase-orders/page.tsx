"use client";

import { useEffect, useState } from "react";
import { listSuppliers } from "@/utils/api-services/supplierService";
import { listProducts } from "@/utils/api-services/productService";
import { listCategories } from "@/utils/api-services/categoryService";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  listPurchaseOrders,
} from "@/utils/api-services/purchaseOrderService";
import ConfirmDialog from "@/components/ConfirmDialog";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";
import AdminOnly from "@/components/AdminOnly";
import {
  PURCHASE_ORDER_STATUS_FILTERS,
  PurchaseOrderStatusBadge,
  PurchaseOrderStatusTabs,
  type PurchaseOrderStatusCounts,
  type PurchaseOrderStatusFilter,
} from "@/components/PurchaseOrderStatus";
import { useSession } from "@/context/SessionContext";
import { peso } from "@/lib/format";

type Line = {
  product_id: number;
  product_code: string;
  product_family: ProductFamily | "";
  product_search: string;
  category_code: string;
  category_search: string;
  variant_search: string;
  quantity: string;
  unit_cost: string;
};

type ProductFamily = string;

type Supplier = {
  supplier_id: number;
  name: string;
  suppliedProducts: { product_id: number }[];
};

type Product = {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  uom: string;
  last_unit_cost: number | null;
  base_price: number;
};

type Category = { category_id: number; code: string; name: string; is_cylinder?: boolean };

type PO = {
  po_id: number;
  reference_no: string | null;
  status: string;
  total_amount: number;
  order_date: string;
  estimated_delivery: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  supplier: { name: string };
  createdBy: { full_name: string; role: string } | null;
  items: {
    id: number;
    product: { name: string; sku: string };
    quantity: number;
    unit_cost: number;
  }[];
};

type ConfirmationLine = Line & { item_id: number };

const PAGE_SIZE = 5;

const emptyLine: Line = {
  product_id: 0,
  product_code: "",
  product_family: "",
  product_search: "",
  category_code: "",
  category_search: "",
  variant_search: "",
  quantity: "1",
  unit_cost: "",
};

function formatDeliveryDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

function PurchaseOrdersPageView() {
  const { user } = useSession();
  const [orders, setOrders] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [activeProductLine, setActiveProductLine] = useState<number | null>(null);
  const [activeCategoryLine, setActiveCategoryLine] = useState<number | null>(null);
  const [activeUomLine, setActiveUomLine] = useState<number | null>(null);
  const [viewing, setViewing] = useState<PO | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<PurchaseOrderStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<PO | null>(null);
  const [confirmLines, setConfirmLines] = useState<ConfirmationLine[]>([]);
  const [activeConfirmDropdown, setActiveConfirmDropdown] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PO | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [poData, supplierData, productData, categoryData] = await Promise.all([
      listPurchaseOrders({ all: "1" }),
      listSuppliers(),
      listProducts({ all: "1" }),
      listCategories(),
    ]);
    setOrders(poData);
    setSuppliers(supplierData);
    setProducts(productData);
    setCategories(categoryData.filter((category: Category & { status?: string }) => !category.status || category.status === "active"));
  }

  // The results are dropped if the filter changed again before they arrived,
  // so a fast switch can't leave the previous filter's rows on screen.
  useEffect(() => {
    let active = true;
    Promise.all([
      listPurchaseOrders({ all: "1" }),
      listSuppliers(),
      listProducts({ all: "1" }),
      listCategories(),
    ]).then(([poData, supplierData, productData, categoryData]) => {
      if (!active) return;
      setOrders(poData);
      setSuppliers(supplierData);
      setProducts(productData);
      setCategories(categoryData.filter((category: Category & { status?: string }) => !category.status || category.status === "active"));
      setPage(1);
    });
    return () => {
      active = false;
    };
  }, [statusFilter]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function productFamily(product: Product): ProductFamily | null {
    if (product.category === "cylinder") return "LPG";
    if (/regulator/i.test(product.name)) return "Regulator";
    if (/hose/i.test(product.name)) return "Hose";
    return categories.find((category) => category.code === product.category)?.name ?? product.category;
  }

  function baseProductLabel(product: Product) {
    const category = categories.find((row) => row.code === product.category);
    if (category?.is_cylinder || product.category.toLocaleLowerCase() === "cylinder") return "LPG";
    if (/regulator/i.test(product.name)) return "Regulator";
    if (/hose/i.test(product.name)) return "Hose";
    const normalizedName = product.name
      .replace(/^(?:set|kit)\s*[-:]\s*/i, "")
      .replace(/\s+\d+(?:\.\d+)?\s*(?:kg|g|ml|l|m|inches?|burners?)\b.*$/i, "")
      .trim();
    return normalizedName || product.name;
  }

  function selectCategory(index: number, categoryCode: string) {
    const category = categories.find((row) => row.code === categoryCode);
    updateLine(index, {
      product_id: 0,
      product_code: "",
      product_family: "",
      product_search: "",
      category_code: categoryCode,
      category_search: category?.name ?? categoryCode,
      variant_search: "",
      unit_cost: "",
    });
    setActiveCategoryLine(null);
    setActiveUomLine(index);
  }

  function selectBaseProduct(index: number, baseLabel: string) {
    const product = supplierProducts.find((candidate) => baseProductLabel(candidate) === baseLabel);
    const category = product ? categories.find((row) => row.code === product.category) : undefined;
    updateLine(index, {
      product_id: 0,
      product_code: "",
      product_family: product ? productFamily(product) ?? "" : "",
      product_search: baseLabel,
      category_code: product?.category ?? "",
      category_search: category?.name ?? (product?.category === "cylinder" ? "Cylinder" : product ? "Accessory" : ""),
      variant_search: "",
      unit_cost: "",
    });
    setActiveProductLine(null);
    setActiveUomLine(product ? index : null);
  }

  function productVariantLabel(product: Product) {
    const size = product.name.match(/\d+(?:\.\d+)?\s*(?:kg|m)\b/i)?.[0];
    if (size) return size.replace(/\s+/g, "").toLowerCase();
    if (product.category === "cylinder" && product.name.trim().toLowerCase() === "lpg") {
      return "Cylinder";
    }
    const unit = product.uom.toLowerCase() === "pcs" ? "Pcs" : product.uom;
    return unit;
  }

  function selectedVariantLabel(product: Product) {
    return productVariantLabel(product);
  }

  function selectProduct(index: number, productId: number) {
    setDuplicateWarning("");

    if (productId > 0) {
      const alreadyOn = lines.some(
        (line, i) => i !== index && line.product_id === productId,
      );
      if (alreadyOn) {
        const product = products.find((p) => p.product_id === productId);
        setDuplicateWarning(
          `${product?.name ?? "That product"} is already on this order.`,
        );
        return;
      }
    }

    const product = products.find((p) => p.product_id === productId);
    const family = product ? productFamily(product) : null;
    const category = product ? categories.find((row) => row.code === product.category) : null;
    updateLine(index, {
      product_id: productId,
      product_code: product?.sku ?? "",
      product_family: family ?? "",
      product_search: product ? baseProductLabel(product) : "",
      category_code: product?.category ?? "",
      category_search: category?.name ?? (product?.category === "cylinder" ? "Cylinder" : product ? "Accessory" : ""),
      variant_search: product ? selectedVariantLabel(product) : "",
      unit_cost:
        productId > 0 && product && Number(product.base_price) > 0
          ? Number(product.base_price).toFixed(2)
          : "",
    });
    setActiveUomLine(null);
  }

  function removeLine(index: number) {
    setDuplicateWarning("");
    setLines((current) =>
      current.length === 1
        ? [{ ...emptyLine }]
        : current.filter((_, i) => i !== index),
    );
  }

  const filledLines = lines.filter((l) => l.product_id > 0);
  const productFamilies = Array.from(new Set(products.map(productFamily).filter((family): family is string => Boolean(family))));
  const selectedSupplier = suppliers.find((supplier) => String(supplier.supplier_id) === supplierId);
  const supplierProductIds = new Set((selectedSupplier?.suppliedProducts ?? []).map((product) => product.product_id));
  const supplierProducts = products.filter((product) => supplierProductIds.has(product.product_id));

  const poTotal = lines.reduce(
    (sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_cost || 0),
    0,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!supplierId) {
      setError("Choose a supplier first.");
      return;
    }
    if (filledLines.length === 0) {
      setError("Add at least one product.");
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmCreate() {
    setError("");
    setSaving(true);
    try {
      await createPurchaseOrder({
        supplier_id: Number(supplierId),
        estimated_delivery: estimatedDeliveryDate,
        items: filledLines.map((l) => ({
          product_id: l.product_id,
          product_code: l.product_code,
          quantity: Number(l.quantity || 0),
          unit_cost: Number(l.unit_cost || 0),
        })),
      });
      setShowForm(false);
      setSupplierId("");
      setEstimatedDeliveryDate("");
      setLines([{ ...emptyLine }]);
      setConfirmOpen(false);
      load();
    } catch (err) {
      console.error("CREATE_PURCHASE_ORDER_SUBMIT_ERROR:", err);
      setError(err instanceof Error ? err.message : String(err) || "Failed to create PO");
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await cancelPurchaseOrder(cancelTarget.po_id);
      setCancelTarget(null);
      setViewing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel PO");
      setCancelTarget(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmOrder() {
    if (!confirmTarget) return;
    const items = confirmLines.map((line) => ({
      item_id: line.item_id,
      product_id: line.product_id,
      quantity: Number(line.quantity),
      unit_cost: Number(line.unit_cost),
    }));
    if (!items.length || items.some((item) => !item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0)) {
      setError("Keep at least one item and enter a product, positive whole-number quantity, and valid unit price for each item.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await confirmPurchaseOrder(confirmTarget.po_id, items);
      setConfirmTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm PO");
    } finally {
      setSaving(false);
    }
  }

  function openOrderConfirmation(order: PO) {
    setError("");
    setConfirmLines(order.items.map((item) => {
      const product = products.find((row) => row.sku === item.product.sku);
      const family = product ? productFamily(product) ?? "" : "";
      const category = product ? categories.find((row) => row.code === product.category) : undefined;
      return {
        ...emptyLine,
        item_id: item.id,
        product_id: product?.product_id ?? 0,
        product_code: product?.sku ?? item.product.sku,
        product_family: family,
        product_search: family,
        category_code: product?.category ?? "",
        category_search: category?.name ?? "",
        variant_search: product ? productVariantLabel(product) : item.product.name,
        quantity: String(item.quantity),
        unit_cost: String(item.unit_cost),
      };
    }));
    setActiveConfirmDropdown(null);
    setConfirmTarget(order);
  }

  function updateConfirmationLine(itemId: number, patch: Partial<ConfirmationLine>) {
    setConfirmLines((current) => current.map((line) => line.item_id === itemId ? { ...line, ...patch } : line));
  }

  function selectConfirmationFamily(itemId: number, family: ProductFamily) {
    const product = products.find((row) => productFamily(row) === family);
    const category = categories.find((row) => row.code === product?.category);
    updateConfirmationLine(itemId, {
      product_id: 0, product_code: "", product_family: family, product_search: family,
      category_code: product?.category ?? "", category_search: category?.name ?? (product?.category === "cylinder" ? "Cylinder" : "Accessory"),
      variant_search: "", unit_cost: "",
    });
    setActiveConfirmDropdown(null);
  }

  function selectConfirmationCategory(itemId: number, categoryCode: string) {
    const category = categories.find((row) => row.code === categoryCode);
    updateConfirmationLine(itemId, {
      product_id: 0, product_code: "", product_family: "", product_search: "",
      category_code: categoryCode, category_search: category?.name ?? categoryCode,
      variant_search: "", unit_cost: "",
    });
    setActiveConfirmDropdown(null);
  }

  function selectConfirmationProduct(itemId: number, product: Product) {
    updateConfirmationLine(itemId, {
      product_id: product.product_id, product_code: product.sku,
      variant_search: productVariantLabel(product),
      unit_cost: Number(product.last_unit_cost ?? product.base_price).toFixed(2),
    });
    setActiveConfirmDropdown(null);
  }

  const confirmationTotal = confirmLines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const unitCost = Number(line.unit_cost);
    return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitCost) ? unitCost : 0);
  }, 0);

  const filteredOrders = orders.filter((order) =>
    statusFilter === "all" || order.status === statusFilter,
  );
  const currentPage = clampPage(page, filteredOrders.length, PAGE_SIZE);
  const visibleOrders = pageSlice(filteredOrders, currentPage, PAGE_SIZE);

  const statusCounts = PURCHASE_ORDER_STATUS_FILTERS.reduce(
    (counts, status) => {
      counts[status] = status === "all"
        ? orders.length
        : orders.filter((order) => order.status === status).length;
      return counts;
    },
    {} as PurchaseOrderStatusCounts,
  );
  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
            Transactions
          </p>
          <h1 className="text-3xl font-semibold uppercase">Purchase Orders</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!showForm) setEstimatedDeliveryDate("");
            setShowForm((v) => !v);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {showForm ? "Close" : "Create PO"}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5"
        >
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</span>
              <select
                required
                className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setLines([{ ...emptyLine }]);
                  setActiveProductLine(null);
                  setActiveCategoryLine(null);
                  setActiveUomLine(null);
                  setDuplicateWarning("");
                }}
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Delivery</span>
              <input
                type="date"
                required
                value={estimatedDeliveryDate}
                onChange={(event) => setEstimatedDeliveryDate(event.target.value)}
                className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
              />
            </label>
          </div>

          <div className="mb-2 grid min-w-[1160px] grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>Product</span>
            <span>Category</span>
            <span>UOM / Size</span>
            <span>Quantity</span>
            <span className="text-right">Unit Price (₱)</span>
            <span className="text-right">SUBTOTAL</span>
            <span>Action</span>
          </div>

          {lines.map((line, index) => (
            <div
              key={index}
              className="mb-3 grid min-w-[1160px] grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-3"
            >
              <div className="relative min-w-0">
                <span id={`po-product-label-${index}`} className="sr-only">Product</span>
                <input
                  type="text"
                  role="combobox"
                  aria-label="Product"
                  aria-labelledby={`po-product-label-${index}`}
                  aria-autocomplete="list"
                  aria-expanded={activeProductLine === index}
                  aria-controls={`po-product-options-${index}`}
                  autoComplete="off"
                  placeholder={supplierId ? "Search supplier products" : "Select a supplier first"}
                  disabled={!supplierId}
                  className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                  value={line.product_search}
                  onFocus={() => setActiveProductLine(index)}
                  onBlur={() => setActiveProductLine(null)}
                  onChange={(event) => {
                    setDuplicateWarning("");
                    updateLine(index, {
                      product_id: 0,
                      product_code: "",
                      product_family: "",
                      product_search: event.target.value,
                      category_code: "",
                      category_search: "",
                      variant_search: "",
                      unit_cost: "",
                    });
                    setActiveProductLine(index);
                  }}
                />
                {activeProductLine === index ? (() => {
                  const query = line.product_search.trim().toLocaleLowerCase();
                  const baseGroups = supplierProducts.reduce<Map<string, Product[]>>((groups, product) => {
                    const label = baseProductLabel(product);
                    groups.set(label, [...(groups.get(label) ?? []), product]);
                    return groups;
                  }, new Map());
                  const matchingBases = Array.from(baseGroups.entries()).filter(([label, variants]) =>
                    (!line.category_code || variants.some((product) => product.category === line.category_code)) &&
                    (!query || `${label} ${variants.map((product) => `${product.name} ${product.sku} ${product.category} ${product.uom}`).join(" ")}`.toLocaleLowerCase().includes(query)),
                  );
                  return (
                    <div id={`po-product-options-${index}`} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {matchingBases.length ? matchingBases.map(([baseLabel, variants]) => (
                        <button
                          key={baseLabel}
                          type="button"
                          role="option"
                          aria-selected={line.product_search === baseLabel}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectBaseProduct(index, baseLabel)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span>{baseLabel}</span>
                          <span className="shrink-0 text-xs text-slate-500">{variants.length} {variants.length === 1 ? "option" : "options"}</span>
                        </button>
                      )) : <p className="px-3 py-2 text-sm text-slate-500">{supplierId ? "No matching products linked to this supplier." : "Select a supplier first."}</p>}
                    </div>
                  );
                })() : null}
              </div>

              <div className="relative min-w-0">
                <span id={`po-category-label-${index}`} className="sr-only">Category</span>
                <input
                  type="text"
                  role="combobox"
                  aria-label="Category"
                  aria-labelledby={`po-category-label-${index}`}
                  aria-autocomplete="list"
                  aria-expanded={activeCategoryLine === index}
                  aria-controls={`po-category-options-${index}`}
                  autoComplete="off"
                  placeholder="Search category"
                  className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900"
                  value={line.category_search}
                  onFocus={() => {
                    setActiveCategoryLine(index);
                    if (line.category_code) updateLine(index, { category_search: "" });
                  }}
                  onBlur={() => {
                    setActiveCategoryLine(null);
                    if (line.category_code) {
                      const selectedCategory = categories.find((category) => category.code === line.category_code);
                      updateLine(index, { category_search: selectedCategory?.name ?? line.category_code });
                    }
                  }}
                  onChange={(event) => {
                    setDuplicateWarning("");
                    updateLine(index, {
                      product_id: 0,
                      product_code: "",
                      product_family: "",
                      product_search: "",
                      category_code: "",
                      category_search: event.target.value,
                      variant_search: "",
                      unit_cost: "",
                    });
                    setActiveCategoryLine(index);
                  }}
                />
                {activeCategoryLine === index ? (() => {
                  const query = line.category_search.trim().toLocaleLowerCase();
                  const supplierCategoryCodes = new Set(supplierProducts.map((product) => product.category));
                  const matches = categories.filter((category) => supplierCategoryCodes.has(category.code) && (
                    !query || `${category.name} ${category.code}`.toLocaleLowerCase().includes(query)
                  ));
                  return (
                    <div id={`po-category-options-${index}`} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {matches.length ? matches.map((category) => (
                        <button
                          key={category.category_id}
                          type="button"
                          role="option"
                          aria-selected={line.category_code === category.code}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectCategory(index, category.code)}
                          className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                        >
                          {category.name}
                        </button>
                      )) : <p className="px-3 py-2 text-sm text-slate-500">No matching categories.</p>}
                    </div>
                  );
                })() : null}
              </div>

              <div className="relative min-w-0">
                <span id={`po-uom-label-${index}`} className="sr-only">UOM / Size</span>
                <input
                  type="text"
                  role="combobox"
                  aria-label="Unit of measurement or size"
                  aria-labelledby={`po-uom-label-${index}`}
                  aria-autocomplete="list"
                  aria-expanded={activeUomLine === index}
                  aria-controls={`po-uom-options-${index}`}
                  autoComplete="off"
                  disabled={!line.category_code}
                  placeholder={line.category_code ? "Search size or unit" : "Select category first"}
                  className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                  value={line.variant_search}
                  onFocus={() => setActiveUomLine(index)}
                  onBlur={() => setActiveUomLine(null)}
                  onChange={(event) => {
                    updateLine(index, { product_id: 0, product_code: "", variant_search: event.target.value, unit_cost: "" });
                    setActiveUomLine(index);
                  }}
                />
                {activeUomLine === index && line.category_code ? (() => {
                  const query = line.variant_search.trim().toLocaleLowerCase();
                  const matches = supplierProducts.filter((product) => {
                    if (product.category !== line.category_code || (line.product_search && baseProductLabel(product) !== line.product_search)) return false;
                    const searchable = `${productVariantLabel(product)} ${product.name} ${product.sku} ${product.uom}`.toLocaleLowerCase();
                    return !query || searchable.includes(query);
                  }).slice(0, 20);
                  return (
                    <div id={`po-uom-options-${index}`} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {matches.length ? matches.map((product) => (
                        <button
                          key={product.product_id}
                          type="button"
                          role="option"
                          aria-selected={line.product_id === product.product_id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectProduct(index, product.product_id)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <span>{productVariantLabel(product)}</span>
                          <span className="shrink-0 text-xs text-slate-500">{product.sku}</span>
                        </button>
                      )) : <p className="px-3 py-2 text-sm text-slate-500">No available sizes or units.</p>}
                    </div>
                  );
                })() : null}
              </div>

              <label className="min-w-0">
                <span className="sr-only">Quantity</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-right tabular-nums text-slate-900"
                  value={line.quantity}
                  onChange={(e) =>
                    updateLine(index, { quantity: e.target.value })
                  }
                />
              </label>

              <label className="min-w-0">
                <span className="sr-only">Unit Price (₱)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                    ₱
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    className="no-spinner w-full rounded-lg border border-[#e2e8f0] bg-white py-2 pl-7 pr-3 text-right tabular-nums font-semibold text-slate-900"
                    value={line.unit_cost}
                    onChange={(e) =>
                      updateLine(index, { unit_cost: e.target.value })
                    }
                    onBlur={(e) =>
                      updateLine(index, {
                        unit_cost: e.target.value
                          ? Number(e.target.value).toFixed(2)
                          : "",
                      })
                    }
                  />
                </div>
              </label>

              <div className="flex min-w-0 items-center justify-end px-2 text-right text-sm font-semibold tabular-nums text-slate-800">
                  {peso(Number(line.quantity || 0) * Number(line.unit_cost || 0))}
              </div>

              <button
                type="button"
                onClick={() => removeLine(index)}
                title="Remove this line"
                className="h-10.5 w-full rounded-lg border border-[#e2e8f0] text-sm text-slate-500 transition hover:border-red-500 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}

          {duplicateWarning ? (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
              {duplicateWarning}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setLines((c) => [...c, { ...emptyLine }])}
            className="mb-4 text-xs font-semibold text-blue-700"
          >
            + Add line
          </button>

          <div className="mb-4 flex justify-end border-t border-[#e2e8f0] pt-3 text-base font-semibold">
            <span className="mr-6">Total</span>
            <span className="tabular-nums">{peso(poTotal)}</span>
          </div>

          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          <button className="block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700">
            Create Purchase Order
          </button>
        </form>
      ) : null}

      <PurchaseOrderStatusTabs
        value={statusFilter}
        counts={statusCounts}
        onChange={setStatusFilter}
      />

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#e2e8f0] bg-[#ffffff]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f1f5f9] text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">PO #</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No purchase orders in this view.
                </td>
              </tr>
            ) : (
              visibleOrders.map((order) => (
                <tr key={order.po_id} className="border-t border-[#e2e8f0]">
                  <td className="px-4 py-3">{new Date(order.order_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-slate-900">
                    {order.reference_no || `#${order.po_id}`}
                  </td>
                  <td className="px-4 py-3">{order.supplier.name}</td>
                  <td className="px-4 py-3">
                    <PurchaseOrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {peso(Number(order.total_amount))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewing(order)}
                        className="rounded-md border border-[#e2e8f0] px-2 py-1 text-xs text-slate-600 hover:border-blue-600 hover:text-blue-700"
                      >
                        View
                      </button>
                      {order.status === "issued" ? (
                        <button
                          type="button"
                          onClick={() => openOrderConfirmation(order)}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                        >
                          Confirm
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={currentPage}
        total={filteredOrders.length}
        size={PAGE_SIZE}
        onChange={setPage}
        label="purchase orders"
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Purchase Order Overview"
        size="lg"
        message={
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</p>
              <p className="mt-1 font-semibold text-slate-900">
                {suppliers.find((supplier) => String(supplier.supplier_id) === supplierId)?.name || "Supplier not selected"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Delivery</p>
              <p className="mt-1 font-semibold text-slate-900">{formatDeliveryDate(estimatedDeliveryDate)}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Line Items</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Product</th>
                      <th className="px-4 py-2 text-right">Quantity</th>
                      <th className="px-4 py-2 text-right">Unit Price</th>
                      <th className="px-4 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filledLines.map((line) => {
                      const product = products.find((p) => p.product_id === line.product_id);
                      const quantity = Number(line.quantity || 0);
                      const unitPrice = Number(line.unit_cost || 0);
                      return (
                        <tr key={line.product_id}>
                          <td className="px-4 py-3 font-medium text-slate-900">{product?.name ?? "Product"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{quantity}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{peso(unitPrice)}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">{peso(quantity * unitPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 bg-blue-50 px-4 py-3 text-base font-semibold text-slate-900">
                <span>Total Purchase Amount</span>
                <span className="tabular-nums">{peso(poTotal)}</span>
              </div>
            </div>
          </div>
        }
        confirmLabel="Confirm & Create PO"
        cancelLabel="Go back"
        busy={saving}
        onConfirm={confirmCreate}
        onCancel={() => setConfirmOpen(false)}
      />

      {confirmTarget ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <section className="my-6 max-h-[85vh] w-full max-w-5xl overflow-y-auto overflow-x-visible rounded-2xl bg-white shadow-xl">
            <div id="printable-document" className="p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-700">OHMYGAS</p>
                  <h2 className="text-lg font-bold text-slate-900">Island Gas LPG Store</h2>
                  <p className="text-xs text-slate-500">Bachaw Sur, Kalibo, Aklan</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Purchase Order</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                    {confirmTarget.reference_no || `PO-${confirmTarget.po_id}`}
                  </p>
                  <div className="mt-2"><PurchaseOrderStatusBadge status={confirmTarget.status} /></div>
                </div>
              </div>

              <div className="grid gap-4 border-b border-slate-200 py-5 text-sm sm:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</p><p className="mt-1 font-medium text-slate-900">{confirmTarget.supplier.name}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purchaser</p><p className="mt-1 font-medium text-slate-900">{user?.full_name || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date &amp; Time of Purchase</p><p className="mt-1 font-medium text-slate-900">{new Date(confirmTarget.order_date).toLocaleString()}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated Delivery</p><p className="mt-1 font-medium text-slate-900">{formatDeliveryDate(confirmTarget.estimated_delivery)}</p></div>
              </div>

              <div className="overflow-visible pt-5">
                <div className="w-full">
                  <div className="grid grid-cols-[minmax(0,4fr)_minmax(90px,1fr)_minmax(130px,1.2fr)_minmax(130px,1.2fr)_56px] items-center gap-3 border-b border-slate-200 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Item / Product &amp; UOM</span><span className="text-right">Qty</span><span className="text-right">Unit Price (₱)</span><span className="text-right">Amount (₱)</span><span className="text-center">Action</span>
                  </div>
                  {confirmLines.map((line) => {
                    const itemKey = line.item_id;
                    const productKey = `${itemKey}:product`;
                    const categoryKey = `${itemKey}:category`;
                    const uomKey = `${itemKey}:uom`;
                    const quantity = Number(line.quantity);
                    const unitPrice = Number(line.unit_cost);
                    const productQuery = line.product_search.trim().toLocaleLowerCase();
                    const categoryQuery = line.category_search.trim().toLocaleLowerCase();
                    const uomQuery = line.variant_search.trim().toLocaleLowerCase();
                    const matchingProducts = products.filter((product) => product.category === line.category_code && (!line.product_family || productFamily(product) === line.product_family) && (!uomQuery || `${productVariantLabel(product)} ${product.name} ${product.sku} ${product.uom}`.toLocaleLowerCase().includes(uomQuery)));
                    return (
                      <div key={itemKey} className="grid grid-cols-[minmax(0,4fr)_minmax(90px,1fr)_minmax(130px,1.2fr)_minmax(130px,1.2fr)_56px] items-center gap-3 border-b border-slate-100 py-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="relative min-w-0">
                            <span className="sr-only">Product</span>
                            <input aria-label="Product" role="combobox" aria-expanded={activeConfirmDropdown === productKey} autoComplete="off" placeholder="Product" value={line.product_search} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm" onFocus={() => setActiveConfirmDropdown(productKey)} onChange={(event) => { updateConfirmationLine(itemKey, { product_id: 0, product_code: "", product_family: "", product_search: event.target.value, category_code: "", category_search: "", variant_search: "", unit_cost: "" }); setActiveConfirmDropdown(productKey); }} />
                            {activeConfirmDropdown === productKey ? <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl">{productFamilies.filter((family) => !productQuery || family.toLocaleLowerCase().includes(productQuery)).map((family) => <button key={family} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectConfirmationFamily(itemKey, family)} className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50">{family}</button>)}</div> : null}
                          </div>
                          <div className="relative min-w-0">
                            <span className="sr-only">Category</span>
                            <input aria-label="Category" role="combobox" aria-expanded={activeConfirmDropdown === categoryKey} autoComplete="off" placeholder="Category" value={line.category_search} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm" onFocus={() => setActiveConfirmDropdown(categoryKey)} onChange={(event) => { updateConfirmationLine(itemKey, { product_id: 0, product_code: "", product_family: "", product_search: "", category_code: "", category_search: event.target.value, variant_search: "", unit_cost: "" }); setActiveConfirmDropdown(categoryKey); }} />
                            {activeConfirmDropdown === categoryKey ? <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl">{categories.filter((category) => !categoryQuery || `${category.name} ${category.code}`.toLocaleLowerCase().includes(categoryQuery)).map((category) => <button key={category.category_id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectConfirmationCategory(itemKey, category.code)} className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50">{category.name}</button>)}</div> : null}
                          </div>
                          <div className="relative min-w-0">
                            <span className="sr-only">UOM / Size</span>
                            <input aria-label="UOM / Size" role="combobox" aria-expanded={activeConfirmDropdown === uomKey} autoComplete="off" disabled={!line.category_code} placeholder="UOM / Size" value={line.variant_search} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm disabled:bg-slate-100" onFocus={() => setActiveConfirmDropdown(uomKey)} onChange={(event) => { updateConfirmationLine(itemKey, { product_id: 0, product_code: "", variant_search: event.target.value, unit_cost: "" }); setActiveConfirmDropdown(uomKey); }} />
                            {activeConfirmDropdown === uomKey && line.category_code ? <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl">{matchingProducts.map((product) => <button key={product.product_id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectConfirmationProduct(itemKey, product)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"><span>{productVariantLabel(product)}</span><span className="text-xs text-slate-500">{product.sku}</span></button>)}</div> : null}
                          </div>
                        </div>
                        <span className="text-right tabular-nums"><input aria-label="Quantity" type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateConfirmationLine(itemKey, { quantity: event.target.value })} className="no-print w-full rounded-md border border-slate-300 px-2 py-2 text-right tabular-nums" /><span className="print-only">{line.quantity}</span></span>
                        <span className="text-right tabular-nums"><input aria-label="Unit price" type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => updateConfirmationLine(itemKey, { unit_cost: event.target.value })} className="no-print w-full rounded-md border border-slate-300 px-2 py-2 text-right tabular-nums" /><span className="print-only">{peso(unitPrice)}</span></span>
                        <span className="text-right font-medium tabular-nums">{peso((Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0))}</span>
                        <button type="button" aria-label="Remove item" title="Remove item" onClick={() => setConfirmLines((current) => current.filter((row) => row.item_id !== itemKey))} className="no-print mx-auto flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:border-red-400 hover:text-red-600">×</button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 flex justify-end border-t border-slate-200 pt-4 text-base font-bold text-slate-900">
                <span className="mr-6">Total</span><span className="tabular-nums">{peso(confirmationTotal)}</span>
              </div>
              {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            </div>
            <div className="no-print flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 md:px-8">
              <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Print</button>
              <button type="button" onClick={() => setConfirmTarget(null)} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Close</button>
              <button type="button" onClick={confirmOrder} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Confirming…" : "Confirm Order"}</button>
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this purchase order?"
        message={
          cancelTarget ? (
            <span>
              <strong className="text-slate-900">
                {cancelTarget.reference_no || `PO #${cancelTarget.po_id}`}
              </strong>{" "}
              will be marked cancelled and can no longer be received.
            </span>
          ) : null
        }
        confirmLabel="Yes, cancel order"
        cancelLabel="Keep order"
        tone="danger"
        busy={saving}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div id="printable-document" className="p-8">
              <div className="flex items-start justify-between border-b border-slate-300 pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-600">
                    OhMyGas
                  </p>
                  <p className="text-lg font-bold">Island Gas LPG Store</p>
                  <p className="text-xs text-slate-500">
                    Bachaw Sur, Kalibo, Aklan
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Purchase Order
                  </p>
                  <p className="font-mono text-lg font-bold">
                    {viewing.reference_no || `PO #${viewing.po_id}`}
                  </p>
                  <PurchaseOrderStatusBadge status={viewing.status} />
                </div>
              </div>

              <div className="grid gap-4 border-b border-slate-300 py-4 text-sm md:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Supplier
                  </p>
                  <p className="font-semibold">{viewing.supplier.name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Purchaser
                  </p>
                  <p className="font-semibold">
                    {viewing.createdBy
                      ? `${viewing.createdBy.full_name} (${
                          viewing.createdBy.role === "admin"
                            ? "Admin"
                            : "Cashier"
                        })`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Date &amp; Time of Purchase
                  </p>
                  <p>{new Date(viewing.order_date).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Estimated Delivery
                  </p>
                  <p>
                    {formatDeliveryDate(viewing.estimated_delivery)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="my-4 w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="pb-2">Item</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Unit Price</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.items.map((item, i) => (
                      <tr key={i} className="border-b border-slate-200">
                        <td className="py-2">{item.product.name}</td>
                        <td className="py-2 text-right tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {peso(Number(item.unit_cost))}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {peso(item.quantity * Number(item.unit_cost))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-base font-bold">
                      <td className="pt-3" colSpan={3}>
                        Total
                      </td>
                      <td className="pt-3 text-right tabular-nums">
                        {peso(Number(viewing.total_amount))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

            </div>

            <div className="no-print flex flex-wrap gap-2 border-t border-[#e2e8f0] p-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Print
              </button>
              {viewing.status === "issued" ? (
                <button
                  type="button"
                  onClick={() => setCancelTarget(viewing)}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Cancel Order
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="ml-auto rounded-lg border border-[#e2e8f0] px-4 py-2 text-sm text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <AdminOnly>
      <PurchaseOrdersPageView />
    </AdminOnly>
  );
}
