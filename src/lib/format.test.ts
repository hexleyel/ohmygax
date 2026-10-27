import { describe, expect, it } from "vitest";
import { amount, peso } from "./format";

describe("peso formatting", () => {
  it("always shows two decimal places", () => {
    expect(peso(50)).toBe("₱50.00");
    expect(peso(50.5)).toBe("₱50.50");
    expect(peso(0)).toBe("₱0.00");
  });

  it("groups thousands", () => {
    expect(peso(1200)).toBe("₱1,200.00");
    expect(peso(36000)).toBe("₱36,000.00");
    expect(peso(1234567.891)).toBe("₱1,234,567.89");
  });

  it("accepts the string values Prisma Decimal columns serialise to", () => {
    expect(peso("1200")).toBe("₱1,200.00");
    expect(peso("1200.5")).toBe("₱1,200.50");
  });

  it("falls back to zero rather than rendering NaN", () => {
    expect(peso(null)).toBe("₱0.00");
    expect(peso(undefined)).toBe("₱0.00");
    expect(peso(Number.NaN)).toBe("₱0.00");
    expect(peso("not a number")).toBe("₱0.00");
  });

  it("handles negatives, used for discount lines", () => {
    expect(peso(-250)).toBe("₱-250.00");
  });

  it("amount() is the same number without the symbol, for receipt columns", () => {
    expect(amount(1200)).toBe("1,200.00");
    expect(amount(null)).toBe("0.00");
  });
});
