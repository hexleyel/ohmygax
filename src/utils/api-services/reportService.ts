export async function getXReport() {
  const res = await fetch("/api/reports/x-report");
  if (!res.ok) throw new Error("Failed to load X report");
  return res.json();
}

export async function generateZReport() {
  const res = await fetch("/api/reports/z-report", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to generate Z report");
  return data;
}

export async function getDashboardSummary() {
  const res = await fetch("/api/reports/dashboard-summary");
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Failed to load dashboard summary (${res.status})`);
  }
  return res.json();
}

export async function getSalesReport(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/reports/sales${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error("Failed to load sales report");
  return res.json();
}
