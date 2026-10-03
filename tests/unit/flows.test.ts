import { describe, expect, it } from "vitest";

import { TIME_RANGES } from "@/lib/constants";
import {
  computeFlowMetrics,
  isTimeRangeKey,
  normalizeToPercent,
  resolveTimeRange,
  resolveTimeRangeSafe,
} from "@/lib/utils";

describe("time-range parsing", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("maps range keys to windows and aggregation buckets", () => {
    const h1 = resolveTimeRange("1H", now);
    expect(h1.from.toISOString()).toBe("2026-10-03T11:00:00.000Z");
    expect(h1.bucket).toBe("minute");

    expect(resolveTimeRange("24H", now).bucket).toBe("minute");
    expect(resolveTimeRange("3D", now).bucket).toBe("hour");
    expect(resolveTimeRange("7D", now).bucket).toBe("hour");
    expect(resolveTimeRange("30D", now).bucket).toBe("day");
    expect(resolveTimeRange("30D", now).from.toISOString()).toBe("2026-09-03T12:00:00.000Z");
  });

  it("rejects unknown range keys and falls back to 24H", () => {
    expect(isTimeRangeKey("24H")).toBe(true);
    expect(isTimeRangeKey("99X")).toBe(false);
    expect(resolveTimeRangeSafe("7d", now).key).toBe("24H"); // safe resolver expects exact keys
    expect(resolveTimeRangeSafe(undefined, now).key).toBe("24H");
    expect(resolveTimeRangeSafe("99X", now).key).toBe("24H");
    expect(resolveTimeRangeSafe("7D", now).key).toBe("7D");
  });

  it("defines exactly the ranges required by the spec", () => {
    expect(Object.keys(TIME_RANGES)).toEqual(["1H", "6H", "12H", "24H", "3D", "7D", "30D"]);
  });
});

describe("flow calculations", () => {
  it("computes net_flow = deposit_hour - withdraw_hour", () => {
    const metrics = computeFlowMetrics({
      depositLastMinuteToman: 409_777_000,
      depositLastHourVolumeToman: 24_904_299_000,
      withdrawLastMinuteToman: 85_071_000,
      withdrawLastHourVolumeToman: 8_131_599_000,
      tradeLastMinuteToman: 720_351_500,
    });

    expect(metrics.netFlowHourToman).toBe(24_904_299_000 - 8_131_599_000);
    expect(metrics.netDirection).toBe("inflow");
    expect(metrics.depositWithdrawRatio).toBeCloseTo(3.0627, 3);
  });

  it("flags outflow when withdrawals dominate", () => {
    const metrics = computeFlowMetrics({
      depositLastMinuteToman: 0,
      depositLastHourVolumeToman: 1_000,
      withdrawLastMinuteToman: 0,
      withdrawLastHourVolumeToman: 5_000,
      tradeLastMinuteToman: 0,
    });
    expect(metrics.netFlowHourToman).toBe(-4_000);
    expect(metrics.netDirection).toBe("outflow");
    expect(metrics.depositWithdrawRatio).toBeCloseTo(0.2);
  });

  it("returns nulls when source values are missing (no invented numbers)", () => {
    const metrics = computeFlowMetrics({
      depositLastMinuteToman: null,
      depositLastHourVolumeToman: null,
      withdrawLastMinuteToman: null,
      withdrawLastHourVolumeToman: 8_131_599_000,
      tradeLastMinuteToman: null,
    });
    expect(metrics.netFlowHourToman).toBeNull();
    expect(metrics.depositWithdrawRatio).toBeNull();
    expect(metrics.netDirection).toBe("unknown");
  });

  it("guards division by zero withdraw volume", () => {
    const metrics = computeFlowMetrics({
      depositLastMinuteToman: 0,
      depositLastHourVolumeToman: 5_000,
      withdrawLastMinuteToman: 0,
      withdrawLastHourVolumeToman: 0,
      tradeLastMinuteToman: 0,
    });
    expect(metrics.depositWithdrawRatio).toBeNull();
  });
});

describe("correlation normalization", () => {
  it("min-max scales to 0..100", () => {
    expect(normalizeToPercent([1, 2, 3])).toEqual([0, 50, 100]);
    expect(normalizeToPercent([10, 20])).toEqual([0, 100]);
  });

  it("maps constant series to 50", () => {
    expect(normalizeToPercent([7, 7, 7])).toEqual([50, 50, 50]);
  });

  it("handles empty input", () => {
    expect(normalizeToPercent([])).toEqual([]);
  });
});
