import { describe, expect, it } from "vitest";
import { isValidPhMobile, normalizePhMobile } from "./validation";

describe("normalizePhMobile", () => {
  it("accepts the plain 11-digit form", () => {
    expect(normalizePhMobile("09171234567")).toBe("09171234567");
  });

  it("normalises the +63 and 63 prefixes to the 09 form", () => {
    expect(normalizePhMobile("+639171234567")).toBe("09171234567");
    expect(normalizePhMobile("639171234567")).toBe("09171234567");
  });

  it("ignores spaces, dashes and brackets people type", () => {
    expect(normalizePhMobile("0917 123 4567")).toBe("09171234567");
    expect(normalizePhMobile("0917-123-4567")).toBe("09171234567");
    expect(normalizePhMobile("(0917) 123 4567")).toBe("09171234567");
  });

  it("rejects numbers that are not PH mobiles", () => {
    // Landline, too short, too long, wrong network prefix, letters, empty.
    expect(normalizePhMobile("0361234567")).toBeNull();
    expect(normalizePhMobile("0917123456")).toBeNull();
    expect(normalizePhMobile("091712345678")).toBeNull();
    expect(normalizePhMobile("08171234567")).toBeNull();
    expect(normalizePhMobile("0917ABC4567")).toBeNull();
    expect(normalizePhMobile("")).toBeNull();
  });

  it("exposes a boolean helper that agrees with it", () => {
    expect(isValidPhMobile("+63 917 123 4567")).toBe(true);
    expect(isValidPhMobile("12345")).toBe(false);
  });
});
