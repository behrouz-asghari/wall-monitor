/**
 * Hand-written Supabase `Database` types.
 *
 * These mirror supabase/migrations/*.sql exactly. If a migration changes the
 * schema, update this file in the same commit (or regenerate with
 * `supabase gen types typescript --local` once the CLI is available).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Row returned by `wallgold_price_series`. */
export interface PriceSeriesRow {
  bucket: string;
  price: number;
  open: number | null;
  high: number;
  low: number;
  change_amount: number;
  change_percent: number;
  direction: string | null;
  unit: string;
  divide10: boolean;
  decimals: number;
  samples: number;
}

/** Row returned by `wallgold_flow_series`. */
export interface FlowSeriesRow {
  bucket: string;
  trade_last_minute_toman: number;
  deposit_last_minute_toman: number;
  deposit_last_hour_volume_toman: number;
  withdraw_last_minute_toman: number;
  withdraw_last_hour_volume_toman: number;
  net_flow_hour_toman: number;
  samples: number;
}

/** Row returned by `wallgold_missing_intervals`. */
export interface MissingIntervalRow {
  missing_at: string;
}

/** Row returned by `wallgold_collection_stats`. */
export interface CollectionStatsRow {
  total_runs: number;
  last_run_at: string | null;
  last_success_at: string | null;
  failed_runs_24h: number;
  duplicate_runs_24h: number;
  price_snapshots: number;
  price_payloads: number;
  livedata_snapshots: number;
  last_collected_at: string | null;
  last_source_updated_at: string | null;
  last_price_source_ts: number | null;
}

export interface Database {
  public: {
    Tables: {
      wallgold_livedata: {
        Row: {
          id: number;
          source_updated_at: string;
          valid_until: string | null;
          collected_at: string;
          trade_last_minute_toman: number | null;
          deposit_last_minute_toman: number | null;
          deposit_last_hour_volume_toman: number | null;
          withdraw_last_minute_toman: number | null;
          withdraw_last_hour_volume_toman: number | null;
          delivery_last_request_at: string | null;
          delivery_today_count: number | null;
          delivery_last_minute_count: number | null;
          raw_json: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          source_updated_at: string;
          valid_until?: string | null;
          collected_at?: string;
          trade_last_minute_toman?: number | null;
          deposit_last_minute_toman?: number | null;
          deposit_last_hour_volume_toman?: number | null;
          withdraw_last_minute_toman?: number | null;
          withdraw_last_hour_volume_toman?: number | null;
          delivery_last_request_at?: string | null;
          delivery_today_count?: number | null;
          delivery_last_minute_count?: number | null;
          raw_json: Json;
          created_at?: string;
        };
        Update: Partial<{
          id: number;
          source_updated_at: string;
          valid_until: string | null;
          collected_at: string;
          trade_last_minute_toman: number | null;
          deposit_last_minute_toman: number | null;
          deposit_last_hour_volume_toman: number | null;
          withdraw_last_minute_toman: number | null;
          withdraw_last_hour_volume_toman: number | null;
          delivery_last_request_at: string | null;
          delivery_today_count: number | null;
          delivery_last_minute_count: number | null;
          raw_json: Json;
          created_at: string;
        }>;
        Relationships: [];
      };
      wallgold_prices: {
        Row: {
          id: number;
          source_last_realtime: string | null;
          source_last_realtime_ts: number;
          collected_at: string;
          raw_json: Json;
          created_at: string;
        };
        Insert: {
          id?: number;
          source_last_realtime?: string | null;
          source_last_realtime_ts: number;
          collected_at?: string;
          raw_json: Json;
          created_at?: string;
        };
        Update: Partial<{
          id: number;
          source_last_realtime: string | null;
          source_last_realtime_ts: number;
          collected_at: string;
          raw_json: Json;
          created_at: string;
        }>;
        Relationships: [];
      };
      wallgold_price_snapshots: {
        Row: {
          id: number;
          snapshot_id: number;
          collected_at: string;
          symbol: string;
          price: number;
          open: number | null;
          high: number;
          low: number;
          change_amount: number | null;
          change_percent: number | null;
          direction: string | null;
          updated_ms: number | null;
          unit: string | null;
          divide10: boolean;
          decimals: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          snapshot_id: number;
          collected_at?: string;
          symbol: string;
          price: number;
          open?: number | null;
          high?: number | null;
          low?: number | null;
          change_amount?: number | null;
          change_percent?: number | null;
          direction?: string | null;
          updated_ms?: number | null;
          unit?: string | null;
          divide10?: boolean;
          decimals?: number;
          created_at?: string;
        };
        Update: Partial<{
          id: number;
          snapshot_id: number;
          collected_at: string;
          symbol: string;
          price: number;
          open: number | null;
          high: number | null;
          low: number | null;
          change_amount: number | null;
          change_percent: number | null;
          direction: string | null;
          updated_ms: number | null;
          unit: string | null;
          divide10: boolean;
          decimals: number;
          created_at: string;
        }>;
        Relationships: [
          {
            foreignKeyName: "wallgold_price_snapshots_snapshot_id_fkey";
            columns: ["snapshot_id"];
            referencedRelation: "wallgold_prices";
            referencedColumns: ["id"];
          },
        ];
      };
      wallgold_collection_runs: {
        Row: {
          id: number;
          started_at: string;
          finished_at: string | null;
          duration_ms: number | null;
          status: string;
          live_ok: boolean;
          live_inserted: boolean;
          prices_ok: boolean;
          prices_inserted: boolean;
          error: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          started_at: string;
          finished_at?: string | null;
          duration_ms?: number | null;
          status: string;
          live_ok?: boolean;
          live_inserted?: boolean;
          prices_ok?: boolean;
          prices_inserted?: boolean;
          error?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: Partial<{
          id: number;
          started_at: string;
          finished_at: string | null;
          duration_ms: number | null;
          status: string;
          live_ok: boolean;
          live_inserted: boolean;
          prices_ok: boolean;
          prices_inserted: boolean;
          error: string | null;
          details: Json | null;
          created_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      wallgold_price_series: {
        Args: {
          p_symbol: string;
          p_from: string;
          p_to: string;
          p_bucket?: string;
        };
        Returns: PriceSeriesRow[];
      };
      wallgold_flow_series: {
        Args: {
          p_from: string;
          p_to: string;
          p_bucket?: string;
        };
        Returns: FlowSeriesRow[];
      };
      wallgold_missing_intervals: {
        Args: {
          p_from: string;
          p_to: string;
          p_step?: string;
        };
        Returns: MissingIntervalRow[];
      };
      wallgold_collection_stats: {
        Args: Record<string, never>;
        Returns: CollectionStatsRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
