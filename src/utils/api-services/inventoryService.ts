export async function adjustStock(
  productId: number,
  adjustment: number,
  reason: string,
  stockType: "new" | "old",
) {
  const res = await fetch(`/api/inventory/${productId}/adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId,
      adjustmentQuantity: adjustment,
      stockTier: stockType.toUpperCase(),
      reason,
    }),
  });
  const responseText = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};

  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (res.ok) {
        throw new Error("Stock adjustment succeeded, but the server returned an invalid response.");
      }
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Failed to adjust stock (HTTP ${res.status})`);
  }

  if (!responseText.trim()) {
    throw new Error("Stock adjustment succeeded, but the server returned an empty response.");
  }

  return data;
}
