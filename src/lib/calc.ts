export function calculateSellingPrice(basePrice: number, marginPct: number) {
  const base = Number(basePrice);
  const margin = Number(marginPct);
  if (!Number.isFinite(base) || !Number.isFinite(margin)) return 0;
  return Number((base * (1 + margin / 100)).toFixed(2));
}

/**
 * Whether a margin-based price can be worked out at all.
 *
 * A base price of zero or less has no defined margin — every selling price
 * would be an infinite markup over it — so a pricing operation against such a
 * product is refused rather than quietly storing a zero selling price. Shared
 * by Price Management and the products API so both apply the same rule.
 *
 * Returns the reason it is refused, or null when the figures are usable.
 */
export function validateMarginPricing(
  basePrice: number,
  marginPct?: number,
): string | null {
  const base = Number(basePrice);
  if (!Number.isFinite(base)) {
    return "Base price must be a number.";
  }
  if (base <= 0) {
    return "A margin-based selling price needs a base price above ₱0.00. Set the base price first.";
  }
  if (marginPct !== undefined && !Number.isFinite(Number(marginPct))) {
    return "Margin must be a number.";
  }
  return null;
}

/**
 * The inverse of calculateSellingPrice: the margin that produces a given
 * selling price. Price Management edits either side, so the two must agree.
 *
 * A base price of zero has no defined margin (every selling price would be an
 * infinite markup), so it returns null and the caller refuses the edit rather
 * than writing NaN or Infinity to the column.
 */
export function calculateMarginPct(
  basePrice: number,
  sellingPrice: number,
): number | null {
  const base = Number(basePrice);
  const selling = Number(sellingPrice);
  if (!Number.isFinite(base) || !Number.isFinite(selling) || base <= 0) return null;
  return Number((((selling - base) / base) * 100).toFixed(2));
}

export type CartLine = {
  quantity: number;
  unitPrice: number;
  /** How many units on this line are sold WITHOUT an empty traded in. */
  withoutCylinderQty?: number;
};

export type CartSettings = {
  vatRate: number;
  cylinderFee: number;
  bulkDiscountThreshold: number;
  bulkDiscountRate: number;
  seniorDiscountRate: number;
  seniorDiscount: boolean;
};

/** Extract the VAT portion from a VAT-inclusive selling price. */
export function calculateVatAmount(subtotal: number, vatRate: number) {
  const amount = Number(subtotal);
  const rate = Number(vatRate);
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return 0;
  return round2(amount * (rate / (100 + rate)));
}

/**
 * Computes POS cart totals. Bulk discount applies per-line when that line's
 * quantity meets the threshold; the cylinder exchange fee is charged once per
 * cylinder taken without an empty traded in.
 */
export function calculateCartTotals(lines: CartLine[], settings: CartSettings) {
  let subtotal = 0;
  let bulkDiscountAmount = 0;
  let cylinderFee = 0;

  for (const line of lines) {
    const lineSubtotal = line.quantity * line.unitPrice;
    subtotal += lineSubtotal;

    if (line.quantity >= settings.bulkDiscountThreshold) {
      bulkDiscountAmount += lineSubtotal * (settings.bulkDiscountRate / 100);
    }

    const withoutCylinderQty = Math.min(
      Math.max(line.withoutCylinderQty ?? 0, 0),
      line.quantity,
    );
    cylinderFee += settings.cylinderFee * withoutCylinderQty;
  }

  const discountedSubtotal = subtotal - bulkDiscountAmount;
  const seniorDiscountAmount = settings.seniorDiscount
    ? discountedSubtotal * (settings.seniorDiscountRate / 100)
    : 0;
  // Product prices include VAT. Discounts reduce the VAT-inclusive product
  // amount, while cylinder fees are added separately and do not affect VAT.
  const taxableSubtotal = discountedSubtotal - seniorDiscountAmount;
  const vatAmount = calculateVatAmount(taxableSubtotal, settings.vatRate);
  const discountAmount = bulkDiscountAmount + seniorDiscountAmount;
  const total = subtotal + cylinderFee - discountAmount;

  return {
    subtotal: round2(subtotal),
    bulkDiscountAmount: round2(bulkDiscountAmount),
    seniorDiscountAmount: round2(seniorDiscountAmount),
    discountAmount: round2(discountAmount),
    cylinderFee: round2(cylinderFee),
    taxableSubtotal: round2(taxableSubtotal),
    vatAmount: round2(vatAmount),
    total: round2(total),
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
