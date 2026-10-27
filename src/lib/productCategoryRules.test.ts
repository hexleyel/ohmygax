import { describe, expect, it } from "vitest";
import { defaultsForProductName } from "./productCategoryRules";

describe("defaultsForProductName", () => {
  it("classifies LPG products as cylinders sold by the cylinder", () => {
    expect(defaultsForProductName("11kg LPG Cylinder")).toEqual({
      categoryCode: "cylinder",
      uomCode: "cylinder",
    });
    expect(defaultsForProductName("lpg refill")).toEqual({
      categoryCode: "cylinder",
      uomCode: "cylinder",
    });
  });

  it("matches LPG as a whole word regardless of case", () => {
    expect(defaultsForProductName("LPG")).not.toBeNull();
    expect(defaultsForProductName("Lpg Regulator")).not.toBeNull();
  });

  it("leaves other products alone so the user's choice stands", () => {
    expect(defaultsForProductName("Rubber Hose 1.5m")).toBeNull();
    expect(defaultsForProductName("Gas Stove")).toBeNull();
    expect(defaultsForProductName("")).toBeNull();
  });

  it("does not match LPG inside an unrelated word", () => {
    expect(defaultsForProductName("HELPGUIDE")).toBeNull();
  });
});
