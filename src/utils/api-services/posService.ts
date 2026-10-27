export type CheckoutItem = {
  product_id: number;
  quantity: number;
  without_cylinder_qty?: number;
};

export async function checkout(payload: {
  items: CheckoutItem[];
  payment_method: "cash" | "gcash";
  cash_received?: number;
  /** Captured at the till for GCash sales so the payment can be reconciled. */
  gcash_mobile?: string;
  gcash_reference?: string;
  senior_discount?: boolean;
}) {
  const res = await fetch("/api/pos/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Checkout failed");
  return data;
}

/** Records a cart line being voided before checkout, for the audit trail. */
export async function recordVoidedItem(product_id: number, quantity: number) {
  const res = await fetch("/api/pos/void-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id, quantity }),
  });
  if (!res.ok) throw new Error("Failed to record voided item");
  return res.json();
}
