import { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";
import { LiveDataSchema, PriceIndicatorSchema, PricesPayloadSchema } from "@/lib/wallgold/schemas";
import type {
  LiveData,
  LiveDataInsert,
  PriceIndicator,
  PriceSnapshotInsert,
  PricesInsert,
  PricesPayload,
} from "@/lib/wallgold/types";

/**
 * Validation + normalization layer.
 *
 * - `parseX()`  : unknown JSON -> validated upstream payload (Zod)
 * - `normalizeX()`: validated payload -> exact database rows
 *
 * Rules honored here:
 * - raw source JSON is carried through untouched into `raw_json`
 * - `divide10` / `decimals` are NEVER applied to stored values; they are only
 *   used by display helpers (`toDisplayPrice` in lib/format.ts)
 * - unknown indicator keys are preserved (the symbol list is dynamic)
 */

export interface ParseFailure {
  ok: false;
  error: string;
  issues: string[];
}

export interface LiveDataParseResult {
  ok: boolean;
  data?: LiveData;
  /** The original, unmodified response — stored verbatim as raw_json. */
  raw?: unknown;
  error?: string;
  issues?: string[];
}

export interface PricesParseResult {
  ok: boolean;
  data?: PricesPayload;
  raw?: unknown;
  /** Symbols whose individual payload failed validation (kept out of normalized tables). */
  invalidSymbols?: Record<string, string>;
  error?: string;
  issues?: string[];
}

function formatIssues(error: z.ZodError, limit = 8): string[] {
  return error.issues
    .slice(0, limit)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

/**
 * Validate `livedata.json`.
 * The full original payload is returned alongside the parsed data so callers
 * can persist it verbatim.
 */
export function parseLiveData(input: unknown): LiveDataParseResult {
  const result = LiveDataSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      error: "livedata_schema_mismatch",
      issues: formatIssues(result.error),
      raw: input,
    };
  }
  return { ok: true, data: result.data, raw: input };
}

/**
 * Validate `prices.json`.
 *
 * The envelope (metadata + indicator map container) must be valid, but each
 * indicator is validated individually so one malformed indicator only skips
 * that symbol instead of discarding the whole snapshot. The raw payload is
 * always available for persistence.
 */
export function parsePrices(input: unknown): PricesParseResult {
  const envelope = PricesPayloadSchema.omit({ indicators: true }).safeParse(input);
  if (!envelope.success) {
    return {
      ok: false,
      error: "prices_schema_mismatch",
      issues: formatIssues(envelope.error),
      raw: input,
    };
  }

  const indicators = z.record(z.string(), z.unknown()).safeParse(
    (input as { indicators?: unknown } | null)?.indicators,
  );
  if (!indicators.success) {
    return {
      ok: false,
      error: "prices_indicators_not_a_map",
      issues: formatIssues(indicators.error),
      raw: input,
    };
  }

  const valid: Record<string, PriceIndicator> = {};
  const invalidSymbols: Record<string, string> = {};

  for (const [symbol, value] of Object.entries(indicators.data)) {
    const parsed = PriceIndicatorSchema.safeParse(value);
    if (parsed.success) {
      valid[symbol] = parsed.data;
    } else {
      const issues = formatIssues(parsed.error, 3);
      invalidSymbols[symbol] = issues.join("; ");
    }
  }

  return {
    ok: true,
    data: { ...envelope.data, indicators: valid } as PricesPayload,
    raw: input,
    invalidSymbols,
  };
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */

/**
 * PostgreSQL `bigint` columns are fed with integers. Source volumes are toman
 * amounts (integral by definition); a stray fractional value is rounded for
 * the numeric column only — the exact original remains in `raw_json`.
 */
function toBigintValue(value: number): number {
  return Number.isInteger(value) ? value : Math.round(value);
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Validated live data -> `wallgold_livedata` insert row. */
export function normalizeLiveData(
  data: LiveData,
  collectedAt: Date,
  raw: unknown = data,
): LiveDataInsert {
  return {
    source_updated_at: new Date(data.updatedAt).toISOString(),
    valid_until: toIsoOrNull(data.validUntil),
    collected_at: collectedAt.toISOString(),
    trade_last_minute_toman: toBigintValue(data.trade.lastMinuteToman),
    deposit_last_minute_toman: toBigintValue(data.deposit.lastMinuteToman),
    deposit_last_hour_volume_toman: toBigintValue(data.deposit.lastHourVolumeToman),
    withdraw_last_minute_toman: toBigintValue(data.withdraw.lastMinuteToman),
    withdraw_last_hour_volume_toman: toBigintValue(data.withdraw.lastHourVolumeToman),
    delivery_last_request_at: toIsoOrNull(data.delivery?.lastRequestAt),
    delivery_today_count: data.delivery ? toBigintValue(data.delivery.todayCount) : null,
    delivery_last_minute_count: data.delivery
      ? toBigintValue(data.delivery.lastMinuteCount)
      : null,
    // Payloads originate from JSON.parse — Json by construction.
    raw_json: raw as Json,
  };
}

/** A normalized price row before its `snapshot_id` foreign key is known. */
export type PriceSnapshotDraft = Omit<PriceSnapshotInsert, "snapshot_id">;

export interface NormalizedPrices {
  snapshot: PricesInsert;
  /** One row per valid indicator — including symbols we don't recognize. */
  snapshotRows: PriceSnapshotDraft[];
}

/** Validated prices payload -> `wallgold_prices` + `wallgold_price_snapshots` rows. */
export function normalizePrices(
  data: PricesPayload,
  collectedAt: Date,
  raw: unknown = data,
): NormalizedPrices {
  const snapshot: PricesInsert = {
    source_last_realtime: data.last_realtime,
    source_last_realtime_ts: data.last_realtime_ts,
    collected_at: collectedAt.toISOString(),
    // Payloads originate from JSON.parse — Json by construction.
    raw_json: raw as Json,
  };

  const snapshotRows: PriceSnapshotDraft[] = Object.entries(data.indicators).flatMap(
    ([symbol, indicator]) => {
      if (indicator === null || indicator === undefined) return [];
      return [
        {
          collected_at: collectedAt.toISOString(),
          symbol,
          // Preserved exactly as provided — no divide10/decimals applied.
          price: indicator.price,
          open: indicator.open,
          high: indicator.high,
          low: indicator.low,
          change_amount: indicator.change_amount,
          change_percent: indicator.change_percent,
          direction: indicator.direction,
          updated_ms: indicator.updated_ms,
          unit: indicator.unit,
          divide10: indicator.divide10,
          decimals: indicator.decimals,
        } satisfies PriceSnapshotDraft,
      ];
    },
  );

  return { snapshot, snapshotRows };
}
