export async function listAuditLogs(filters: Record<string, string> = {}) {
  const cleaned = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const params = new URLSearchParams(cleaned).toString();
  const res = await fetch(`/api/audit-logs${params ? `?${params}` : ""}`);
  if (!res.ok) throw new Error("Failed to load audit logs");
  return res.json();
}
