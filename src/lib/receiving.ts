/**
 * Receiving rules, shared by the API route and the Receive Orders form so the
 * two can never drift apart about what a valid receipt looks like.
 */

export const LINE_STATUSES = ["pending", "back-order", "complete"] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

export function isLineStatus(value: string): value is LineStatus {
  return (LINE_STATUSES as readonly string[]).includes(value);
}

export type ReceiptInput = {
  orderedQty: number;
  receivedQty: number;
  missingQty: number;
  damagedQty: number;
  excessQty: number;
  status: LineStatus;
  note: string;
};

/**
 * Returns the first problem with a receipt, or null when it is valid.
 * One message at a time, because that is what the form shows.
 */
export function validateReceipt(input: ReceiptInput): string | null {
  const { orderedQty, receivedQty, missingQty, damagedQty, excessQty, status } =
    input;

  for (const [label, value] of [
    ["Received", receivedQty],
    ["Missing", missingQty],
    ["Damaged", damagedQty],
    ["Excess", excessQty],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      return `${label} quantity must be a whole number of zero or more.`;
    }
  }

  if (missingQty > orderedQty) {
    return `Missing can't exceed the ${orderedQty} ordered.`;
  }
  if (damagedQty > receivedQty) {
    return `Damaged can't exceed the ${receivedQty} received.`;
  }
  if (excessQty > 0 && receivedQty <= orderedQty) {
    return "Excess only applies when more arrived than was ordered.";
  }
  if (receivedQty > orderedQty && excessQty !== receivedQty - orderedQty) {
    return `${receivedQty} received against ${orderedQty} ordered — excess should be ${
      receivedQty - orderedQty
    }.`;
  }

  if (status === "back-order") {
    if (missingQty === 0 && damagedQty === 0 && excessQty === 0) {
      return "A back-order line needs at least one of missing, damaged or excess to be more than zero.";
    }
  }

  return null;
}

/**
 * Units that should actually reach sellable stock.
 *
 * Damaged goods physically arrived but cannot be sold, and there is no
 * separate damaged-stock bucket in this system, so they are excluded.
 */
export function usableQuantity(receivedQty: number, damagedQty: number) {
  return receivedQty - damagedQty;
}

/**
 * How much stock to move for a line, given what was already recorded against
 * it. Expressed as a delta so saving the same line twice is a no-op.
 */
export function stockDelta(
  next: { receivedQty: number; damagedQty: number },
  previous: { receivedQty: number; damagedQty: number },
) {
  return (
    usableQuantity(next.receivedQty, next.damagedQty) -
    usableQuantity(previous.receivedQty, previous.damagedQty)
  );
}

/**
 * Summarize line progress at the order level while retaining per-line states.
 */
export function deriveOrderStatus(lines: { receive_status: string }[]) {
  if (lines.length === 0) return "pending";
  if (lines.every((l) => l.receive_status === "complete")) return "received";
  if (lines.some((l) => l.receive_status === "back-order")) return "back-order";
  if (lines.some((l) => l.receive_status === "complete")) return "pending";
  return "pending";
}

/**
 * Product ids appearing more than once in a purchase order. Compared by id
 * rather than name, so two products with similar names are still distinct.
 */
export function duplicateProductIds(items: { product_id: number }[]) {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const item of items) {
    const id = Number(item.product_id);
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}
