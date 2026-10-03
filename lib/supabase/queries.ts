import { symbolLabel } from "@/lib/constants";
import { toDisplayPrice } from "@/lib/format";
import { computeFlowMetrics, resolveTimeRange, type ResolvedTimeRange } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import type {
  FlowSeriesRow,
  MissingIntervalRow,
  PriceSeriesRow,
} from "@/lib/supabase/database.types";

/**
 * Server-side query layer.
 *
 * UI components never talk to Supabase directly — they call these functions.
 * All heavy lifting (aggregation, gap detection, counters) happens inside
 * Postgres so the dashboard downloads only the rows it needs.
 *
 * All functions are read paths and use the public anon key; the service-role
 * key is reserved for the collector.
 */

export class QueryError extends Error {
  readonly operation: string;

  constructor(operation: string, message: string, options?: { cause?: unknown }) {
    super(`[${operation}] ${message}`, options);
    this.name = "QueryError";
    this.operation = operation;
  }
}

function fail(operation: string, message: string): never {
  throw new QueryError(operation, message);
}

/* -------------------------------------------------------------------------- */
/* Latest market data                                                          */
/* -------------------------------------------------------------------------- */

export interface LatestPriceItem {
  symbol: string;
  label: string;
  /** Exact stored source value (never mutated). */
  price: number;
  /** Presentation value: divide10 / decimals applied (display only). */
  displayPrice: number;
  open: number | null;
  high: number | null;
  low: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  /** Source-provided direction ("high" | "low" | null) — never invented. */
  direction: string | null;
  unit: string | null;
  divide10: boolean;
  decimals: number;
  updatedAt: string | null;
  collectedAt: string;
}

export interface LatestPricesResult {
  snapshotId: number;
  collectedAt: string;
  sourceLastRealtime: string | null;
  sourceLastRealtimeTs: number;
  items: LatestPriceItem[];
}

/** Latest price snapshot: every indicator, including unknown symbols. */
export async function getLatestPrices(): Promise<LatestPricesResult | null> {
  const db = createServerSupabaseClient();

  const { data: latest, error: latestError } = await db
    .from("wallgold_prices")
    .select("id, collected_at, source_last_realtime, source_last_realtime_ts")
    .order("source_last_realtime_ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) fail("getLatestPrices", latestError.message);
  if (!latest) return null;

  const { data: rows, error: rowsError } = await db
    .from("wallgold_price_snapshots")
    .select(
      "symbol, price, open, high, low, change_amount, change_percent, direction, updated_ms, unit, divide10, decimals, collected_at",
    )
    .eq("snapshot_id", latest.id)
    .order("symbol", { ascending: true });

  if (rowsError) fail("getLatestPrices", rowsError.message);

  const items: LatestPriceItem[] = (rows ?? []).map((row) => ({
    symbol: row.symbol,
    label: symbolLabel(row.symbol),
    price: row.price,
    displayPrice: toDisplayPrice(row.price, row.divide10, row.decimals),
    open: row.open,
    high: row.high,
    low: row.low,
    changeAmount: row.change_amount,
    changePercent: row.change_percent,
    direction: row.direction,
    unit: row.unit,
    divide10: row.divide10,
    decimals: row.decimals,
    updatedAt: row.updated_ms ? new Date(row.updated_ms).toISOString() : null,
    collectedAt: row.collected_at,
  }));

  return {
    snapshotId: latest.id,
    collectedAt: latest.collected_at,
    sourceLastRealtime: latest.source_last_realtime,
    sourceLastRealtimeTs: latest.source_last_realtime_ts,
    items,
  };
}

/* -------------------------------------------------------------------------- */
/* Price history                                                               */
/* -------------------------------------------------------------------------- */

export interface PricePoint {
  /** Bucket start (UTC ISO). */
  t: string;
  /** Raw source value for the bucket. */
  price: number;
  /** Display value (divide10/decimals applied). */
  displayPrice: number;
  changePercent: number | null;
  direction: string | null;
  samples: number;
}

export interface PriceSeriesResult {
  symbol: string;
  label: string;
  from: string;
  to: string;
  bucket: ResolvedTimeRange["bucket"];
  unit: string;
  divide10: boolean;
  decimals: number;
  points: PricePoint[];
}

/**
 * Aggregated price history for one symbol.
 * Resolution follows the range: 1H..24H raw/minute, 3D/7D hourly, 30D daily.
 */
export async function getPriceHistory(
  symbol: string,
  range: ResolvedTimeRange,
): Promise<PriceSeriesResult> {
  const db = createServerSupabaseClient();

  const { data, error } = await db.rpc("wallgold_price_series", {
    p_symbol: symbol,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_bucket: range.bucket,
  });

  if (error) fail("getPriceHistory", error.message);

  const rows: PriceSeriesRow[] = data ?? [];
  const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const divide10 = last?.divide10 ?? false;
  const decimals = last?.decimals ?? 0;
  const unit = last?.unit ?? "";

  return {
    symbol,
    label: symbolLabel(symbol),
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    bucket: range.bucket,
    unit,
    divide10,
    decimals,
    points: rows.map((row) => ({
      t: row.bucket,
      price: row.price,
      displayPrice: toDisplayPrice(row.price, divide10, decimals),
      changePercent: row.change_percent,
      direction: row.direction,
      samples: row.samples,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Live data / flows                                                           */
/* -------------------------------------------------------------------------- */

export interface LatestLiveDataResult {
  id: number;
  sourceUpdatedAt: string;
  validUntil: string | null;
  collectedAt: string;
  tradeLastMinuteToman: number | null;
  depositLastMinuteToman: number | null;
  depositLastHourVolumeToman: number | null;
  withdrawLastMinuteToman: number | null;
  withdrawLastHourVolumeToman: number | null;
  deliveryLastRequestAt: string | null;
  deliveryTodayCount: number | null;
  deliveryLastMinuteCount: number | null;
  /** Derived at query time — net flow, ratio, direction. Never stored. */
  metrics: ReturnType<typeof computeFlowMetrics>;
}

export async function getLatestLiveData(): Promise<LatestLiveDataResult | null> {
  const db = createServerSupabaseClient();

  const { data, error } = await db
    .from("wallgold_livedata")
    .select(
      "id, source_updated_at, valid_until, collected_at, trade_last_minute_toman, deposit_last_minute_toman, deposit_last_hour_volume_toman, withdraw_last_minute_toman, withdraw_last_hour_volume_toman, delivery_last_request_at, delivery_today_count, delivery_last_minute_count",
    )
    .order("source_updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) fail("getLatestLiveData", error.message);
  if (!data) return null;

  const source = {
    depositLastMinuteToman: data.deposit_last_minute_toman,
    depositLastHourVolumeToman: data.deposit_last_hour_volume_toman,
    withdrawLastMinuteToman: data.withdraw_last_minute_toman,
    withdrawLastHourVolumeToman: data.withdraw_last_hour_volume_toman,
    tradeLastMinuteToman: data.trade_last_minute_toman,
  };

  return {
    id: data.id,
    sourceUpdatedAt: data.source_updated_at,
    validUntil: data.valid_until,
    collectedAt: data.collected_at,
    ...source,
    deliveryLastRequestAt: data.delivery_last_request_at,
    deliveryTodayCount: data.delivery_today_count,
    deliveryLastMinuteCount: data.delivery_last_minute_count,
    metrics: computeFlowMetrics(source),
  };
}

export interface FlowPoint {
  t: string;
  depositHour: number;
  withdrawHour: number;
  /** Derived in SQL at query time: deposit_hour - withdraw_hour. */
  netFlow: number;
  depositMinute: number;
  withdrawMinute: number;
  tradeMinute: number;
}

export interface FlowSeriesResult {
  from: string;
  to: string;
  bucket: ResolvedTimeRange["bucket"];
  points: FlowPoint[];
}

/** Aggregated flow history (deposit / withdraw / net) for the requested range. */
export async function getFlowHistory(range: ResolvedTimeRange): Promise<FlowSeriesResult> {
  const db = createServerSupabaseClient();

  const { data, error } = await db.rpc("wallgold_flow_series", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_bucket: range.bucket,
  });

  if (error) fail("getFlowHistory", error.message);

  const rows: FlowSeriesRow[] = data ?? [];
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    bucket: range.bucket,
    points: rows.map((row) => ({
      t: row.bucket,
      depositHour: row.deposit_last_hour_volume_toman,
      withdrawHour: row.withdraw_last_hour_volume_toman,
      netFlow: row.net_flow_hour_toman,
      depositMinute: row.deposit_last_minute_toman,
      withdrawMinute: row.withdraw_last_minute_toman,
      tradeMinute: row.trade_last_minute_toman,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Health / monitoring                                                         */
/* -------------------------------------------------------------------------- */

export interface CollectorRunRow {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: string;
  liveOk: boolean;
  liveInserted: boolean;
  pricesOk: boolean;
  pricesInserted: boolean;
  error: string | null;
}

export interface CollectorHealth {
  totalRuns: number;
  lastRun: CollectorRunRow | null;
  lastSuccessAt: string | null;
  failedRuns24h: number;
  duplicateRuns24h: number;
  priceSnapshots: number;
  pricePayloads: number;
  livedataSnapshots: number;
  lastCollectedAt: string | null;
  lastSourceUpdatedAt: string | null;
  lastPriceSourceTs: number | null;
  /** Minute slots (ISO) in the last 2 hours where no collector run happened. */
  missingIntervalsLast2h: string[];
  recentRuns: CollectorRunRow[];
}

function mapRun(row: {
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
}): CollectorRunRow {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    status: row.status,
    liveOk: row.live_ok,
    liveInserted: row.live_inserted,
    pricesOk: row.prices_ok,
    pricesInserted: row.prices_inserted,
    error: row.error,
  };
}

/** One round trip for counters + gap detection over the last 2 hours. */
export async function getCollectorHealth(): Promise<CollectorHealth> {
  const db = createServerSupabaseClient();

  const [statsResult, missingResult, runsResult] = await Promise.all([
    db.rpc("wallgold_collection_stats"),
    db.rpc("wallgold_missing_intervals", {
      p_from: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      p_to: new Date().toISOString(),
      p_step: "1 minute",
    }),
    db
      .from("wallgold_collection_runs")
      .select(
        "id, started_at, finished_at, duration_ms, status, live_ok, live_inserted, prices_ok, prices_inserted, error",
      )
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  if (statsResult.error) fail("getCollectorHealth", statsResult.error.message);
  if (missingResult.error) fail("getCollectorHealth", missingResult.error.message);
  if (runsResult.error) fail("getCollectorHealth", runsResult.error.message);

  const stats = (statsResult.data ?? [])[0];
  const runs = (runsResult.data ?? []).map(mapRun);

  return {
    totalRuns: stats?.total_runs ?? 0,
    lastRun: runs[0] ?? null,
    lastSuccessAt: stats?.last_success_at ?? null,
    failedRuns24h: stats?.failed_runs_24h ?? 0,
    duplicateRuns24h: stats?.duplicate_runs_24h ?? 0,
    priceSnapshots: stats?.price_snapshots ?? 0,
    pricePayloads: stats?.price_payloads ?? 0,
    livedataSnapshots: stats?.livedata_snapshots ?? 0,
    lastCollectedAt: stats?.last_collected_at ?? null,
    lastSourceUpdatedAt: stats?.last_source_updated_at ?? null,
    lastPriceSourceTs: stats?.last_price_source_ts ?? null,
    missingIntervalsLast2h: (missingResult.data ?? []).map(
      (row: MissingIntervalRow) => row.missing_at,
    ),
    recentRuns: runs,
  };
}

/** Total normalized snapshot rows (§23 "number of snapshots"). */
export async function getSnapshotCount(): Promise<number> {
  const db = createServerSupabaseClient();
  const { count, error } = await db
    .from("wallgold_price_snapshots")
    .select("id", { count: "exact", head: true });

  if (error) fail("getSnapshotCount", error.message);
  return count ?? 0;
}

/** Missing collector slots for an arbitrary window (health page detail). */
export async function getMissingIntervals(from: Date, to: Date): Promise<string[]> {
  const db = createServerSupabaseClient();
  const { data, error } = await db.rpc("wallgold_missing_intervals", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_step: "1 minute",
  });

  if (error) fail("getMissingIntervals", error.message);
  return (data ?? []).map((row: MissingIntervalRow) => row.missing_at);
}

/* -------------------------------------------------------------------------- */
/* Paginated tables                                                            */
/* -------------------------------------------------------------------------- */

export interface Paginated<T> {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PriceTableRow {
  id: number;
  collectedAt: string;
  price: number;
  displayPrice: number;
  changePercent: number | null;
  direction: string | null;
  unit: string | null;
  divide10: boolean;
  decimals: number;
}

export interface PriceTableOptions {
  symbol: string;
  range: ResolvedTimeRange;
  page?: number;
  pageSize?: number;
}

/** Server-side paginated price rows for one symbol + range. */
export async function getPriceTablePage(options: PriceTableOptions): Promise<Paginated<PriceTableRow>> {
  const db = createServerSupabaseClient();
  const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 200);
  const page = Math.max(options.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  const { data, count, error } = await db
    .from("wallgold_price_snapshots")
    .select(
      "id, collected_at, price, change_percent, direction, unit, divide10, decimals",
      { count: "exact" },
    )
    .eq("symbol", options.symbol)
    .gte("collected_at", options.range.from.toISOString())
    .lte("collected_at", options.range.to.toISOString())
    .order("collected_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) fail("getPriceTablePage", error.message);

  const total = count ?? 0;
  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      collectedAt: row.collected_at,
      price: row.price,
      displayPrice: toDisplayPrice(row.price, row.divide10, row.decimals),
      changePercent: row.change_percent,
      direction: row.direction,
      unit: row.unit,
      divide10: row.divide10,
      decimals: row.decimals,
    })),
    count: total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface RawSnapshotRow {
  id: number;
  collectedAt: string;
  sourceLastRealtime: string | null;
  sourceLastRealtimeTs: number;
}

/** Paginated raw `wallgold_prices` payloads (data integrity inspection). */
export async function getRawSnapshotsPage(
  page = 1,
  pageSize = 20,
): Promise<Paginated<RawSnapshotRow>> {
  const db = createServerSupabaseClient();
  const size = Math.min(Math.max(pageSize, 1), 100);
  const current = Math.max(page, 1);
  const from = (current - 1) * size;

  const { data, count, error } = await db
    .from("wallgold_prices")
    .select("id, collected_at, source_last_realtime, source_last_realtime_ts", {
      count: "exact",
    })
    .order("collected_at", { ascending: false })
    .range(from, from + size - 1);

  if (error) fail("getRawSnapshotsPage", error.message);

  const total = count ?? 0;
  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      collectedAt: row.collected_at,
      sourceLastRealtime: row.source_last_realtime,
      sourceLastRealtimeTs: row.source_last_realtime_ts,
    })),
    count: total,
    page: current,
    pageSize: size,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}

/** Convenience re-export so pages share one import site. */
export { resolveTimeRange };
