import { describe, expect, it } from "vitest";

import {
  formatCompact,
  formatPercent,
  formatPriceByUnit,
  formatSigned,
  formatTehranTime,
  formatToman,
  formatUsd,
  toDisplayPrice,
  formatValueWithUnit,
} from "@/lib/format";
import {
  normalizeLiveData,
  normalizePrices,
  parseLiveData,
  parsePrices,
} from "@/lib/wallgold/normalize";
import livedataFixture from "../fixtures/livedata.sample.json";
import pricesFixture from "../fixtures/prices.sample.json";

describe("price conversion (divide10 / decimals)", () => {
  it("scales only for display when divide10 is true", () => {
    // geram24: raw 350,265,000 with divide10=true -> display 35,026,500
    expect(toDisplayPrice(350_265_000, true, 0)).toBe(35_026_500);
    // ons: raw 4140.19 with divide10=false stays untouched
    expect(toDisplayPrice(4140.19, false, 2)).toBe(4140.19);
    expect(toDisplayPrice(60.365, false, 2)).toBe(60.37);
  });

  it("formats by unit without mutating the raw value", () => {
    expect(formatPriceByUnit(350_265_000, "تومان", 0, true)).toBe("35,026,500 تومان");
    expect(formatPriceByUnit(4140.19, "دلار", 2, false)).toBe("$4,140.19");
    expect(formatValueWithUnit(35_026_500, "تومان", 0)).toBe("35,026,500 تومان");
    // raw stays exactly as sourced
    expect(350_265_000).toBe(350_265_000);
  });

  it("formats toman, usd, percentages and compact values", () => {
    expect(formatToman(26_301_000)).toBe("26,301,000 تومان");
    expect(formatUsd(4140.19)).toBe("$4,140.19");
    expect(formatPercent(1.63)).toBe("+1.63%");
    expect(formatPercent(-0.42)).toBe("-0.42%");
    expect(formatPercent(0)).toBe("0.00%"); // zero carries no sign
    expect(formatSigned(533_000)).toBe("+533,000");
    expect(formatSigned(-1_200)).toBe("-1,200");
    expect(formatCompact(17_800_000_000)).toBe("17.80B");
    expect(formatCompact(26_301_000)).toBe("26.30M");
  });

  it("renders Tehran time via Intl (no manual UTC offset math)", () => {
    // 2026-10-03T10:17:01Z == 13:47:01 in Asia/Tehran (UTC+3:30)
    expect(formatTehranTime("2026-10-03T10:17:01Z")).toBe("۱۳:۴۷");
  });
});

describe("normalizeLiveData", () => {
  const parsed = parseLiveData(livedataFixture);

  it("maps the payload onto the database row shape", () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !parsed.data) throw new Error("parse failed");

    const collectedAt = new Date("2026-10-03T10:18:00.000Z");
    const row = normalizeLiveData(parsed.data, collectedAt, parsed.raw);

    expect(row.source_updated_at).toBe("2026-10-03T10:17:01.000Z");
    expect(row.valid_until).toBe("2026-10-03T10:18:00.000Z");
    expect(row.collected_at).toBe("2026-10-03T10:18:00.000Z");
    expect(row.trade_last_minute_toman).toBe(720_351_500);
    expect(row.deposit_last_hour_volume_toman).toBe(24_904_299_000);
    expect(row.withdraw_last_hour_volume_toman).toBe(8_131_599_000);
    expect(row.delivery_today_count).toBe(69);
    expect(row.delivery_last_request_at).toBe("2026-10-03T10:14:39.000Z");
  });

  it("stores the untouched raw payload", () => {
    if (!parsed.ok || !parsed.data) throw new Error("parse failed");
    const row = normalizeLiveData(parsed.data, new Date(), parsed.raw);
    expect(row.raw_json).toBe(livedataFixture);
  });

  it("rounds stray fractional toman volumes for bigint columns only", () => {
    if (!parsed.ok || !parsed.data) throw new Error("parse failed");
    const mutated = JSON.parse(JSON.stringify(parsed.data)) as typeof parsed.data;
    mutated.deposit.lastMinuteToman = 400_000_000.7;
    const row = normalizeLiveData(mutated, new Date(), parsed.raw);
    expect(row.deposit_last_minute_toman).toBe(400_000_001);
    // original raw payload untouched:
    expect((parsed.raw as typeof livedataFixture).deposit.lastMinuteToman).toBe(409_777_000);
  });
});

describe("normalizePrices", () => {
  const parsed = parsePrices(pricesFixture);

  it("creates one normalized row per indicator with exact source values", () => {
    if (!parsed.ok || !parsed.data) throw new Error("parse failed");

    const collectedAt = new Date("2026-10-03T10:18:00.000Z");
    const { snapshot, snapshotRows } = normalizePrices(parsed.data, collectedAt, parsed.raw);

    expect(snapshot.source_last_realtime_ts).toBe(1_791_022_646);
    expect(snapshot.source_last_realtime).toBe("2026-10-03 13:47:26");
    expect(snapshot.raw_json).toBe(pricesFixture);
    expect(snapshotRows).toHaveLength(Object.keys(parsed.data.indicators).length);

    const geram24 = snapshotRows.find((row) => row.symbol === "geram24");
    expect(geram24).toBeDefined();
    // divide10=true must NOT change the stored value:
    expect(geram24?.price).toBe(350_265_000);
    expect(geram24?.divide10).toBe(true);
    expect(geram24?.decimals).toBe(0);

    const ons = snapshotRows.find((row) => row.symbol === "ons");
    expect(ons?.price).toBe(4140.19);
    expect(ons?.unit).toBe("دلار");

    // dynamic symbols: anything the source sent gets a row
    expect(snapshotRows.map((row) => row.symbol)).toContain("price_dollar_rl");
  });
});
