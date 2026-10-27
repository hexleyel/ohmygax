export async function listWarehouseLocations(): Promise<string[]> {
  const response = await fetch("/api/inventory/locations");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to load warehouse locations.");
  return Array.isArray(data) ? data.filter((value): value is string => typeof value === "string") : [];
}
