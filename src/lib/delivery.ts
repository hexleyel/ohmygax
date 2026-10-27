/** Suppliers quote roughly a fortnight, so this is the working estimate. */
export const DELIVERY_LEAD_DAYS = 14;

/**
 * Estimated delivery for a purchase order: the order date plus the lead time.
 *
 * The arithmetic runs on the local calendar date rather than on the raw
 * timestamp, so a purchase stored near midnight UTC cannot land a day either
 * side of the intended date once it is rendered in local time. Both the
 * displayed purchase date and this value are read in the same timezone, so
 * the gap between them is always exactly DELIVERY_LEAD_DAYS days.
 */
export function estimatedDelivery(
  orderDate: string | Date,
  leadDays = DELIVERY_LEAD_DAYS,
) {
  const source = orderDate instanceof Date ? orderDate : new Date(orderDate);
  if (Number.isNaN(source.getTime())) return null;

  // Rebuild from the local Y/M/D so the time-of-day can't tip the result over
  // a day boundary; Date normalises month/day overflow for us.
  return new Date(
    source.getFullYear(),
    source.getMonth(),
    source.getDate() + leadDays,
  );
}
