import { describe, expect, it } from "vitest";
import {
  deriveOrderStatus,
  duplicateProductIds,
  isLineStatus,
  stockDelta,
  usableQuantity,
  validateReceipt,
  type ReceiptInput,
} from "./receiving";

/** 10 ordered, fully and soundly received, unless overridden. */
function receipt(over: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    orderedQty: 10,
    receivedQty: 10,
    missingQty: 0,
    damagedQty: 0,
    excessQty: 0,
    status: "complete",
    note: "",
    ...over,
  };
}

describe("validateReceipt", () => {
  it("accepts a clean full receipt", () => {
    expect(validateReceipt(receipt())).toBeNull();
  });

  it("accepts a short delivery recorded as back-order", () => {
    // Ordered 10, received 8, 2 missing — the spec's worked example.
    expect(
      validateReceipt(
        receipt({
          receivedQty: 8,
          missingQty: 2,
          status: "back-order",
          note: "Supplier delivered only 8 cylinders.",
        }),
      ),
    ).toBeNull();
  });

  it("accepts damaged units that still arrived", () => {
    expect(
      validateReceipt(
        receipt({ damagedQty: 2, status: "back-order", note: "2 dented valves" }),
      ),
    ).toBeNull();
  });

  it("accepts an over-delivery when excess matches the overage", () => {
    expect(
      validateReceipt(
        receipt({
          receivedQty: 12,
          excessQty: 2,
          status: "back-order",
          note: "2 extra delivered",
        }),
      ),
    ).toBeNull();
  });

  it("rejects an over-delivery whose excess does not match", () => {
    expect(
      validateReceipt(receipt({ receivedQty: 12, excessQty: 1, status: "complete" })),
    ).toBe("12 received against 10 ordered — excess should be 2.");
  });

  it("rejects excess when nothing extra arrived", () => {
    expect(
      validateReceipt(
        receipt({ receivedQty: 8, missingQty: 2, excessQty: 3, status: "back-order", note: "x" }),
      ),
    ).toBe("Excess only applies when more arrived than was ordered.");
  });

  it("rejects missing greater than ordered", () => {
    expect(
      validateReceipt(receipt({ receivedQty: 8, missingQty: 99, status: "back-order", note: "x" })),
    ).toBe("Missing can't exceed the 10 ordered.");
  });

  it("rejects damaged greater than received", () => {
    expect(
      validateReceipt(receipt({ receivedQty: 8, damagedQty: 9, status: "back-order", note: "x" })),
    ).toBe("Damaged can't exceed the 8 received.");
  });

  it("rejects negative and fractional quantities", () => {
    expect(validateReceipt(receipt({ missingQty: -2 }))).toMatch(/whole number/);
    expect(validateReceipt(receipt({ damagedQty: 1.5 }))).toMatch(/whole number/);
    expect(validateReceipt(receipt({ receivedQty: -1 }))).toMatch(/whole number/);
    expect(validateReceipt(receipt({ excessQty: 2.5, receivedQty: 12 }))).toMatch(
      /whole number/,
    );
  });

  it("rejects back-order with no note", () => {
    expect(
      validateReceipt(receipt({ receivedQty: 8, missingQty: 2, status: "back-order", note: "  " })),
    ).toBe("A back-order line needs a note explaining the discrepancy.");
  });

  it("rejects back-order with a note but no discrepancy recorded", () => {
    expect(validateReceipt(receipt({ status: "back-order", note: "something odd" }))).toMatch(
      /at least one of missing, damaged or excess/,
    );
  });

  it("does not demand a note for a complete line", () => {
    expect(validateReceipt(receipt({ status: "complete", note: "" }))).toBeNull();
  });
});

describe("usable quantity and stock delta", () => {
  it("excludes damaged units from sellable stock", () => {
    expect(usableQuantity(10, 0)).toBe(10);
    expect(usableQuantity(10, 2)).toBe(8);
  });

  it("moves nothing when the same line is saved twice", () => {
    const line = { receivedQty: 8, damagedQty: 1 };
    expect(stockDelta(line, line)).toBe(0);
  });

  it("moves only the difference when a line is corrected upward", () => {
    // 8 received becomes 10 once the rest arrives: +2, not +10.
    expect(
      stockDelta({ receivedQty: 10, damagedQty: 0 }, { receivedQty: 8, damagedQty: 0 }),
    ).toBe(2);
  });

  it("moves stock back when a receipt is corrected downward", () => {
    expect(
      stockDelta({ receivedQty: 6, damagedQty: 0 }, { receivedQty: 8, damagedQty: 0 }),
    ).toBe(-2);
  });

  it("removes stock when units are reclassified as damaged after the fact", () => {
    expect(
      stockDelta({ receivedQty: 10, damagedQty: 3 }, { receivedQty: 10, damagedQty: 0 }),
    ).toBe(-3);
  });

  it("first receipt moves only the sound units", () => {
    expect(
      stockDelta({ receivedQty: 10, damagedQty: 2 }, { receivedQty: 0, damagedQty: 0 }),
    ).toBe(8);
  });
});

describe("deriveOrderStatus", () => {
  it("is received only when every line is complete", () => {
    expect(
      deriveOrderStatus([{ receive_status: "complete" }, { receive_status: "complete" }]),
    ).toBe("received");
  });

  it("is not received while any line is still pending", () => {
    expect(
      deriveOrderStatus([{ receive_status: "complete" }, { receive_status: "pending" }]),
    ).toBe("pending");
  });

  it("surfaces back-order over pending", () => {
    expect(
      deriveOrderStatus([{ receive_status: "complete" }, { receive_status: "back-order" }]),
    ).toBe("back-order");
  });
});

describe("duplicateProductIds", () => {
  it("finds a product added twice", () => {
    expect(duplicateProductIds([{ product_id: 2 }, { product_id: 2 }])).toEqual([2]);
  });

  it("allows different products", () => {
    expect(duplicateProductIds([{ product_id: 2 }, { product_id: 3 }])).toEqual([]);
  });

  it("compares by id, so similarly named distinct products are fine", () => {
    expect(
      duplicateProductIds([{ product_id: 2 }, { product_id: 3 }, { product_id: 4 }]),
    ).toEqual([]);
  });

  it("handles ids arriving as strings from a form post", () => {
    expect(
      duplicateProductIds([
        { product_id: "2" as unknown as number },
        { product_id: 2 },
      ]),
    ).toEqual([2]);
  });
});

describe("isLineStatus", () => {
  it("accepts the three known statuses and nothing else", () => {
    expect(isLineStatus("pending")).toBe(true);
    expect(isLineStatus("back-order")).toBe(true);
    expect(isLineStatus("complete")).toBe(true);
    expect(isLineStatus("received")).toBe(false);
    expect(isLineStatus("")).toBe(false);
  });
});
