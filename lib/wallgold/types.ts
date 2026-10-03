import type { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";
import type { LiveDataSchema, PriceIndicatorSchema, PricesPayloadSchema } from "@/lib/wallgold/schemas";

/** Validated upstream payloads. */
export type LiveData = z.infer<typeof LiveDataSchema>;
export type PriceIndicator = z.infer<typeof PriceIndicatorSchema>;
export type PricesPayload = z.infer<typeof PricesPayloadSchema>;

export type PriceDirection = "high" | "low" | (string & {});

/* -------------------------------------------------------------------------- */
/* Database row shapes (snake_case = PostgreSQL columns)                       */
/* -------------------------------------------------------------------------- */

export interface LiveDataInsert {
  source_updated_at: string;
  valid_until: string | null;
  collected_at: string;
  trade_last_minute_toman: number;
  deposit_last_minute_toman: number;
  deposit_last_hour_volume_toman: number;
  withdraw_last_minute_toman: number;
  withdraw_last_hour_volume_toman: number;
  delivery_last_request_at: string | null;
  delivery_today_count: number | null;
  delivery_last_minute_count: number | null;
  /** Verbatim upstream payload — always the original JSON, never re-serialized. */
  raw_json: Json;
}

export interface PricesInsert {
  source_last_realtime: string;
  source_last_realtime_ts: number;
  collected_at: string;
  /** Verbatim upstream payload — always the original JSON, never re-serialized. */
  raw_json: Json;
}

export interface PriceSnapshotInsert {
  snapshot_id: number;
  collected_at: string;
  symbol: string;
  price: number;
  open: number | null;
  high: number;
  low: number;
  change_amount: number;
  change_percent: number;
  direction: string | null;
  updated_ms: number;
  unit: string;
  divide10: boolean;
  decimals: number;
}
