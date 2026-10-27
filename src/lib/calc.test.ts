import { describe, expect, it } from "vitest";
import {
  calculateMarginPct,
  calculateSellingPrice,
  validateMarginPricing,
} from "./calc";

describe("two-way price / margin calculation", () => {
  it("derives the selling price from a margin", () => {
    expect(calculateSellingPrice(1000, 20)).toBe(1200);
    expect(calculateSellingPrice(1000, 10)).toBe(1100);
    expect(calculateSellingPrice(1000, 0)).toBe(1000);
  });

  it("derives the margin back from a selling price", () => {
    expect(calculateMarginPct(1000, 1200)).toBe(20);
    expect(calculateMarginPct(1000, 1100)).toBe(10);
    expect(calculateMarginPct(1000, 1000)).toBe(0);
  });

  it("round-trips, so editing either field leaves the other consistent", () => {
    for (const [base, margin] of [
      [1000, 20],
      [330, 14.5],
      [4635, 14.5],
      [90, 25],
    ] as const) {
      const selling = calculateSellingPrice(base, margin);
      expect(calculateMarginPct(base, selling)).toBeCloseTo(margin, 1);
    }
  });

  it("reports a lower margin when the selling price is lowered", () => {
    const higher = calculateMarginPct(1000, 1200)!;
    const lower = calculateMarginPct(1000, 1100)!;
    expect(lower).toBeLessThan(higher);
  });

  it("returns null rather than Infinity when the base price is zero", () => {
    // Every selling price would be an infinite markup over a zero cost, so
    // there is no meaningful margin to store.
    expect(calculateMarginPct(0, 500)).toBeNull();
    expect(calculateMarginPct(-10, 500)).toBeNull();
  });

  it("never yields NaN or Infinity from bad input", () => {
    expect(calculateMarginPct(Number.NaN, 100)).toBeNull();
    expect(calculateMarginPct(100, Number.NaN)).toBeNull();
    expect(calculateMarginPct(100, Number.POSITIVE_INFINITY)).toBeNull();
    expect(calculateSellingPrice(Number.NaN, 20)).toBe(0);
    expect(calculateSellingPrice(1000, Number.NaN)).toBe(0);
    expect(calculateSellingPrice(1000, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("rounds to two decimal places consistently", () => {
    expect(calculateSellingPrice(333.33, 14.5)).toBe(381.66);
    expect(calculateMarginPct(333.33, 381.66)).toBe(14.5);
  });

  it("handles a negative margin (selling below cost) without blowing up", () => {
    expect(calculateSellingPrice(1000, -10)).toBe(900);
    expect(calculateMarginPct(1000, 900)).toBe(-10);
  });
});

describe("validateMarginPricing", () => {
  it("rejects a base price of zero", () => {
    expect(validateMarginPricing(0)).toMatch(/needs a base price above/);
    expect(validateMarginPricing(0, 20)).toMatch(/needs a base price above/);
  });

  it("rejects a negative base price", () => {
    expect(validateMarginPricing(-1)).toMatch(/needs a base price above/);
    expect(validateMarginPricing(-1000, 20)).toMatch(/needs a base price above/);
  });

  it("allows a valid positive base price", () => {
    expect(validateMarginPricing(1000, 20)).toBeNull();
    expect(validateMarginPricing(0.01, 0)).toBeNull();
    expect(validateMarginPricing(1000, -10)).toBeNull(); // selling below cost
  });

  it("rejects a base price that is not a finite number", () => {
    expect(validateMarginPricing(Number.NaN)).toBe("Base price must be a number.");
    expect(validateMarginPricing(Number.POSITIVE_INFINITY)).toBe(
      "Base price must be a number.",
    );
    expect(validateMarginPricing(Number.NEGATIVE_INFINITY)).toBe(
      "Base price must be a number.",
    );
  });

  it("rejects a margin that is not a finite number", () => {
    expect(validateMarginPricing(1000, Number.NaN)).toBe("Margin must be a number.");
    expect(validateMarginPricing(1000, Number.POSITIVE_INFINITY)).toBe(
      "Margin must be a number.",
    );
  });

  it("gates exactly the inputs that would otherwise store a bogus price", () => {
    // Anything the rule accepts must produce a real number, and anything it
    // rejects is what would have stored 0 or NaN.
    for (const base of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateMarginPricing(base, 20)).not.toBeNull();
    }
    for (const base of [1, 100, 1000, 4635]) {
      expect(validateMarginPricing(base, 20)).toBeNull();
      expect(Number.isFinite(calculateSellingPrice(base, 20))).toBe(true);
      expect(calculateSellingPrice(base, 20)).toBeGreaterThan(0);
    }
  });

  it("still permits the worked examples from the spec", () => {
    expect(validateMarginPricing(1000, 20)).toBeNull();
    expect(calculateSellingPrice(1000, 20)).toBe(1200);
    expect(calculateMarginPct(1000, 1100)).toBe(10);
  });
});
