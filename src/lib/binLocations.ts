export const BIN_LOCATION_HINT = "Use a bin ID such as SHELF-C2-01.";

export function normalizeBinLocation(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().toUpperCase() || null;
}

export function isBinLocation(value: string) {
  return /^[A-Z0-9]+(?:-[A-Z0-9]+){2,}$/.test(value);
}
