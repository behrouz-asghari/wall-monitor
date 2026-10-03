/**
 * In-memory PostgREST-compatible shim — LOCAL DEVELOPMENT / VERIFICATION ONLY.
 *
 * This implements exactly the subset of the PostgREST HTTP API that this
 * application uses (select/insert/upsert with ON CONFLICT semantics, counts,
 * ordering, range, and the four wallgold_* RPC functions), so the complete
 * pipeline can be exercised locally WITHOUT Docker or a Supabase project:
 *
 *   WallGold -> collector -> this shim -> query layer -> dashboard
 *
 * Production always talks to a real Supabase project; this file is never
 * imported by application code (scripts/ is not part of the Next.js bundle).
 *
 *   npm run mock:db          # http://127.0.0.1:54321
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 npm run dev
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.MOCK_POSTGREST_PORT ?? 54321);

type Row = Record<string, unknown>;

interface TableDef {
  name: string;
  /** Unique key used for ON CONFLICT handling. */
  conflictColumns: string[];
}

const TABLES: Record<string, TableDef> = {
  wallgold_livedata: { name: "wallgold_livedata", conflictColumns: ["source_updated_at"] },
  wallgold_prices: { name: "wallgold_prices", conflictColumns: ["source_last_realtime_ts"] },
  wallgold_price_snapshots: {
    name: "wallgold_price_snapshots",
    conflictColumns: ["snapshot_id", "symbol"],
  },
  wallgold_collection_runs: { name: "wallgold_collection_runs", conflictColumns: [] },
};

const storage = {
  wallgold_livedata: [] as Row[],
  wallgold_prices: [] as Row[],
  wallgold_price_snapshots: [] as Row[],
  wallgold_collection_runs: [] as Row[],
};

const idSequence = {
  wallgold_livedata: 1,
  wallgold_prices: 1,
  wallgold_price_snapshots: 1,
  wallgold_collection_runs: 1,
};

function nextId(tableName: string): number {
  const key = tableName as keyof typeof idSequence;
  const current = idSequence[key];
  if (current === undefined) throw new Error(`unknown table ${tableName}`);
  idSequence[key] = current + 1;
  return current;
}

function tableRows(tableName: string): Row[] {
  const rows = storage[tableName as keyof typeof storage];
  if (rows === undefined) throw new Error(`unknown table ${tableName}`);
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function send(res: ServerResponse, status: number, body: string, headers: Row = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Row = {}): void {
  send(res, status, JSON.stringify(payload), headers);
}

function sendError(res: ServerResponse, status: number, message: string, code = "PGRST205"): void {
  sendJson(res, status, { code, message, details: "", hint: "" });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function project(row: Row, select: string | null): Row {
  if (!select || select === "*") return { ...row };
  const columns = select.split(",").map((column) => column.trim());
  const out: Row = {};
  for (const column of columns) {
    if (column in row) out[column] = row[column];
  }
  return out;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matchesFilter(value: unknown, filter: string): boolean {
  const prefixes = ["eq.", "gte.", "lte.", "gt.", "lt.", "neq."] as const;
  for (const prefix of prefixes) {
    if (filter.startsWith(prefix)) {
      const expected = decodeURIComponent(filter.slice(prefix.length));
      const actual = value === null || value === undefined ? "" : String(value);
      const actualNum = Number(actual);
      const expectedNum = Number(expected);
      const bothNumeric = Number.isFinite(actualNum) && Number.isFinite(expectedNum) && expected !== "";
      switch (prefix) {
        case "eq.":
          return bothNumeric ? actualNum === expectedNum : actual === expected;
        case "neq.":
          return bothNumeric ? actualNum !== expectedNum : actual !== expected;
        case "gte.":
          return bothNumeric ? actualNum >= expectedNum : actual >= expected;
        case "lte.":
          return bothNumeric ? actualNum <= expectedNum : actual <= expected;
        case "gt.":
          return bothNumeric ? actualNum > expectedNum : actual > expected;
        case "lt.":
          return bothNumeric ? actualNum < expectedNum : actual < expected;
      }
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* RPC implementations (in-memory mirrors of the SQL functions)                */
/* -------------------------------------------------------------------------- */

type Bucket = "minute" | "hour" | "day";

function floorToBucket(iso: string, bucket: Bucket): string {
  const date = new Date(iso);
  if (bucket === "minute") date.setUTCSeconds(0, 0);
  else if (bucket === "hour") date.setUTCMinutes(0, 0, 0);
  else date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function roundAvg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rpcPriceSeries(args: Record<string, unknown>): Row[] {
  const symbol = String(args.p_symbol);
  const from = String(args.p_from);
  const to = String(args.p_to);
  const bucket = (String(args.p_bucket ?? "minute") || "minute") as Bucket;

  const rows = storage.wallgold_price_snapshots
    .filter((row) => row.symbol === symbol && String(row.collected_at) >= from && String(row.collected_at) <= to)
    .sort((a, b) => String(a.collected_at).localeCompare(String(b.collected_at)));

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = floorToBucket(String(row.collected_at), bucket);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketIso, group]) => {
      const latest = group[group.length - 1] as Row;
      return {
        bucket: bucketIso,
        price: latest.price,
        open: latest.open ?? null,
        high: Math.max(...group.map((row) => Number(row.high))),
        low: Math.min(...group.map((row) => Number(row.low))),
        change_amount: latest.change_amount,
        change_percent: latest.change_percent,
        direction: latest.direction ?? null,
        unit: latest.unit ?? "",
        divide10: latest.divide10 ?? false,
        decimals: latest.decimals ?? 0,
        samples: group.length,
      };
    });
}

function rpcFlowSeries(args: Record<string, unknown>): Row[] {
  const from = String(args.p_from);
  const to = String(args.p_to);
  const bucket = (String(args.p_bucket ?? "minute") || "minute") as Bucket;

  const rows = storage.wallgold_livedata
    .filter((row) => String(row.collected_at) >= from && String(row.collected_at) <= to)
    .sort((a, b) => String(a.collected_at).localeCompare(String(b.collected_at)));

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = floorToBucket(String(row.collected_at), bucket);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketIso, group]) => {
      const depositHour = roundAvg(group.map((row) => Number(row.deposit_last_hour_volume_toman ?? 0)));
      const withdrawHour = roundAvg(group.map((row) => Number(row.withdraw_last_hour_volume_toman ?? 0)));
      return {
        bucket: bucketIso,
        trade_last_minute_toman: roundAvg(group.map((row) => Number(row.trade_last_minute_toman ?? 0))),
        deposit_last_minute_toman: roundAvg(group.map((row) => Number(row.deposit_last_minute_toman ?? 0))),
        deposit_last_hour_volume_toman: depositHour,
        withdraw_last_minute_toman: roundAvg(group.map((row) => Number(row.withdraw_last_minute_toman ?? 0))),
        withdraw_last_hour_volume_toman: withdrawHour,
        net_flow_hour_toman: depositHour - withdrawHour,
        samples: group.length,
      };
    });
}

function rpcMissingIntervals(args: Record<string, unknown>): Row[] {
  const from = new Date(String(args.p_from));
  const to = new Date(String(args.p_to));

  const actual = new Set(
    storage.wallgold_collection_runs
      .filter((row) => String(row.started_at) >= from.toISOString() && String(row.started_at) <= to.toISOString())
      .map((row) => floorToBucket(String(row.started_at), "minute")),
  );

  const missing: Row[] = [];
  for (let cursor = floorToBucket(from.toISOString(), "minute"); cursor <= to.toISOString(); ) {
    if (!actual.has(cursor)) missing.push({ missing_at: cursor });
    const next = new Date(cursor);
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    cursor = next.toISOString();
    if (missing.length >= 5000) break;
  }
  return missing;
}

function rpcCollectionStats(): Row[] {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const runs = storage.wallgold_collection_runs;
  const successStatuses = new Set(["ok", "partial", "duplicate"]);

  const max = (rows: Row[], column: string): string | number | null => {
    let best: string | number | null = null;
    for (const row of rows) {
      const value = row[column];
      if (typeof value !== "string" && typeof value !== "number") continue;
      if (best === null || compareValues(value, best) > 0) best = value;
    }
    return best;
  };

  const successRuns = runs.filter((row) => successStatuses.has(String(row.status)));

  return [
    {
      total_runs: runs.length,
      last_run_at: max(runs, "started_at"),
      last_success_at: max(successRuns, "finished_at"),
      failed_runs_24h: runs.filter((row) => row.status === "failed" && String(row.started_at) >= dayAgo).length,
      duplicate_runs_24h: runs.filter((row) => row.status === "duplicate" && String(row.started_at) >= dayAgo).length,
      price_snapshots: storage.wallgold_price_snapshots.length,
      price_payloads: storage.wallgold_prices.length,
      livedata_snapshots: storage.wallgold_livedata.length,
      last_collected_at: max(storage.wallgold_prices, "collected_at"),
      last_source_updated_at: max(storage.wallgold_livedata, "source_updated_at"),
      last_price_source_ts: max(storage.wallgold_prices, "source_last_realtime_ts"),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Request handlers                                                            */
/* -------------------------------------------------------------------------- */

function handleSelect(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  table: TableDef,
): void {
  const rows = tableRows(table.name);
  const searchParams = url.searchParams;

  let result = [...rows];
  for (const [key, value] of searchParams.entries()) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    result = result.filter((row) => matchesFilter(row[key], value));
  }

  const total = result.length;

  const order = searchParams.get("order");
  if (order) {
    const segments = order.split(",").map((segment) => segment.trim());
    result.sort((a, b) => {
      for (const segment of segments) {
        const [columnAndDir] = segment.split(".");
        const descending = segment.includes(".desc");
        const cmp = compareValues(a[columnAndDir as string], b[columnAndDir as string]);
        if (cmp !== 0) return descending ? -cmp : cmp;
      }
      return 0;
    });
  }

  const offset = Number(searchParams.get("offset") ?? 0);
  const limitParam = searchParams.get("limit");
  if (offset > 0) result = result.slice(offset);
  if (limitParam !== null) result = result.slice(0, Number(limitParam));

  const select = searchParams.get("select");
  const projected = result.map((row) => project(row, select));

  const prefer = String(req.headers.prefer ?? "");
  const countExact = prefer.includes("count=exact");
  const headers: Row = {};
  if (countExact) {
    headers["content-range"] =
      req.method === "HEAD"
        ? `*/${total}`
        : `${offset}-${offset + Math.max(result.length - 1, 0)}/${total}`;
  }

  if (req.method === "HEAD") {
    res.writeHead(200, { "content-type": "application/json", ...headers });
    res.end();
    return;
  }
  sendJson(res, 200, projected, headers);
}

function handleWrite(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  table: TableDef,
  body: unknown,
): void {
  if (body === null || body === undefined) {
    sendError(res, 400, "Request body required", "PGRST102");
    return;
  }

  const incoming = Array.isArray(body) ? (body as Row[]) : [body as Row];
  const prefer = String(req.headers.prefer ?? "");
  const wantsRepresentation = prefer.includes("return=representation");
  const ignoreDuplicates = prefer.includes("resolution=ignore-duplicates");
  const onConflict = url.searchParams.get("on_conflict");
  const conflictColumns = onConflict ? onConflict.split(",") : table.conflictColumns;

  const inserted: Row[] = [];
  for (const candidate of incoming) {
    const row: Row = { ...candidate };

    if (ignoreDuplicates && conflictColumns.length > 0) {
      const conflicts = tableRows(table.name).some((existing) =>
        conflictColumns.every((column) => String(existing[column]) === String(row[column])),
      );
      if (conflicts) continue; // ON CONFLICT DO NOTHING
    }

    row.id = nextId(table.name);
    row.created_at ??= new Date().toISOString();
    tableRows(table.name).push(row);
    inserted.push(row);
  }

  if (wantsRepresentation) {
    const select = url.searchParams.get("select");
    sendJson(res, 201, inserted.map((row) => project(row, select)));
  } else {
    send(res, 201, "");
  }
}

function handleRpc(res: ServerResponse, fn: string, args: Record<string, unknown>): void {
  switch (fn) {
    case "wallgold_price_series":
      sendJson(res, 200, rpcPriceSeries(args));
      return;
    case "wallgold_flow_series":
      sendJson(res, 200, rpcFlowSeries(args));
      return;
    case "wallgold_missing_intervals":
      sendJson(res, 200, rpcMissingIntervals(args));
      return;
    case "wallgold_collection_stats":
      sendJson(res, 200, rpcCollectionStats());
      return;
    default:
      sendError(res, 404, `function ${fn}() does not exist`, "PGRST202");
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const path = url.pathname;

    if (path === "/" || path === "/health") {
      sendJson(res, 200, { status: "ok", note: "mock PostgREST (dev only)" });
      return;
    }

    if (!path.startsWith("/rest/v1/")) {
      sendError(res, 404, `Unknown path ${path}`, "PGRST404");
      return;
    }

    const remainder = path.slice("/rest/v1/".length);

    if (remainder.startsWith("rpc/")) {
      if (req.method !== "POST") {
        sendError(res, 405, "Method not allowed for RPC", "PGRST105");
        return;
      }
      const body = await readBody(req);
      handleRpc(res, remainder.slice("rpc/".length), (body as Record<string, unknown>) ?? {});
      return;
    }

    const table = TABLES[remainder];
    if (!table) {
      sendError(res, 404, `relation \"${remainder}\" does not exist`, "PGRST205");
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      handleSelect(req, res, url, table);
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      handleWrite(req, res, url, table, body);
      return;
    }

    sendError(res, 405, `Method ${req.method} not allowed`, "PGRST105");
  })();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      event: "mock_postgrest_listening",
      url: `http://127.0.0.1:${PORT}`,
      tables: Object.keys(TABLES),
      note: "development verification only — never used in production",
    }),
  );
});
