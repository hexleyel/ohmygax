export async function listProducts(filters: Record<string, any> = {}) {
  const params = new URLSearchParams(filters).toString();
  const res = await fetch(`/api/products${params ? `?${params}` : ""}`);
  if (!res.ok) throw new Error("Failed to load products");
  return res.json();
}

export async function createProduct(data: Record<string, any>) {
  const res = await fetch(`/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error((await res.json()).error || "Failed to create product");
  return res.json();
}

export async function getProduct(id: number) {
  const res = await fetch(`/api/products/${id}`);
  if (!res.ok) throw new Error("Failed to fetch product");
  return res.json();
}

export async function updateProduct(id: number, data: Record<string, any>) {
  const res = await fetch(`/api/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok)
    throw new Error((await res.json()).error || "Failed to update product");
  return res.json();
}

export async function archiveProduct(id: number) {
  const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to archive product");
  return res.json();
}

export async function restoreProduct(id: number) {
  return updateProduct(id, { status: "active" });
}
