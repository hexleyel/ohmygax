import crypto from "crypto";

function datestamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Official receipt number printed on the POS receipt, e.g. OR-20260817-00042 */
export function buildReceiptNo(transactionId: number, date = new Date()) {
  return `OR-${datestamp(date)}-${String(transactionId).padStart(5, "0")}`;
}

/** Delivery reference number, e.g. DR-20260817-00007 */
export function buildDeliveryRef(deliveryId: number, date = new Date()) {
  return `DR-${datestamp(date)}-${String(deliveryId).padStart(5, "0")}`;
}

/** Sales order number tied to a delivery, e.g. SO-20260817-00007 */
export function buildSalesOrderNo(deliveryId: number, date = new Date()) {
  return `SO-${datestamp(date)}-${String(deliveryId).padStart(5, "0")}`;
}

/** Purchase order number, e.g. PO-20260904-00007 */
export function buildPurchaseOrderNo(poId: number, date = new Date()) {
  return `PO-${datestamp(date)}-${String(poId).padStart(5, "0")}`;
}

/** GCash confirmation references are 13 digits. */
export function generateGcashReference() {
  let out = "";
  while (out.length < 13) {
    out += crypto.randomInt(0, 10).toString();
  }
  return out;
}

/**
 * Product code, e.g. CYL-00007. The prefix comes from the category so the code
 * says what the item is at a glance; the number is the row id, which keeps it
 * unique without a separate counter.
 */
export function buildProductCode(categoryCode: string, productId: number) {
  const prefix = (categoryCode || "GEN").slice(0, 3).toUpperCase();
  return `${prefix}-${String(productId).padStart(5, "0")}`;
}
