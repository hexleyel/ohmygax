import { describe, expect, it } from "vitest";
import { DELIVERY_LEAD_DAYS, estimatedDelivery } from "./delivery";

/** Local Y-M-D, which is how both dates are shown in the PO view. */
function ymd(d: Date | null) {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

describe("estimatedDelivery", () => {
  it("is the purchase date plus two weeks", () => {
    expect(ymd(estimatedDelivery(new Date(2026, 9, 1, 13, 30)))).toBe("2026-10-15");
  });

  it("does not drift a day either side regardless of time of day", () => {
    // Just after midnight and just before it must land on the same date.
    expect(ymd(estimatedDelivery(new Date(2026, 9, 1, 0, 0, 1)))).toBe("2026-10-15");
    expect(ymd(estimatedDelivery(new Date(2026, 9, 1, 23, 59, 59)))).toBe("2026-10-15");
  });

  it("stays exactly 14 days after the date the UI shows for the purchase", () => {
    // The PO view renders both with local getters, so the gap must hold for
    // any stored timestamp, including ones near a UTC day boundary.
    for (const iso of [
      "2026-10-01T16:00:00.000Z",
      "2026-10-01T00:30:00.000Z",
      "2026-12-31T15:00:00.000Z",
      "2026-02-20T22:45:00.000Z",
    ]) {
      const purchase = new Date(iso);
      const delivery = estimatedDelivery(iso)!;
      const shownPurchase = new Date(
        purchase.getFullYear(),
        purchase.getMonth(),
        purchase.getDate(),
      );
      const days = Math.round(
        (delivery.getTime() - shownPurchase.getTime()) / 86_400_000,
      );
      expect(days).toBe(DELIVERY_LEAD_DAYS);
    }
  });

  it("rolls over month and year boundaries", () => {
    expect(ymd(estimatedDelivery(new Date(2026, 11, 28)))).toBe("2027-01-11");
    expect(ymd(estimatedDelivery(new Date(2028, 1, 20)))).toBe("2028-03-05"); // leap year
  });

  it("returns null for an unparseable date rather than Invalid Date", () => {
    expect(estimatedDelivery("not a date")).toBeNull();
  });
});
