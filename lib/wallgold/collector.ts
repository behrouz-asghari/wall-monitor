import type { Json } from "@/lib/supabase/database.types";
import { createLogger, type Logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import { fetchLiveData, fetchPrices } from "@/lib/wallgold/client";
import {
  normalizeLiveData,
  normalizePrices,
  parseLiveData,
  parsePrices,
  type PriceSnapshotDraft,
} from "@/lib/wallgold/normalize";

/**
 * Collector orchestration:
 *
 *   fetch  ->  validate (Zod)  ->  normalize  ->  insert snapshot
 *                                          └->  insert normalized price rows
 *
 * Guarantees:
 * - Both endpoints are fetched in parallel and processed independently: if one
 *   fails, the successful one is still stored (partial success).
 * - Every insert is idempotent (`ON CONFLICT DO NOTHING` on the source
 *   timestamps), so a duplicated cron invocation never creates duplicate rows.
 * - When the price payload is a duplicate but normalized rows are missing
 *   (e.g. a previous run crashed between inserts), the rows are self-healed.
 * - Structured logs only: no secrets, headers, cookies or credentials.
 */

export type CollectionStatus = "ok" | "partial" | "duplicate" | "failed";

export interface EndpointOutcome {
  endpoint: "livedata" | "prices";
  /** Fetched + validated successfully. */
  ok: boolean;
  /** At least one new row was written. */
  inserted: boolean;
  /** Upstream data was already stored (no new rows). */
  duplicate: boolean;
  /** Normalized rows actually written (prices only). */
  rowsInserted?: number;
  /** Symbols skipped because their payload failed validation (prices only). */
  invalidSymbols?: Record<string, string>;
  error?: string;
}

export interface CollectionResult {
  /** At least one endpoint succeeded. */
  success: boolean;
  /** At least one row was written this run. */
  collected: boolean;
  status: CollectionStatus;
  reason?: "duplicate_snapshot" | "all_endpoints_failed";
  collectedAt: string;
  durationMs: number;
  liveData: EndpointOutcome;
  prices: EndpointOutcome;
}

export interface CollectOptions {
  /** Injectable clock (tests). */
  collectedAt?: Date;
  /** Injectable logger (tests). */
  logger?: Logger;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/* -------------------------------------------------------------------------- */
/* Per-endpoint processing                                                     */
/* -------------------------------------------------------------------------- */

async function processLiveData(
  settled: PromiseSettledResult<unknown>,
  collectedAt: Date,
  log: Logger,
): Promise<EndpointOutcome> {
  const outcome: EndpointOutcome = { endpoint: "livedata", ok: false, inserted: false, duplicate: false };

  if (settled.status === "rejected") {
    const message = describeError(settled.reason);
    outcome.error = message;
    log.error("collection_failed", { endpoint: "livedata", stage: "fetch", error: message });
    return outcome;
  }

  log.info("live_data_fetched", { bytes: JSON.stringify(settled.value ?? null).length });

  const parsed = parseLiveData(settled.value);
  if (!parsed.ok || !parsed.data) {
    outcome.error = [parsed.error, ...(parsed.issues ?? [])].join(" | ");
    log.error("collection_failed", {
      endpoint: "livedata",
      stage: "validate",
      error: parsed.error,
      issues: parsed.issues ?? [],
    });
    return outcome;
  }

  log.info("validation_success", { endpoint: "livedata" });
  outcome.ok = true;

  try {
    const row = normalizeLiveData(parsed.data, collectedAt, parsed.raw as Json | undefined);
    const db = getAdminClient();

    // ON CONFLICT (source_updated_at) DO NOTHING -> idempotent snapshots.
    const { data, error } = await db
      .from("wallgold_livedata")
      .upsert(row, { onConflict: "source_updated_at", ignoreDuplicates: true })
      .select("id");

    if (error) {
      outcome.error = error.message;
      log.error("collection_failed", {
        endpoint: "livedata",
        stage: "insert",
        error: error.message,
      });
      return outcome;
    }

    outcome.inserted = (data?.length ?? 0) > 0;
    outcome.duplicate = !outcome.inserted;

    if (outcome.inserted) {
      log.info("database_insert", { table: "wallgold_livedata", rows: 1 });
    } else {
      log.info("duplicate_snapshot", { table: "wallgold_livedata" });
    }
  } catch (error) {
    const message = describeError(error);
    outcome.error = message;
    log.error("collection_failed", { endpoint: "livedata", stage: "insert", error: message });
  }

  return outcome;
}

async function processPrices(
  settled: PromiseSettledResult<unknown>,
  collectedAt: Date,
  log: Logger,
): Promise<EndpointOutcome> {
  const outcome: EndpointOutcome = { endpoint: "prices", ok: false, inserted: false, duplicate: false };

  if (settled.status === "rejected") {
    const message = describeError(settled.reason);
    outcome.error = message;
    log.error("collection_failed", { endpoint: "prices", stage: "fetch", error: message });
    return outcome;
  }

  log.info("prices_fetched", { bytes: JSON.stringify(settled.value ?? null).length });

  const parsed = parsePrices(settled.value);
  if (!parsed.ok || !parsed.data) {
    outcome.error = [parsed.error, ...(parsed.issues ?? [])].join(" | ");
    log.error("collection_failed", {
      endpoint: "prices",
      stage: "validate",
      error: parsed.error,
      issues: parsed.issues ?? [],
    });
    return outcome;
  }

  const invalidSymbols = parsed.invalidSymbols ?? {};
  if (Object.keys(invalidSymbols).length > 0) {
    log.warn("validation_partial", {
      endpoint: "prices",
      invalidSymbols: Object.keys(invalidSymbols),
    });
    outcome.invalidSymbols = invalidSymbols;
  }
  log.info("validation_success", {
    endpoint: "prices",
    indicators: Object.keys(parsed.data.indicators).length,
  });
  outcome.ok = true;

  try {
    const { snapshot, snapshotRows } = normalizePrices(
      parsed.data,
      collectedAt,
      parsed.raw as Json | undefined,
    );
    const db = getAdminClient();

    // 1) Raw payload — ON CONFLICT (source_last_realtime_ts) DO NOTHING.
    const { data: insertedPayload, error: payloadError } = await db
      .from("wallgold_prices")
      .upsert(snapshot, { onConflict: "source_last_realtime_ts", ignoreDuplicates: true })
      .select("id");

    if (payloadError) {
      outcome.error = payloadError.message;
      log.error("collection_failed", {
        endpoint: "prices",
        stage: "insert",
        table: "wallgold_prices",
        error: payloadError.message,
      });
      return outcome;
    }

    let snapshotId = insertedPayload?.[0]?.id ?? null;
    const payloadInserted = snapshotId !== null;
    let payloadDuplicate = false;

    // 2) Duplicate payload: locate the existing row so normalized rows can be
    //    back-filled if a previous run inserted the payload but crashed before
    //    inserting the rows (keeps the pipeline self-healing + idempotent).
    if (snapshotId === null) {
      payloadDuplicate = true;
      const { data: existing, error: lookupError } = await db
        .from("wallgold_prices")
        .select("id")
        .eq("source_last_realtime_ts", snapshot.source_last_realtime_ts)
        .maybeSingle();

      if (lookupError) {
        log.warn("duplicate_lookup_failed", {
          endpoint: "prices",
          error: lookupError.message,
        });
      } else {
        snapshotId = existing?.id ?? null;
      }
    }

    // 3) Normalized rows — ON CONFLICT (snapshot_id, symbol) DO NOTHING.
    let rowsInserted = 0;
    if (snapshotId !== null && snapshotRows.length > 0) {
      const rows = snapshotRows.map((row: PriceSnapshotDraft) => ({
        ...row,
        snapshot_id: snapshotId as number,
      }));

      const { data: insertedRows, error: rowsError } = await db
        .from("wallgold_price_snapshots")
        .upsert(rows, { onConflict: "snapshot_id,symbol", ignoreDuplicates: true })
        .select("id");

      if (rowsError) {
        outcome.error = rowsError.message;
        log.error("collection_failed", {
          endpoint: "prices",
          stage: "insert",
          table: "wallgold_price_snapshots",
          error: rowsError.message,
        });
        // The raw payload may still have been written this run.
        outcome.inserted = payloadInserted;
        outcome.duplicate = payloadDuplicate;
        return outcome;
      }

      rowsInserted = insertedRows?.length ?? 0;
    }

    outcome.rowsInserted = rowsInserted;
    outcome.inserted = payloadInserted || rowsInserted > 0;
    outcome.duplicate = !outcome.inserted;

    if (payloadInserted) {
      log.info("database_insert", {
        table: "wallgold_prices",
        rows: 1,
        normalizedRows: rowsInserted,
      });
    } else if (rowsInserted > 0) {
      log.info("database_insert", {
        table: "wallgold_price_snapshots",
        rows: rowsInserted,
        note: "payload_duplicate_backfill",
      });
    } else {
      log.info("duplicate_snapshot", { table: "wallgold_prices" });
    }
  } catch (error) {
    const message = describeError(error);
    outcome.error = message;
    log.error("collection_failed", { endpoint: "prices", stage: "insert", error: message });
  }

  return outcome;
}

/* -------------------------------------------------------------------------- */
/* Run bookkeeping                                                             */
/* -------------------------------------------------------------------------- */

function deriveStatus(live: EndpointOutcome, prices: EndpointOutcome): CollectionStatus {
  const success = live.ok || prices.ok;
  const collected = live.inserted || prices.inserted;
  if (!success) return "failed";
  if (!collected) return "duplicate";
  if (live.ok && prices.ok) return "ok";
  return "partial";
}

/** Persist the run for cron health / gap detection. Best effort by design. */
async function recordRun(
  startedAt: Date,
  finishedAt: Date,
  status: CollectionStatus,
  live: EndpointOutcome,
  prices: EndpointOutcome,
  log: Logger,
): Promise<void> {
  try {
    const db = getAdminClient();
    const errors = [live.error, prices.error].filter(Boolean);

    const { error } = await db.from("wallgold_collection_runs").insert({
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      status,
      live_ok: live.ok,
      live_inserted: live.inserted,
      prices_ok: prices.ok,
      prices_inserted: prices.inserted,
      error: errors.length > 0 ? errors.join(" | ").slice(0, 2000) : null,
      details: {
        live_rows_inserted: live.inserted ? 1 : 0,
        prices_rows_inserted: prices.rowsInserted ?? 0,
        invalid_symbols: Object.keys(prices.invalidSymbols ?? {}),
      } as Json,
    });

    if (error) {
      log.warn("run_log_failed", { error: error.message });
    }
  } catch (error) {
    log.warn("run_log_failed", { error: describeError(error) });
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function collectWallGold(options: CollectOptions = {}): Promise<CollectionResult> {
  const log = options.logger ?? createLogger("collector");
  const startedAt = options.collectedAt ?? new Date();
  const collectedAt = startedAt;

  log.info("collection_started", { collectedAt: collectedAt.toISOString() });

  // Fetch both endpoints concurrently; each is validated and stored
  // independently so one failure never discards the other's data.
  const [liveSettled, pricesSettled] = await Promise.allSettled([
    fetchLiveData(),
    fetchPrices(),
  ]);

  const liveOutcome = await processLiveData(liveSettled, collectedAt, log);
  const pricesOutcome = await processPrices(pricesSettled, collectedAt, log);

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const status = deriveStatus(liveOutcome, pricesOutcome);

  const success = liveOutcome.ok || pricesOutcome.ok;
  const collected = liveOutcome.inserted || pricesOutcome.inserted;

  const result: CollectionResult = {
    success,
    collected,
    status,
    collectedAt: collectedAt.toISOString(),
    durationMs,
    liveData: liveOutcome,
    prices: pricesOutcome,
  };

  if (!success) {
    result.reason = "all_endpoints_failed";
  } else if (!collected) {
    result.reason = "duplicate_snapshot";
  }

  await recordRun(startedAt, finishedAt, status, liveOutcome, pricesOutcome, log);

  log.info("collection_finished", {
    status,
    success,
    collected,
    durationMs,
    liveOk: liveOutcome.ok,
    pricesOk: pricesOutcome.ok,
  });

  return result;
}
