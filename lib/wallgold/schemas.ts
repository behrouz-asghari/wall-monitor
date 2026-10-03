import { z } from "zod";

/**
 * Runtime validation for the two public WallGold JSON endpoints.
 *
 * Design notes:
 * - Every object is `.passthrough()`: unknown *fields* added by WallGold must
 *   never break validation (the full payload is preserved in `raw_json` anyway).
 * - The indicator map is fully dynamic: `z.record` accepts any symbol key, so
 *   new indicators are preserved automatically (we never hard-code the list).
 * - Individual indicators are `.nullable()` at the record level so a single
 *   malformed indicator degrades to "symbol skipped" instead of rejecting the
 *   whole snapshot (see `parsePrices` in normalize.ts).
 */

/** ISO-8601 with offset, e.g. `2026-10-03T10:17:01+00:00` or `...Z`. */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

/** Previous session OHLC block attached to every indicator. */
export const PricePrevSchema = z
  .object({
    close: z.number(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
  })
  .passthrough();

/**
 * A single price indicator.
 *
 * `price` is preserved exactly as provided; `divide10` / `decimals` are the
 * source's own display metadata and are never applied to the stored value.
 */
export const PriceIndicatorSchema = z
  .object({
    price: z.number(),
    open: z.number().nullable(),
    high: z.number(),
    low: z.number(),
    change_amount: z.number(),
    change_percent: z.number(),
    direction: z.string().nullable(),
    updated_ms: z.number(),
    unit: z.string(),
    divide10: z.boolean(),
    decimals: z.number(),
    prev: PricePrevSchema,
  })
  .passthrough();

export type PriceIndicator = z.infer<typeof PriceIndicatorSchema>;

/** Dynamic symbol map — keys are whatever WallGold currently emits. */
export const IndicatorsSchema = z.record(z.string(), PriceIndicatorSchema.nullable());

/** Top-level payload of `prices.json`. */
export const PricesPayloadSchema = z
  .object({
    indicators: IndicatorsSchema,
    last_realtime: z.string().min(1),
    last_realtime_ts: z.number().int(),
    icon_up: z.string().nullish(),
    icon_down: z.string().nullish(),
  })
  .passthrough();

export type PricesPayload = z.infer<typeof PricesPayloadSchema>;

/* -------------------------------------------------------------------------- */
/* livedata.json                                                               */
/* -------------------------------------------------------------------------- */

export const LiveDataDisplaySchema = z
  .object({
    showDepositHourVolume: z.boolean(),
    showWithdrawHourVolume: z.boolean(),
    showDepositLimit: z.boolean(),
    depositDailyLimitToman: z.number(),
    showWithdrawLimit: z.boolean(),
    withdrawDailyLimitToman: z.number(),
  })
  .passthrough();

export const LiveDataSchema = z
  .object({
    source: z.string(),
    updatedAt: IsoDateTimeSchema,
    validUntil: IsoDateTimeSchema.nullable().optional(),
    display: LiveDataDisplaySchema.optional(),
    trade: z
      .object({
        lastMinuteToman: z.number(),
      })
      .passthrough(),
    deposit: z
      .object({
        lastMinuteToman: z.number(),
        lastHourVolumeToman: z.number(),
      })
      .passthrough(),
    withdraw: z
      .object({
        lastMinuteToman: z.number(),
        lastHourVolumeToman: z.number(),
      })
      .passthrough(),
    delivery: z
      .object({
        lastRequestAt: IsoDateTimeSchema.nullable().optional(),
        todayCount: z.number(),
        lastMinuteCount: z.number(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type LiveData = z.infer<typeof LiveDataSchema>;
