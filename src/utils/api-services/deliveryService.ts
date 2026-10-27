export async function listDeliveries() {
  const res = await fetch("/api/deliveries");
  const text = await res.text();
  let result: any = {};
  if (text.trim()) {
    try {
      result = JSON.parse(text);
    } catch {
      if (res.ok) throw new Error("The server returned an invalid response while loading deliveries.");
    }
  }
  if (!res.ok) throw new Error(result.error || "Failed to load deliveries");
  return result;
}

export async function createDelivery(data: Record<string, any>) {
  const res = await fetch("/api/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let result: { error?: string; [key: string]: unknown } = {};
  if (text.trim()) {
    try {
      result = JSON.parse(text);
    } catch {
      if (res.ok) throw new Error("The server returned an invalid response while creating the delivery.");
    }
  }
  if (!res.ok) throw new Error(result.error || "Failed to submit order");
  return result;
}

export async function updateDelivery(id: number, data: Record<string, any>) {
  const res = await fetch(`/api/deliveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to update delivery");
  return result;
}

export async function dispatchDelivery(id: number) {
  const res = await fetch(`/api/deliveries/${id}/dispatch`, {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to dispatch delivery");
  return data;
}

export async function completeDelivery(id: number, data: { amount_received: number; empty_cylinders_returned: number }) {
  const res = await fetch(`/api/deliveries/${id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let result: { error?: string; [key: string]: unknown } = {};
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      if (res.ok) throw new Error("The server returned an invalid response while completing the delivery.");
    }
  }
  if (!res.ok) throw new Error(result.error || "Failed to complete delivery");
  return result;
}

export async function cancelDelivery(id: number) {
  const res = await fetch(`/api/deliveries/${id}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to cancel delivery");
  return res.json();
}
