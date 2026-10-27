"use client";

import { useEffect, useMemo, useState } from "react";
import { listProducts } from "@/utils/api-services/productService";
import { getSettings } from "@/utils/api-services/settingsService";
import { checkout, recordVoidedItem } from "@/utils/api-services/posService";
import Link from "next/link";
import { calculateCartTotals } from "@/lib/calc";
import { getCashSessionStatus } from "@/utils/api-services/cashSessionService";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useSession } from "@/context/SessionContext";
import { amount, peso } from "@/lib/format";
import { isValidPhMobile, PH_MOBILE_HINT } from "@/lib/validation";
import Pagination, { clampPage, pageSlice } from "@/components/Pagination";

type Product = {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  uom: string;
  selling_price: number;
  stock_qty: number;
  old_stock_qty: number;
};

type CartLine = {
  product: Product;
  quantity: number;
  /** Units on this line taken without trading in an empty cylinder. */
  withoutCylinderQty: number;
};

type ProductTile =
  | { kind: "family"; key: "lpg" | "accessory"; variants: Product[] }
  | { kind: "product"; key: number; product: Product };

const CATEGORIES = ["all", "cylinder", "accessory", "appliance"] as const;
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export default function PosPage() {
  const { user } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastFilter, setLastFilter] = useState("");
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [variantSelection, setVariantSelection] = useState<{
    family: "lpg" | "accessory";
    variants: Product[];
  } | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [variantQuery, setVariantQuery] = useState("");
  const [variantDropdownOpen, setVariantDropdownOpen] = useState(false);
  const [seniorDiscount, setSeniorDiscount] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "gcash">("cash");
  const [cashInput, setCashInput] = useState("");
  const [gcashMobile, setGcashMobile] = useState("");
  const [gcashRef, setGcashRef] = useState("");
  const [settings, setSettings] = useState<Record<string, string>>({ vat_rate: "12" });
  const [receipt, setReceipt] = useState<any>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Checkout requires an open shift, so surface that before a cart is built.
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const [voidTarget, setVoidTarget] = useState<CartLine | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listProducts().then(setProducts);
    getSettings().then(setSettings);
    getCashSessionStatus()
      .then((d) => setShiftOpen(Boolean(d.openSession)))
      .catch(() => setShiftOpen(null));
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = category === "all" || p.category === category;
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [products, category, search]);

  const productTiles = useMemo<ProductTile[]>(() => {
    const lpgVariants = filteredProducts.filter((product) => product.category === "cylinder");
    const accessoryVariants = filteredProducts.filter((product) => product.category === "accessory");
    return [
      ...(lpgVariants.length ? [{ kind: "family" as const, key: "lpg" as const, variants: lpgVariants }] : []),
      ...(accessoryVariants.length ? [{ kind: "family" as const, key: "accessory" as const, variants: accessoryVariants }] : []),
      ...filteredProducts
        .filter((product) => product.category !== "cylinder" && product.category !== "accessory")
        .map((product) => ({ kind: "product" as const, key: product.product_id, product })),
    ];
  }, [filteredProducts]);

  // Narrowing the catalogue sends you back to the first page. Done during
  // render rather than in an effect, so there is no second render pass.
  const filterKey = `${category}|${search}`;
  if (filterKey !== lastFilter) {
    setLastFilter(filterKey);
    setPage(1);
  }

  // The grid pages at 10 so a long catalogue stays one screen tall.
  const currentPage = clampPage(page, productTiles.length);
  const pagedProductTiles = pageSlice(productTiles, currentPage);

  const cartLines = Object.values(cart);
  const itemCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);

  const configuredVatRate = Number(settings.vat_rate);
  const vatRate = Number.isFinite(configuredVatRate) ? configuredVatRate : 12;

  // Reuses the exact same math the server uses at checkout, so the preview
  // shown here can never drift from what actually gets charged.
  const totals = useMemo(
    () =>
      calculateCartTotals(
        cartLines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.product.selling_price,
          withoutCylinderQty: l.withoutCylinderQty,
        })),
        {
          vatRate,
          cylinderFee: Number(settings.cylinder_exchange_fee || 0),
          bulkDiscountThreshold: Number(settings.bulk_discount_threshold || Infinity),
          bulkDiscountRate: Number(settings.bulk_discount_rate || 0),
          seniorDiscountRate: Number(settings.senior_discount_rate || 0),
          seniorDiscount,
        },
      ),
    [cartLines, settings, seniorDiscount, vatRate],
  );

  const cashReceived = Number(cashInput || 0);
  const changeDue = cashReceived - totals.total;
  // A sale can't complete until the payment side is actually settled: enough
  // cash on the counter, or a GCash reference to reconcile against later.
  const cashShort = paymentMethod === "cash" && cashReceived < totals.total;
  const mobileTouched = gcashMobile.trim().length > 0;
  const mobileInvalid = mobileTouched && !isValidPhMobile(gcashMobile);
  const gcashIncomplete =
    paymentMethod === "gcash" &&
    (!gcashMobile.trim() || !isValidPhMobile(gcashMobile) || !gcashRef.trim());
  const paymentIncomplete = cashShort || gcashIncomplete;
  const selectedVariant = variantSelection?.variants.find(
    (product) => product.product_id === selectedVariantId,
  ) ?? null;
  const matchingVariants = (variantSelection?.variants ?? []).filter((product) =>
    getVariantOptionLabel(product, variantSelection?.family ?? "lpg").toLowerCase().includes(variantQuery.trim().toLowerCase()),
  );

  function addToCart(product: Product) {
    const available = Number(product.old_stock_qty) || 0;
    if (available <= 0) return;
    setCart((current) => {
      const existing = current[product.product_id];
      if (existing && existing.quantity >= available) return current;
      return {
        ...current,
        [product.product_id]: existing
          ? { ...existing, quantity: existing.quantity + 1 }
          : { product, quantity: 1, withoutCylinderQty: 0 },
      };
    });
  }

  function openVariantPicker(family: "lpg" | "accessory", variants: Product[]) {
    setVariantSelection({ family, variants });
    setSelectedVariantId(null);
    setVariantQuery("");
    setVariantDropdownOpen(true);
  }

  function addSelectedVariant() {
    const selected = variantSelection?.variants.find((product) => product.product_id === selectedVariantId);
    if (!selected || (Number(selected.old_stock_qty) || 0) <= 0) return;
    addToCart(selected);
    closeVariantPicker();
  }

  function closeVariantPicker() {
    setVariantSelection(null);
    setSelectedVariantId(null);
    setVariantQuery("");
    setVariantDropdownOpen(false);
  }

  function productSizeLabel(product: Product) {
    const size = product.name.match(/\d+(?:\.\d+)?\s*(?:kg|m)\b/i)?.[0];
    if (size) return size.replace(/\s+/g, "");
    return product.uom.toLowerCase() === "pcs" ? "Pcs" : product.uom;
  }

  function getVariantOptionLabel(product: Product, family: "lpg" | "accessory") {
    return family === "lpg" ? productSizeLabel(product) : product.name;
  }

  function chooseVariant(product: Product) {
    setSelectedVariantId(product.product_id);
    setVariantQuery(getVariantOptionLabel(product, variantSelection?.family ?? "lpg"));
    setVariantDropdownOpen(false);
  }

  function updateQuantity(productId: number, quantity: number) {
    setCart((current) => {
      const line = current[productId];
      if (!line) return current;
      const next = Number.isFinite(quantity) && quantity > 0
        ? Math.min(Math.floor(quantity), Number(line.product.old_stock_qty) || 0)
        : 0;
      return {
        ...current,
        [productId]: {
          ...line,
          quantity: next,
          withoutCylinderQty: Math.min(line.withoutCylinderQty, next),
        },
      };
    });
  }

  function setWithoutCylinderQty(productId: number, value: number) {
    setCart((current) => {
      const line = current[productId];
      const clamped = Number.isFinite(value)
        ? Math.min(Math.max(Math.floor(value), 0), line.quantity)
        : 0;
      return {
        ...current,
        [productId]: { ...line, withoutCylinderQty: clamped },
      };
    });
  }

  async function confirmVoid(line: CartLine) {
    // Remove it either way — a failed audit write shouldn't trap the cashier
    // with an item they've already decided to void.
    try {
      await recordVoidedItem(line.product.product_id, line.quantity);
    } catch {
      // Non-fatal: the void still proceeds.
    }
    removeLine(line.product.product_id);
    setVoidTarget(null);
  }

  function removeLine(productId: number) {
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  async function handleCheckout() {
    setError("");
    if (itemCount <= 0) return;
    setSubmitting(true);
    // Snapshot the cart before it is cleared so the receipt can list what was sold.
    const activeCartLines = cartLines.filter((line) => line.quantity > 0);
    const soldLines = activeCartLines.map((l) => ({
      name: l.product.name,
      sku: l.product.sku,
      quantity: l.quantity,
      unitPrice: l.product.selling_price,
      withoutCylinderQty: l.withoutCylinderQty,
    }));
    try {
      const data = await checkout({
        items: activeCartLines.map((l) => ({
          product_id: l.product.product_id,
          quantity: l.quantity,
          without_cylinder_qty: l.withoutCylinderQty,
        })),
        payment_method: paymentMethod,
        cash_received: paymentMethod === "cash" ? cashReceived : undefined,
        gcash_mobile: paymentMethod === "gcash" ? gcashMobile.trim() : undefined,
        gcash_reference: paymentMethod === "gcash" ? gcashRef.trim() : undefined,
        senior_discount: seniorDiscount,
      });
      setReceipt({
        ...data,
        lines: soldLines,
        paymentMethod,
        cashier: user?.full_name ?? "",
        vatRate,
      });
      setConfirmOpen(false);
      setCart({});
      setCashInput("");
      setGcashMobile("");
      setGcashRef("");
      setSeniorDiscount(false);
      listProducts().then(setProducts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-blue-600">Transactions</p>
        <h1 className="text-3xl font-semibold uppercase">Point of Sale</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          {shiftOpen === false ? (
            <div className="mb-6 flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
              <p className="text-sm text-amber-900">
                <strong>No active shift</strong>
              </p>
              <Link
                href="/transactions/cash-management"
                className="shrink-0 rounded-lg bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-700"
              >
                Open Shift
              </Link>
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              className="h-12 min-w-[200px] flex-1 rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-4 text-base"
              placeholder="Search products or product code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`min-h-12 rounded-lg border px-4 py-3 text-sm font-semibold uppercase transition ${
                    category === c
                      ? "border-blue-600 bg-blue-600/15 text-blue-700"
                      : "border-[#e2e8f0] text-slate-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {productTiles.length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-[#e2e8f0] bg-white px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">No products found.</p>
              </div>
            ) : pagedProductTiles.map((tile) => {
              if (tile.kind === "family") {
                const available = tile.variants.reduce(
                  (sum, product) => sum + Math.max(0, Number(product.old_stock_qty) || 0),
                  0,
                );
                return (
                  <button
                    key={tile.key}
                    type="button"
                    disabled={available <= 0}
                    aria-label={`${tile.key === "lpg" ? "LPG" : "Gas Accessories"}, ${tile.variants.length} ${tile.key === "lpg" ? "sizes" : "models"} available, ${available} units in stock`}
                    onClick={() => openVariantPicker(tile.key, tile.variants)}
                    className={`relative min-h-36 rounded-xl border p-6 text-left transition ${available <= 0 ? "cursor-not-allowed border-red-200 bg-slate-50 opacity-80" : "border-[#e2e8f0] bg-white hover:border-blue-600"}`}
                  >
                    <span className="absolute left-3 top-3 rounded-full bg-blue-600/15 px-3 py-1 text-xs font-semibold uppercase text-blue-700">
                      {tile.key === "lpg" ? "Cylinder" : "Accessory"}
                    </span>
                    <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-sm font-semibold ${available <= 0 ? "bg-red-100 text-red-700" : "bg-[#f1f5f9] text-slate-500"}`}>
                      {available}
                    </span>
                    <p className="mt-8 text-xl font-semibold">{tile.key === "lpg" ? "LPG" : "Gas Accessories"}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      {tile.variants.length} {tile.key === "lpg" ? "sizes · choose size" : "models · choose model"}
                    </p>
                  </button>
                );
              }

              const product = tile.product;
              return (
                <button
                  key={tile.key}
                  type="button"
                  disabled={product.old_stock_qty <= 0}
                  aria-label={product.old_stock_qty <= 0 ? `${product.name}, out of stock, transfer required` : `${product.name}, ${product.old_stock_qty} old stock available`}
                  onClick={() => addToCart(product)}
                  className={`relative min-h-36 rounded-xl border p-6 text-left transition ${product.old_stock_qty <= 0 ? "cursor-not-allowed border-red-200 bg-slate-50 opacity-80" : "border-[#e2e8f0] bg-[#ffffff] hover:border-blue-600"}`}
                >
                  <span className="absolute left-3 top-3 rounded-full bg-blue-600/15 px-3 py-1 text-xs font-semibold uppercase text-blue-700">
                    {product.category}
                  </span>
                  <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-sm font-semibold ${product.old_stock_qty <= 0 ? "bg-red-100 text-red-700" : "bg-[#f1f5f9] text-slate-500"}`}>
                    {Math.max(0, Number(product.old_stock_qty) || 0)}
                  </span>
                  <p className="mt-8 text-lg font-semibold">{product.name}</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">
                    {peso(product.selling_price)}
                  </p>
                  {product.old_stock_qty <= 0 ? (
                    <span className="mt-2 block rounded-md bg-red-50 px-2 py-1 text-[10px] font-semibold leading-4 text-red-700">
                      Out of Stock - Transfer Required
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {productTiles.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">0 items available</p>
          ) : (
            <Pagination
              page={currentPage}
              total={productTiles.length}
              onChange={setPage}
              largeControls
              summaryText={(first, last, total) =>
                total <= 10
                  ? `${total} items available`
                  : `Showing ${first}–${last} of ${total} items available`
              }
            />
          )}
        </div>

        <div className="rounded-2xl border border-[#e2e8f0] bg-[#ffffff] p-5">
          <p className="mb-4 text-base font-semibold uppercase tracking-wide text-slate-600">
            Order ({itemCount} items)
          </p>

          {cartLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
              <p className="text-3xl">🛒</p>
              <p className="mt-2 text-sm">Tap a product to add</p>
            </div>
          ) : (
            <div className="mb-4 space-y-3">
              {cartLines.map((line) => (
                <div
                  key={line.product.product_id}
                  className="rounded-lg border border-[#e2e8f0] p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-base font-semibold">{line.product.name}</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        {line.quantity} x {peso(line.product.selling_price)}
                        {line.product.category === "cylinder" && line.withoutCylinderQty > 0
                          ? ` (${line.withoutCylinderQty} w/o cylinder)`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => line.quantity > 0 ? setVoidTarget(line) : removeLine(line.product.product_id)}
                      aria-label={`Remove ${line.product.name}`}
                      className="flex h-12 w-12 items-center justify-center rounded-lg text-xl text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <input
                      type="number"
                      min={1}
                      max={line.product.old_stock_qty}
                      step={1}
                      placeholder="Qty"
                      value={line.quantity || ""}
                      onChange={(e) =>
                        updateQuantity(line.product.product_id, Number(e.target.value))
                      }
                      className="no-spinner h-12 w-20 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-3 text-right tabular-nums text-base"
                    />
                    {line.product.category === "cylinder" ? (
                      <label className="flex min-h-12 items-center gap-2 text-sm text-slate-500">
                        <span>Without cylinder</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          max={line.quantity}
                          value={line.withoutCylinderQty || ""}
                          onChange={(e) =>
                            setWithoutCylinderQty(
                              line.product.product_id,
                              Number(e.target.value),
                            )
                          }
                          className="no-spinner h-12 w-16 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-2 text-right tabular-nums text-base"
                        />
                        <span className="text-slate-400">of {line.quantity}</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          <label className="mb-4 flex cursor-pointer items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-5 w-5 accent-blue-600"
              checked={seniorDiscount}
              onChange={(e) => setSeniorDiscount(e.target.checked)}
            />
            <span>Senior Discount (20%)</span>
          </label>

          <div className="mb-4 space-y-1 border-t border-[#e2e8f0] pt-3 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{peso(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 ? (
              <div className="flex justify-between text-slate-500">
                <span>Discount</span>
                <span>-{peso(totals.discountAmount)}</span>
              </div>
            ) : null}
            {totals.cylinderFee > 0 ? (
              <div className="flex justify-between text-slate-500">
                <span>Cylinder Fee</span>
                <span>{peso(totals.cylinderFee)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-500">
              <span>VAT Incl. ({vatRate}%)</span>
              <span>{peso(totals.vatAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold text-slate-900">
              <span>Total Amount Due</span>
              <span>{peso(totals.total)}</span>
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`min-h-12 flex-1 rounded-lg border px-4 py-3 text-base font-bold ${
                paymentMethod === "cash"
                  ? "border-blue-600 bg-blue-600/15 text-blue-700"
                  : "border-[#e2e8f0] text-slate-500"
              }`}
            >
              Cash
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("gcash")}
              className={`min-h-12 flex-1 rounded-lg border px-4 py-3 text-base font-bold ${
                paymentMethod === "gcash"
                  ? "border-blue-600 bg-blue-600/15 text-blue-700"
                  : "border-[#e2e8f0] text-slate-500"
              }`}
            >
              GCash
            </button>
          </div>

          {paymentMethod === "gcash" ? (
            <div className="mb-4 space-y-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  GCash Mobile Number
                </span>
                <input
                  inputMode="numeric"
                  placeholder="09XX XXX XXXX"
                  value={gcashMobile}
                  onChange={(e) => setGcashMobile(e.target.value)}
                  aria-invalid={mobileInvalid}
                  className={`h-12 w-full rounded-lg border bg-white px-4 text-base tabular-nums text-slate-900 ${
                    mobileInvalid ? "border-red-400" : "border-[#e2e8f0]"
                  }`}
                />
                {mobileInvalid ? (
                  <span className="mt-1 block text-[11px] font-medium text-red-600">
                    {PH_MOBILE_HINT}
                  </span>
                ) : null}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reference Number
                </span>
                <input
                  inputMode="numeric"
                  placeholder="From the customer confirmation"
                  value={gcashRef}
                  onChange={(e) => setGcashRef(e.target.value)}
                  className="h-12 w-full rounded-lg border border-[#e2e8f0] bg-white px-4 text-base tabular-nums text-slate-900"
                />
              </label>
            </div>
          ) : null}

          {paymentMethod === "cash" ? (
            <div className="mb-4">
              <div className="mb-2 grid grid-cols-4 gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCashInput(amount.toFixed(2))}
                    className="min-h-12 rounded-lg border border-[#e2e8f0] px-2 text-sm font-semibold text-slate-700"
                  >
                    ₱{amount >= 1000 ? `${amount / 1000}K` : amount}
                  </button>
                ))}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  ₱
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  onBlur={(e) =>
                    setCashInput(
                      e.target.value ? Number(e.target.value).toFixed(2) : "",
                    )
                  }
                  className="no-spinner h-12 w-full rounded-lg border border-[#e2e8f0] bg-[#f1f5f9] pl-8 pr-4 text-right text-base tabular-nums text-slate-900"
                />
              </div>
              {cartLines.length > 0 ? (
                cashShort ? (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    Short by {peso(totals.total - cashReceived)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-medium text-emerald-700">
                    Change {peso(changeDue)}
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            disabled={
              itemCount === 0 ||
              submitting ||
              shiftOpen === false ||
              paymentIncomplete
            }
            onClick={() => setConfirmOpen(true)}
            className="h-14 w-full rounded-lg bg-blue-600 px-5 text-lg font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting
              ? "Processing…"
              : shiftOpen === false
                ? "Shift Closed"
                : cashShort
                  ? "Not enough cash received"
                  : mobileInvalid
                    ? "Check the GCash mobile number"
                    : gcashIncomplete
                      ? "Enter GCash details"
                      : "Complete Sale"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={variantSelection !== null}
        title={variantSelection?.family === "accessory" ? "Select Gas Accessory" : "Select LPG Size"}
        size="md"
        message={
          variantSelection ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {variantSelection.family === "lpg" ? "Size / UOM" : "Accessory Model"}
                </span>
                <div className="relative">
                  <input
                    type="text"
                    role="combobox"
                    aria-label={variantSelection.family === "lpg" ? "Search LPG size or UOM" : "Search accessory model"}
                    aria-autocomplete="list"
                    aria-expanded={variantDropdownOpen}
                    aria-controls="pos-variant-options"
                    autoComplete="off"
                    placeholder={variantSelection.family === "lpg" ? "Search or select size" : "Search regulator or hose"}
                    value={variantQuery}
                    onFocus={() => setVariantDropdownOpen(true)}
                    onChange={(event) => {
                      setVariantQuery(event.target.value);
                      setSelectedVariantId(null);
                      setVariantDropdownOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setVariantDropdownOpen(false);
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const firstAvailable = matchingVariants.find((product) => (Number(product.old_stock_qty) || 0) > 0);
                        if (firstAvailable) chooseVariant(firstAvailable);
                      }
                    }}
                    className="h-12 w-full rounded-lg border border-[#e2e8f0] bg-white px-4 text-base text-slate-900"
                  />
                  {variantDropdownOpen ? (
                    <div id="pos-variant-options" role="listbox" className="absolute left-0 top-full z-10 mt-1 max-h-60 w-full overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-[#e2e8f0] bg-white py-1 shadow-lg">
                      {matchingVariants.length > 0 ? matchingVariants.map((product) => (
                        <button
                          key={product.product_id}
                          type="button"
                          role="option"
                          aria-selected={selectedVariantId === product.product_id}
                          aria-label={getVariantOptionLabel(product, variantSelection.family)}
                          disabled={(Number(product.old_stock_qty) || 0) <= 0}
                          onClick={() => chooseVariant(product)}
                          className="block min-h-12 w-full px-4 py-3 text-left text-base text-slate-900 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          {getVariantOptionLabel(product, variantSelection.family)}
                        </button>
                      )) : (
                        <p className="px-3 py-2 text-sm text-slate-500">No matching variants.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              </label>
              {selectedVariant ? (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-900">{selectedVariant.name}</p>
                  <p className="font-semibold text-slate-700">
                    {peso(selectedVariant.selling_price)} · {selectedVariant.old_stock_qty} available
                  </p>
                </div>
              ) : null}
            </div>
          ) : null
        }
        confirmLabel="Add to order"
        confirmDisabled={!selectedVariant || (Number(selectedVariant.old_stock_qty) || 0) <= 0}
        cancelLabel="Cancel"
        onConfirm={addSelectedVariant}
        onCancel={closeVariantPicker}
        onClose={closeVariantPicker}
      />

      <ConfirmDialog
        open={voidTarget !== null}
        title="Void this item?"
        message={
          voidTarget ? (
            <span>
              Remove <strong className="text-slate-900">{voidTarget.product.name}</strong>{" "}
              ({voidTarget.quantity} ×) from the cart?
            </span>
          ) : null
        }
        confirmLabel="Yes, void item"
        cancelLabel="Keep item"
        tone="danger"
        onConfirm={() => {
          if (voidTarget) confirmVoid(voidTarget);
        }}
        onCancel={() => setVoidTarget(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm checkout?"
        message={
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Items</span>
              <span className="tabular-nums">{itemCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{peso(totals.subtotal)}</span>
            </div>
            {totals.discountAmount > 0 ? (
              <div className="flex justify-between">
                <span>Discount</span>
                <span className="tabular-nums">-{peso(totals.discountAmount)}</span>
              </div>
            ) : null}
            {totals.cylinderFee > 0 ? (
              <div className="flex justify-between">
                <span>Cylinder fee</span>
                <span className="tabular-nums">{peso(totals.cylinderFee)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>VAT Breakdown ({vatRate}%)</span>
              <span className="tabular-nums">{peso(totals.vatAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-[#e2e8f0] pt-1 text-base font-semibold text-slate-900">
              <span>Total Amount Due</span>
              <span className="tabular-nums">{peso(totals.total)}</span>
            </div>
            {paymentMethod === "cash" ? (
              <>
                <div className="flex justify-between border-t border-[#e2e8f0] pt-1">
                  <span>Cash received</span>
                  <span className="tabular-nums">{peso(cashReceived)}</span>
                </div>
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Change</span>
                  <span className="tabular-nums">
                    {peso(Math.max(0, changeDue))}
                  </span>
                </div>
              </>
            ) : (
              <div className="space-y-0.5 border-t border-[#e2e8f0] pt-1 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>GCash mobile</span>
                  <span className="tabular-nums">{gcashMobile}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reference no.</span>
                  <span className="tabular-nums">{gcashRef}</span>
                </div>
              </div>
            )}
            <p className="pt-1 text-xs">
              Paying by {paymentMethod === "cash" ? "Cash" : "GCash"}
            </p>
          </div>
        }
        confirmLabel="Yes, complete sale"
        cancelLabel="Go back"
        busy={submitting}
        onConfirm={handleCheckout}
        onCancel={() => setConfirmOpen(false)}
      />

      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-8 w-full max-w-[340px]">
            {/* Styled to read like an 80mm thermal receipt: monospace, narrow
                measure, dashed rules and aligned amount columns. */}
            <div
              id="printable-receipt"
              className="bg-white px-5 py-6 font-mono text-[12px] leading-relaxed text-black shadow-xl"
              style={{ fontFamily: "var(--font-geist-mono), Consolas, monospace" }}
            >
              <div className="text-center">
                <p className="text-[15px] font-bold tracking-[0.2em]">OHMYGAS</p>
                <p className="text-[11px]">Island Gas LPG Store</p>
                <p className="text-[11px]">Bachaw Sur, Kalibo, Aklan</p>
                <p className="text-[11px]">VAT Reg. TIN: 282-002-009-00000</p>
              </div>

              <Rule />

              <p className="text-center text-[11px] font-bold tracking-widest">
                SALES INVOICE
              </p>

              <Rule />

              <ReceiptRow label="OR No." value={receipt.transaction.reference_no || "—"} bold />
              <ReceiptRow
                label="Date"
                value={new Date(receipt.transaction.transaction_date).toLocaleDateString()}
              />
              <ReceiptRow
                label="Time"
                value={new Date(receipt.transaction.transaction_date).toLocaleTimeString()}
              />
              <ReceiptRow
                label="Cashier"
                value={receipt.cashier || "—"}
              />
              <ReceiptRow
                label="Payment"
                value={receipt.transaction.payment_method === "gcash" ? "GCASH" : "CASH"}
              />
              {receipt.transaction.gcash_reference ? (
                <ReceiptRow label="GCash Ref" value={receipt.transaction.gcash_reference} />
              ) : null}
              {receipt.transaction.gcash_mobile ? (
                <ReceiptRow label="GCash No." value={receipt.transaction.gcash_mobile} />
              ) : null}

              <Rule />

              {/* item column headers */}
              <div className="flex justify-between text-[10px] uppercase tracking-wider">
                <span>Qty / Item</span>
                <span>Amount</span>
              </div>

              <Rule thin />

              {receipt.lines?.map((line: any) => (
                <div key={line.sku} className="mb-1">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate">{line.name}</span>
                    <span className="tabular-nums">
                      {amount(line.quantity * Number(line.unitPrice))}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-600">
                    {line.quantity} x {amount(line.unitPrice)}
                    {line.withoutCylinderQty > 0
                      ? `  (${line.withoutCylinderQty} w/o cylinder)`
                      : ""}
                  </div>
                </div>
              ))}

              <Rule />

              <ReceiptRow label="Subtotal" value={amount(receipt.totals.subtotal)} />
              {receipt.totals.discountAmount > 0 ? (
                <ReceiptRow
                  label="Discount"
                  value={`-${amount(receipt.totals.discountAmount)}`}
                />
              ) : null}
              {receipt.totals.cylinderFee > 0 ? (
                <ReceiptRow
                  label="Cylinder Fee"
                  value={amount(receipt.totals.cylinderFee)}
                />
              ) : null}
              <ReceiptRow label={`VAT Breakdown (${receipt.vatRate ?? vatRate}%)`} value={amount(receipt.totals.vatAmount)} />

              <Rule />

              <div className="flex justify-between text-[14px] font-bold">
                <span>TOTAL AMOUNT DUE</span>
                <span className="tabular-nums">
                  P {amount(receipt.totals.total)}
                </span>
              </div>

              <Rule thin />

              {receipt.transaction.cash_received !== null ? (
                <ReceiptRow
                  label="Cash Received"
                  value={amount(receipt.transaction.cash_received)}
                />
              ) : null}
              {receipt.change_amount !== null ? (
                <ReceiptRow
                  label="Change"
                  value={amount(receipt.change_amount)}
                  bold
                />
              ) : null}

              <Rule />

              <div className="text-center text-[10px] leading-snug">
                <p className="font-bold">THANK YOU FOR YOUR PURCHASE!</p>
                <p className="mt-1">This serves as your official receipt.</p>
                <p className="mt-2 tracking-[0.3em]">* * *</p>
              </div>
            </div>

            <div className="no-print mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="flex-1 rounded-lg border border-white/40 bg-white/90 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white"
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

/** Dashed separator, mimicking the tear lines on a printed receipt. */
function Rule({ thin }: { thin?: boolean }) {
  return (
    <div
      className={`my-2 border-t border-dashed border-neutral-400 ${thin ? "opacity-50" : ""}`}
    />
  );
}

/** Label on the left, right-aligned amount — the standard receipt line. */
function ReceiptRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
