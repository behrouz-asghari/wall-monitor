import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { setAdminClientForTesting } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { collectWallGold } from "@/lib/wallgold/collector";
import livedataFixture from "../fixtures/livedata.sample.json";
import pricesFixture from "../fixtures/prices.sample.json";

/**
 * Collector integration tests.
 *
 * WallGold HTTP responses are mocked (automated tests never hit the real
 * upstream), and the Supabase client is replaced with an in-memory fake that
 * records every write so we can assert duplicate handling precisely.
 */

interface FakeState {
  livedataInserted: boolean;
  pricesInserted: boolean;
  existingPriceId: number | null;
  snapshotsInserted: number;
  calls: { table: string; op: string; payload?: unknown; options?: unknown }[];
}

function createFakeAdminClient(state: FakeState): unknown {
  return {
    from(table: string) {
      return {
        upsert(payload: unknown, options?: unknown) {
          return {
            select() {
              state.calls.push({ table, op: "upsert", payload, options });
              if (table === "wallgold_livedata") {
                return Promise.resolve({
                  data: state.livedataInserted ? [{ id: 1 }] : [],
                  error: null,
                });
              }
              if (table === "wallgold_prices") {
                return Promise.resolve({
                  data: state.pricesInserted ? [{ id: 42 }] : [],
                  error: null,
                });
              }
              if (table === "wallgold_price_snapshots") {
                const rows = Array.from({ length: state.snapshotsInserted }, (_, index) => ({
                  id: index + 1,
                }));
                return Promise.resolve({ data: rows, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
        select() {
          state.calls.push({ table, op: "select" });
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: state.existingPriceId !== null ? { id: state.existingPriceId } : null,
                  error: null,
                }),
              };
            },
          };
        },
        insert(payload: unknown) {
          state.calls.push({ table, op: "insert", payload });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Route = "livedata" | "prices" | "missing";
type Behavior = "ok" | "status500" | "status404" | "malformed";

function stubFetch(routes: Partial<Record<Route, Behavior>>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    const route: Route = url.includes("livedata.json")
      ? "livedata"
      : url.includes("prices.json")
        ? "prices"
        : "missing";
    const behavior = routes[route];

    switch (behavior) {
      case "ok":
        return route === "livedata"
          ? jsonResponse(livedataFixture)
          : jsonResponse(pricesFixture);
      case "status500":
        return new Response("upstream exploded", { status: 500 });
      case "status404":
        return new Response("not found", { status: 404 });
      case "malformed":
        return new Response("<html>not json at all</html>", { status: 200 });
      default:
        return new Response("no route", { status: 404 });
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function createLoggerSpy() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function upsertCalls(state: FakeState, table: string) {
  return state.calls.filter((call) => call.table === table && call.op === "upsert");
}

describe("collector (fetch → validate → normalize → insert)", () => {
  let state: FakeState;

  beforeEach(() => {
    state = {
      livedataInserted: true,
      pricesInserted: true,
      existingPriceId: null,
      snapshotsInserted: 0,
      calls: [],
    };
    setAdminClientForTesting(createFakeAdminClient(state) as SupabaseClient<Database>);
  });

  afterEach(() => {
    setAdminClientForTesting(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores both endpoints with ON CONFLICT DO NOTHING and preserves raw JSON", async () => {
    const { fetchMock, calls } = stubFetch({ livedata: "ok", prices: "ok" });
    const logger = createLoggerSpy();

    const result = await collectWallGold({ logger });

    expect(result.success).toBe(true);
    expect(result.collected).toBe(true);
    expect(result.status).toBe("ok");
    expect(result.liveData.ok).toBe(true);
    expect(result.liveData.inserted).toBe(true);
    expect(result.prices.ok).toBe(true);
    expect(result.prices.inserted).toBe(true);
    expect(result.reason).toBeUndefined();

    // Plain server-side GET: no custom headers, no cookies, no referer.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    const init = firstCall[1];
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toBeUndefined();

    // Cache busters generated dynamically:
    expect(calls[0]).toMatch(/livedata\.json\?_wg=\d+/);
    expect(calls[1]).toMatch(/prices\.json\?_=\d+/);

    // Duplicate protection options:
    const liveUpsert = upsertCalls(state, "wallgold_livedata")[0];
    expect(liveUpsert?.options).toMatchObject({
      onConflict: "source_updated_at",
      ignoreDuplicates: true,
    });
    const priceUpsert = upsertCalls(state, "wallgold_prices")[0];
    expect(priceUpsert?.options).toMatchObject({
      onConflict: "source_last_realtime_ts",
      ignoreDuplicates: true,
    });

    // Raw JSON preserved verbatim (content identity — the payload crosses a
    // mocked fetch response, so we compare by value):
    const livePayload = liveUpsert?.payload as { raw_json: unknown };
    expect(livePayload.raw_json).toStrictEqual(livedataFixture);
    const pricePayload = priceUpsert?.payload as { raw_json: unknown };
    expect(pricePayload.raw_json).toStrictEqual(pricesFixture);

    // Normalized rows: one per indicator, values untouched (no divide10 math):
    const snapshotUpsert = upsertCalls(state, "wallgold_price_snapshots")[0];
    expect(snapshotUpsert?.options).toMatchObject({
      onConflict: "snapshot_id,symbol",
      ignoreDuplicates: true,
    });
    const rows = snapshotUpsert?.payload as { snapshot_id: number; symbol: string; price: number }[];
    expect(rows).toHaveLength(Object.keys(pricesFixture.indicators).length);
    expect(rows.every((row) => row.snapshot_id === 42)).toBe(true);
    const geram24 = rows.find((row) => row.symbol === "geram24");
    expect(geram24?.price).toBe(350_265_000);

    // Structured logging events:
    const events = logger.info.mock.calls.map((call) => call[0]);
    expect(events).toContain("collection_started");
    expect(events).toContain("live_data_fetched");
    expect(events).toContain("prices_fetched");
    expect(events).toContain("validation_success");
    expect(events).toContain("database_insert");

    // Run row recorded for cron health:
    const runInsert = state.calls.find(
      (call) => call.table === "wallgold_collection_runs" && call.op === "insert",
    );
    expect(runInsert).toBeDefined();
    expect((runInsert?.payload as { status: string }).status).toBe("ok");
  });

  it("is idempotent: duplicate snapshot returns collected=false with reason", async () => {
    stubFetch({ livedata: "ok", prices: "ok" });
    state.livedataInserted = false; // ON CONFLICT DO NOTHING -> no returned row
    state.pricesInserted = false;
    state.existingPriceId = 42;
    state.snapshotsInserted = 0; // already stored previously
    const logger = createLoggerSpy();

    const result = await collectWallGold({ logger });

    expect(result.success).toBe(true);
    expect(result.collected).toBe(false);
    expect(result.status).toBe("duplicate");
    expect(result.reason).toBe("duplicate_snapshot");
    expect(result.liveData.duplicate).toBe(true);
    expect(result.prices.duplicate).toBe(true);

    // Duplicate payload still resolves the existing row so normalized rows can
    // be back-filled if they were missing (self-healing path).
    expect(state.calls.some((call) => call.table === "wallgold_prices" && call.op === "select")).toBe(
      true,
    );

    const events = logger.info.mock.calls.map((call) => call[0]);
    expect(events).toContain("duplicate_snapshot");

    const runInsert = state.calls.find(
      (call) => call.table === "wallgold_collection_runs" && call.op === "insert",
    );
    expect((runInsert?.payload as { status: string }).status).toBe("duplicate");
  });

  it("back-fills normalized rows when the payload exists but rows are missing", async () => {
    stubFetch({ livedata: "ok", prices: "ok" });
    state.livedataInserted = false;
    state.pricesInserted = false;
    state.existingPriceId = 42;
    state.snapshotsInserted = 10; // self-heal inserted them

    const result = await collectWallGold({ logger: createLoggerSpy() });

    expect(result.collected).toBe(true);
    expect(result.prices.inserted).toBe(true);
    expect(result.prices.rowsInserted).toBe(10);
    expect(result.status).toBe("ok");
  });

  it("keeps the successful endpoint when the other fails (partial success)", async () => {
    stubFetch({ livedata: "ok", prices: "status500" });
    const logger = createLoggerSpy();

    const result = await collectWallGold({ logger });

    expect(result.success).toBe(true);
    expect(result.liveData.ok).toBe(true);
    expect(result.liveData.inserted).toBe(true);
    expect(result.prices.ok).toBe(false);
    expect(result.prices.error).toContain("HTTP 500");
    expect(result.status).toBe("partial");
    expect(result.reason).toBeUndefined();

    // livedata was still persisted:
    expect(upsertCalls(state, "wallgold_livedata")).toHaveLength(1);
    expect(upsertCalls(state, "wallgold_prices")).toHaveLength(0);

    const runInsert = state.calls.find(
      (call) => call.table === "wallgold_collection_runs" && call.op === "insert",
    );
    expect((runInsert?.payload as { status: string }).status).toBe("partial");
  });

  it("retries transient 5xx errors (bounded, not infinite)", async () => {
    const { fetchMock } = stubFetch({ livedata: "ok", prices: "status500" });

    await collectWallGold({ logger: createLoggerSpy() });

    const priceCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("prices.json"),
    );
    expect(priceCalls).toHaveLength(3); // attempt 1 + 500ms + attempt 2 + 1000ms + attempt 3
  });

  it("does not retry obvious 4xx errors", async () => {
    const { fetchMock } = stubFetch({ livedata: "status404", prices: "ok" });

    const result = await collectWallGold({ logger: createLoggerSpy() });

    const liveCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("livedata.json"),
    );
    expect(liveCalls).toHaveLength(1);
    expect(result.liveData.ok).toBe(false);
    expect(result.prices.ok).toBe(true);
    expect(result.status).toBe("partial");
  });

  it("handles malformed JSON gracefully and retries it", async () => {
    const { fetchMock } = stubFetch({ livedata: "malformed", prices: "ok" });
    const logger = createLoggerSpy();

    const result = await collectWallGold({ logger });

    const liveCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("livedata.json"),
    );
    expect(liveCalls).toHaveLength(3); // malformed bodies are transient -> retried
    expect(result.liveData.ok).toBe(false);
    expect(result.liveData.error).toContain("Malformed JSON");
    expect(result.success).toBe(true); // prices still stored
    expect(logger.error.mock.calls.map((call) => call[0])).toContain("collection_failed");
  });

  it("reports total failure when both endpoints fail", async () => {
    stubFetch({ livedata: "status500", prices: "status500" });

    const result = await collectWallGold({ logger: createLoggerSpy() });

    expect(result.success).toBe(false);
    expect(result.collected).toBe(false);
    expect(result.reason).toBe("all_endpoints_failed");
    expect(result.status).toBe("failed");
    expect(result.liveData.error).toContain("HTTP 500");
    expect(result.prices.error).toContain("HTTP 500");
    expect(upsertCalls(state, "wallgold_livedata")).toHaveLength(0);
    expect(upsertCalls(state, "wallgold_prices")).toHaveLength(0);
  });

  it("never logs secrets", async () => {
    stubFetch({ livedata: "ok", prices: "ok" });
    const logger = createLoggerSpy();

    await collectWallGold({ logger });

    const serialized = JSON.stringify({
      info: logger.info.mock.calls,
      warn: logger.warn.mock.calls,
      error: logger.error.mock.calls,
    });
    expect(serialized).not.toMatch(/service_role/i);
    expect(serialized).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(serialized).not.toMatch(/CRON_SECRET/);
    expect(serialized).not.toMatch(/authorization/i);
  });
});
