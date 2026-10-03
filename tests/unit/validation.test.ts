import { describe, expect, it } from "vitest";

import {
  FlowsQuerySchema,
  PriceHistoryQuerySchema,
  RangeParamSchema,
  SymbolParamSchema,
  PaginationParamSchema,
} from "@/lib/validation";

describe("query parameter validation", () => {
  it("parses range keys case-insensitively", () => {
    expect(RangeParamSchema.parse("24h")).toBe("24H");
    expect(RangeParamSchema.parse(" 7d ")).toBe("7D");
    expect(RangeParamSchema.safeParse("99H").success).toBe(false);
    expect(RangeParamSchema.safeParse("24 hours").success).toBe(false);
  });

  it("accepts only safe symbol keys", () => {
    expect(SymbolParamSchema.parse("gold18k")).toBe("gold18k");
    expect(SymbolParamSchema.parse("price_dollar_rl")).toBe("price_dollar_rl");
    expect(SymbolParamSchema.safeParse("gold; drop table users").success).toBe(false);
    expect(SymbolParamSchema.safeParse("").success).toBe(false);
    expect(SymbolParamSchema.safeParse("sym bol").success).toBe(false);
    expect(SymbolParamSchema.safeParse("x".repeat(65)).success).toBe(false);
  });

  it("applies defaults for the price history route", () => {
    const parsed = PriceHistoryQuerySchema.parse({ symbol: "ons" });
    expect(parsed).toEqual({ symbol: "ons", range: "24H" });
    expect(PriceHistoryQuerySchema.safeParse({}).success).toBe(false); // symbol required
  });

  it("applies the default range for the flows route", () => {
    expect(FlowsQuerySchema.parse({})).toEqual({ range: "24H" });
    expect(FlowsQuerySchema.parse({ range: "30D" })).toEqual({ range: "30D" });
  });

  it("coerces and bounds pagination", () => {
    expect(PaginationParamSchema.parse("3")).toBe(3);
    expect(PaginationParamSchema.safeParse(0).success).toBe(false);
    expect(PaginationParamSchema.safeParse(-1).success).toBe(false);
    expect(PaginationParamSchema.safeParse("abc").success).toBe(false);
  });
});
