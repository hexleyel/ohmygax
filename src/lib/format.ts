/**
 * Currency display helpers.
 *
 * Amounts are stored as numeric/decimal columns; these only format them for
 * display. A formatted string must never be written back to the database.
 */

/** Formats an amount as Philippine pesos, e.g. ₱1,200.00 */
export function peso(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₱0.00";
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The same number without the symbol, for right-aligned table columns. */
export function amount(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
