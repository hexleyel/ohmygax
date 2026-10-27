export async function listPurchaseOrders(filters: Record<string, any> = {}) {
  const params = new URLSearchParams(filters).toString();
  const res = await fetch(`/api/purchase-orders${params ? `?${params}` : ""}`);
  const responseText = await res.text();
  let result: unknown;
  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = null;
  }
  if (!res.ok) {
    const message =
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error
        : `Failed to load purchase orders (HTTP ${res.status})`;
    throw new Error(message);
  }
  if (!Array.isArray(result)) {
    throw new Error("The purchase orders API returned an invalid response.");
  }
  return result;
}

export async function getPurchaseOrder(id: number) {
  const res = await fetch(`/api/purchase-orders/${id}`);
  if (!res.ok) throw new Error("Failed to load purchase order");
  return res.json();
}

export async function createPurchaseOrder(data: Record<string, any>) {
  const res = await fetch("/api/purchase-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const responseText = await res.text();
  let result: { success?: boolean; data?: unknown; error?: string } | null = null;
  try {
    result = responseText ? JSON.parse(responseText) : null;
  } catch {
    result = null;
  }
  if (!res.ok) throw new Error(result?.error || "Failed to create purchase order");
  if (!result?.success || !result.data) {
    throw new Error("The purchase order API returned an invalid response.");
  }
  return result;
}

/** Receives a single line of a purchase order. */
export async function receivePurchaseOrderLine(
  poId: number,
  data: {
    item_id: number;
    status: string;
    received_qty?: number;
    missing_qty?: number;
    damaged_qty?: number;
    excess_qty?: number;
    note?: string;
    location?: string;
  },
) {
  const res = await fetch(`/api/purchase-orders/${poId}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to receive this line");
  return result;
}

export async function cancelPurchaseOrder(id: number) {
  const res = await fetch(`/api/purchase-orders/${id}/cancel`, { method: "POST" });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to cancel purchase order");
  return result;
}

export async function confirmPurchaseOrder(
  id: number,
  items: { item_id: number; product_id: number; quantity: number; unit_cost: number }[],
) {
  const res = await fetch(`/api/purchase-orders/${id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to confirm purchase order");
  return result;
}
