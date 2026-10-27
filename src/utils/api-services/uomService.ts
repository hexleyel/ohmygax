export async function listUoms(status: "active" | "archived" = "active") {
  const res = await fetch(`/api/uoms?status=${status}`);
  if (!res.ok) throw new Error("Failed to load units of measurement");
  return res.json();
}

type UomPayload = { code?: string; name?: string; status?: "active" | "archived" };

export async function createUom(data: UomPayload) {
  const res = await fetch(`/api/uoms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to create unit");
  return res.json();
}

export async function updateUom(id: number, data: UomPayload) {
  const res = await fetch(`/api/uoms/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to update unit");
  return res.json();
}

