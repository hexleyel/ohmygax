import { DEFAULT_SETTINGS } from "@/lib/defaultSettings";

export async function getSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) return { ...DEFAULT_SETTINGS };
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ...DEFAULT_SETTINGS };
    }
    return {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value ?? "")]),
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(data: Record<string, string>) {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}
