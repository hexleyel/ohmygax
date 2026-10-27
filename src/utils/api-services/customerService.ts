export async function listCustomers() {
  const res = await fetch("/api/customers");
  if (!res.ok) throw new Error("Failed to load customers");
  return res.json();
}

export async function getCustomer(id: number) {
  const res = await fetch(`/api/customers/${id}`);
  if (!res.ok) throw new Error("Failed to load customer");
  return res.json();
}

export async function createCustomer(data: Record<string, any>) {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to create customer");
  return result;
}

export async function updateCustomer(id: number, data: Record<string, any>) {
  const res = await fetch(`/api/customers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update customer");
  return res.json();
}

export async function deleteCustomer(id: number) {
  const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Failed to delete customer");
  return result;
}
