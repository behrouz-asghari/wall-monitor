import { describe, expect, it } from "vitest";

import { LiveDataSchema, PriceIndicatorSchema, PricesPayloadSchema } from "@/lib/wallgold/schemas";
import { parseLiveData, parsePrices } from "@/lib/wallgold/normalize";
import pricesFixture from "../fixtures/prices.sample.json";
import livedataFixture from "../fixtures/livedata.sample.json";

describe("livedata schema", () => {
  it("accepts the real livedata payload", () => {
    const result = parseLiveData(livedataFixture);
    expect(result.ok).toBe(true);
    expect(result.data?.trade.lastMinuteToman).toBe(720351500);
    expect(result.data?.deposit.lastHourVolumeToman).toBe(24904299000);
    expect(result.raw).toBe(livedataFixture);
  });

  it("rejects an HTML error page", () => {
    const result = parseLiveData("<html>502 Bad Gateway</html>");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("livedata_schema_mismatch");
    expect(result.issues?.length).toBeGreaterThan(0);
  });

  it("rejects a payload missing core flow metrics", () => {
    const broken = { ...livedataFixture } as Record<string, unknown>;
    delete broken.deposit;
    const result = parseLiveData(broken);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid timestamp", () => {
    const result = parseLiveData({ ...livedataFixture, updatedAt: "not-a-date" });
    expect(result.ok).toBe(false);
  });

  it("preserves unknown future fields (passthrough)", () => {
    const enriched = { ...livedataFixture, future_field: { anything: 1 } };
    const parsed = LiveDataSchema.safeParse(enriched);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).future_field).toEqual({ anything: 1 });
    }
  });

  it("tolerates a missing optional delivery block", () => {
    const withoutDelivery = { ...livedataFixture } as Record<string, unknown>;
    delete withoutDelivery.delivery;
    expect(parseLiveData(withoutDelivery).ok).toBe(true);
  });
});

describe("prices schema", () => {
  it("accepts the real prices payload with all indicators", () => {
    const result = parsePrices(pricesFixture);
    expect(result.ok).toBe(true);
    const expected = Object.keys((pricesFixture as { indicators: object }).indicators).length;
    expect(Object.keys(result.data?.indicators ?? {})).toHaveLength(expected);
    expect(result.data?.last_realtime_ts).toBe(1791022646);
  });

  it("validates via the exported full schema too", () => {
    expect(PricesPayloadSchema.safeParse(pricesFixture).success).toBe(true);
    const indicators = (pricesFixture as { indicators: Record<string, unknown> }).indicators;
    expect(PriceIndicatorSchema.safeParse(indicators.gold18k).success).toBe(true);
  });

  it("dynamically preserves unknown indicator keys", () => {
    const payload = JSON.parse(JSON.stringify(pricesFixture)) as {
      indicators: Record<string, unknown>;
    };
    payload.indicators.new_indicator = {
      price: 123.45,
      open: null,
      high: 130,
      low: 120,
      change_amount: 1,
      change_percent: 0.5,
      direction: "high",
      updated_ms: 1791022632000,
      unit: "تومان",
      divide10: false,
      decimals: 2,
      prev: { close: 122, open: 121, high: 125, low: 119 },
    };

    const result = parsePrices(payload);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.data?.indicators ?? {})).toContain("new_indicator");
    expect(result.invalidSymbols).toEqual({});
  });

  it("skips only the malformed indicator, keeping the rest of the snapshot", () => {
    const payload = JSON.parse(JSON.stringify(pricesFixture)) as {
      indicators: Record<string, unknown>;
    };
    payload.indicators.broken_symbol = { price: "not-a-number" };
    const gold18k = payload.indicators.gold18k as { prev?: unknown } | undefined;
    if (gold18k) delete gold18k.prev;

    const result = parsePrices(payload);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.invalidSymbols ?? {})).toEqual(
      expect.arrayContaining(["broken_symbol", "gold18k"]),
    );
    expect(Object.keys(result.invalidSymbols ?? {}).length).toBe(2);
    // Everything else survives.
    expect(Object.keys(result.data?.indicators ?? {}).length).toBe(
      Object.keys(payload.indicators).length - 2,
    );
  });

  it("rejects when the envelope metadata is missing", () => {
    const payload = { indicators: {}, last_realtime: "", last_realtime_ts: null };
    const result = parsePrices(payload);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("prices_schema_mismatch");
  });

  it("rejects when indicators is not a map", () => {
    const result = parsePrices({
      indicators: ["gold18k"],
      last_realtime: "2026-10-03 13:47:26",
      last_realtime_ts: 1791022646,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("prices_indicators_not_a_map");
  });

  it("keeps the raw payload reference for raw_json persistence", () => {
    const result = parsePrices(pricesFixture);
    expect(result.raw).toBe(pricesFixture);
  });

  it("accepts a null direction (source emits it)", () => {
    const parsed = PriceIndicatorSchema.safeParse({
      price: 28682657,
      open: 0,
      high: 33938623,
      low: 24519968,
      change_amount: 0,
      change_percent: 0,
      direction: null,
      updated_ms: 1791021967000,
      unit: "تومان",
      divide10: true,
      decimals: 0,
      prev: { close: 1, open: 2, high: 3, low: 0 },
    });
    expect(parsed.success).toBe(true);
  });
});
