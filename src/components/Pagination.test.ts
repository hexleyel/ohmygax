import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageSlice, PAGE_SIZE } from "./Pagination";

const rows = Array.from({ length: 23 }, (_, i) => i + 1);

describe("pageSlice", () => {
  it("shows the first ten on page 1", () => {
    expect(pageSlice(rows, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("shows 11-20 on page 2", () => {
    expect(pageSlice(rows, 2)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("shows the remainder on the last page", () => {
    expect(pageSlice(rows, 3)).toEqual([21, 22, 23]);
  });

  it("returns nothing past the end rather than throwing", () => {
    expect(pageSlice(rows, 9)).toEqual([]);
  });

  it("defaults to ten per page", () => {
    expect(PAGE_SIZE).toBe(10);
    expect(pageSlice(rows, 1)).toHaveLength(10);
  });
});

describe("pageCount", () => {
  it("counts whole and partial pages", () => {
    expect(pageCount(23)).toBe(3);
    expect(pageCount(20)).toBe(2);
    expect(pageCount(21)).toBe(3);
    expect(pageCount(1)).toBe(1);
  });

  it("is never zero, so there is always a page 1 to show", () => {
    expect(pageCount(0)).toBe(1);
  });
});

describe("clampPage", () => {
  it("keeps a valid page as it is", () => {
    expect(clampPage(2, 23)).toBe(2);
  });

  it("pulls back to the last real page when rows disappear", () => {
    // Was on page 3 of 23; a filter cuts the list to 12, so page 3 is gone.
    expect(clampPage(3, 12)).toBe(2);
  });

  it("never goes below one", () => {
    expect(clampPage(0, 23)).toBe(1);
    expect(clampPage(-5, 23)).toBe(1);
  });

  it("lands on page 1 for an empty list", () => {
    expect(clampPage(4, 0)).toBe(1);
  });
});
