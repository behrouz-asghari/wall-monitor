import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import {
  TIME_RANGES,
  type TimeBucket,
  type TimeRangeKey,
  type TimeRangeMeta,
} from "@/lib/constants";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/* Time ranges                                                                 */
/* -------------------------------------------------------------------------- */

export function isTimeRangeKey(value: string): value is TimeRangeKey {
  return Object.prototype.hasOwnProperty.call(TIME_RANGES, value);
}

export interface ResolvedTimeRange {
  key: TimeRangeKey;
  meta: TimeRangeMeta;
  from: Date;
  to: Date;
  bucket: TimeBucket;
}

/**
 * Resolve a range key into an absolute `[from, to]` window plus the SQL
 * aggregation bucket mandated by the performance rules:
 *   1H..24H -> raw/minute, 3D/7D -> hourly, 30D -> daily.
 */
export function resolveTimeRange(key: TimeRangeKey, now: Date = new Date()): ResolvedTimeRange {
  const meta = TIME_RANGES[key];
  return {
    key,
    meta,
    to: now,
    from: new Date(now.getTime() - meta.durationMs),
    bucket: meta.bucket,
  };
}

/** Validate + resolve an untrusted range string (defaults to 24H). */
export function resolveTimeRangeSafe(value: string | undefined | null, now?: Date): ResolvedTimeRange {
  const key = value && isTimeRangeKey(value) ? value : "24H";
  return resolveTimeRange(key, now);
}

/* -------------------------------------------------------------------------- */
/* Flow metrics (derived at query time — never stored)                         */
/* -------------------------------------------------------------------------- */

export interface FlowSourceValues {
  depositLastMinuteToman: number | null;
  depositLastHourVolumeToman: number | null;
  withdrawLastMinuteToman: number | null;
  withdrawLastHourVolumeToman: number | null;
  tradeLastMinuteToman: number | null;
}

export interface FlowMetrics {
  /** net_flow = deposit_last_hour_volume_toman - withdraw_last_hour_volume_toman */
  netFlowHourToman: number | null;
  /** deposit / withdraw ratio over the last hour; null when withdraw is 0/absent. */
  depositWithdrawRatio: number | null;
  /** Positive when net flow is inbound, negative when outbound. */
  netDirection: "inflow" | "outflow" | "flat" | "unknown";
}

/**
 * Derived flow metrics. These are intentionally not persisted — they are
 * reliably computable from the stored source columns at any time.
 */
export function computeFlowMetrics(values: FlowSourceValues): FlowMetrics {
  const depositHour = values.depositLastHourVolumeToman;
  const withdrawHour = values.withdrawLastHourVolumeToman;

  const netFlow =
    depositHour === null || withdrawHour === null ? null : depositHour - withdrawHour;

  const ratio =
    depositHour === null || withdrawHour === null || withdrawHour === 0
      ? null
      : depositHour / withdrawHour;

  const netDirection: FlowMetrics["netDirection"] =
    netFlow === null ? "unknown" : netFlow > 0 ? "inflow" : netFlow < 0 ? "outflow" : "flat";

  return { netFlowHourToman: netFlow, depositWithdrawRatio: ratio, netDirection };
}

/* -------------------------------------------------------------------------- */
/* Correlation normalization                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Min-max normalize a series to 0..100 so series with different units
 * (toman prices, dollar prices, flow volumes) can be compared on a common
 * timeline. A constant series maps to 50 (no variance to express).
 *
 * This expresses co-movement only — it carries no causal or predictive claim.
 */
export function normalizeToPercent(values: readonly number[]): number[] {
  if (values.length === 0) return [];

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return values.map(() => 50);
  }

  const span = max - min;
  return values.map((value) => (Number.isFinite(value) ? ((value - min) / span) * 100 : 50));
}
