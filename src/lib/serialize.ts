function isDecimalLike(value: unknown): value is { toNumber: () => number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === "function" &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  );
}

/**
 * Recursively converts Prisma Decimal instances to plain numbers.
 * Must walk the object graph manually — JSON.stringify calls an object's
 * own toJSON() (which Decimal has, returning a string) before the replacer
 * ever sees it, so a JSON.stringify-replacer-based approach can't detect Decimals.
 */
export function serialize<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (isDecimalLike(value)) return value.toNumber() as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => serialize(item)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(val);
    }
    return out as T;
  }
  return value;
}
