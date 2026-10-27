export async function listSuppliers(status: "active" | "inactive" | "all" = "active") {
  const res = await fetch(`/api/suppliers?status=${status}`);
  if (!res.ok) throw new Error("Failed to load suppliers");
  return res.json();
}

export async function createSupplier(data: Record<string, any>) {
  const res = await fetch("/api/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error((await res.json()).error || "Failed to create supplier");
  return res.json();
}

export async function updateSupplier(id: number, data: Record<string, any>) {
  const res = await fetch(`/api/suppliers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update supplier");
  return res.json();
}

export async function updateSupplierStatus(id: number, status: "active" | "inactive") {
  const res = await fetch(`/api/suppliers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update supplier status");
  return data;
}
