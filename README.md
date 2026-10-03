# WallGold Data Monitor (WallDB)

A production-ready **data collection + time-series storage + analytics + dashboard** application.

Every minute, a server-side collector fetches WallGold's public JSON endpoints, validates them
with Zod, stores raw payloads + normalized rows in Supabase PostgreSQL with idempotent
duplicate protection, and a dark, information-dense, RTL/Persian dashboard renders market
cards, price/flow charts, correlation analysis and data-health monitoring.

```
WallGold (wallgold.ir, public JSON)
   ↓  server-side fetch (no cookies / no browser / no referer)
Zod validation (per-indicator fault isolation)
   ↓
Normalization (raw values preserved exactly)
   ↓  ON CONFLICT DO NOTHING (idempotent)
Supabase PostgreSQL (raw jsonb + normalized rows + run log)
   ↓  parameterized RPC functions (aggregation, gap detection, stats)
Next.js server (App Router, streamed sections)
   ↓
Dashboard → Recharts (price / flow / correlation)
```

## Tech stack

Next.js (App Router, TypeScript strict) · React 19 · Tailwind CSS + shadcn/ui · Recharts ·
Supabase (PostgreSQL, RLS, RPC) · Zod · date-fns · Vercel Cron · ESLint + Prettier · Vitest

---

## Installation

```bash
npm install
```

## Development

```bash
npm run dev          # http://localhost:3000
```

Available scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` / `lint:fix` | ESLint (flat config, Next rules) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit + integration tests (WallGold HTTP is mocked) |
| `npm run format` | Prettier write |
| `npm run collect:once` | Run the collector manually once (uses `.env.local`) |
| `npm run mock:db` | In-memory PostgREST shim for local runs without any database |

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in real values. `.env.local` is git-ignored and
must never be committed.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (browser-safe) | Supabase project URL (`Settings → API`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (browser-safe) | Anon key; reads only (RLS blocks writes) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only secret** | Used by the collector for inserts. Never prefixed `NEXT_PUBLIC_`, never imported by client components |
| `CRON_SECRET` | **Server-only secret** | Shared secret Vercel Cron sends as `Authorization: Bearer <CRON_SECRET>` to `/api/cron/wallgold` |
| `NEXT_PUBLIC_APP_VERSION` | Optional | Reported by `/api/health` (defaults to package version) |

Security invariants enforced in code:

- `lib/supabase/admin.ts` throws if ever called in a browser (`typeof window` guard).
- The collector client is created lazily, so secrets are never inlined at build time.
- Structured logs pass through a deep redactor (`lib/logger.ts`) that strips anything whose
  key looks like a secret/token/authorization header.
- No secrets are ever returned by any API route.

---

## Supabase setup

This repository is already linked to the Supabase Cloud project **WallMonitor**
(ref `fgcqdrgxbilwryrxurbh`) via `supabase/.temp/`. Do not re-init; do not run
`npx supabase start` (no Docker in this workflow).

1. (Only for a brand-new environment) create a project in the Supabase dashboard.
2. Verify linkage and auth:

   ```bash
   npx supabase --version
   npx supabase projects list
   ```

3. Inspect which migrations exist locally and remotely:

   ```bash
   npx supabase migration list
   ```

4. Apply migrations to the linked cloud project:

   ```bash
   npx supabase db push
   ```

5. Confirm the remote column in `npx supabase migration list` now shows
   `00001` and `00002`.

Migrations (never edit tables by hand in the dashboard):

| File | Contents |
| --- | --- |
| `supabase/migrations/00001_core_tables.sql` | `wallgold_livedata`, `wallgold_prices`, `wallgold_price_snapshots` + unique constraints, indexes, RLS select policies, grants |
| `supabase/migrations/00002_functions_and_monitoring.sql` | `wallgold_collection_runs` + `wallgold_price_series`, `wallgold_flow_series`, `wallgold_missing_intervals`, `wallgold_collection_stats` RPC functions |

Duplicate protection lives in `UNIQUE (source_updated_at)`,
`UNIQUE (source_last_realtime_ts)` and `UNIQUE (snapshot_id, symbol)`; the collector inserts
with `ON CONFLICT DO NOTHING`, so replayed cron runs never create duplicate history.

`supabase/seed.sql` contains clearly marked **DEMO DATA** for UI development only.
Never run it against production.

---

## Vercel setup

1. Push this repository to GitHub (remote: `origin` → `https://github.com/wall-monitor/WallDB.git`).
2. Import the repository in Vercel (or `vercel link` in the project directory) — use the
   **existing** project if one is linked; do not create a duplicate.
3. Add the environment variables for **Production and Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (sensitive)
   - `CRON_SECRET` (sensitive, e.g. `openssl rand -hex 32`)
4. Deploy (`vercel --prod`).
5. Cron is configured in `vercel.json`:

   ```json
   { "crons": [{ "path": "/api/cron/wallgold", "schedule": "* * * * *" }] }
   ```

   Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the variable is set.

   > Note: Vercel's Hobby plan may restrict cron frequency. If per-minute runs are not
   > available on your plan, schedule an external caller against the same authenticated URL.
6. Verify the collector:

   ```bash
   curl https://<your-domain>/api/health
   curl -X POST https://<your-domain>/api/cron/wallgold -H "Authorization: Bearer $CRON_SECRET"
   ```

   The response should look like:

   ```json
   { "success": true, "collected": true, "liveData": true, "prices": true, "timestamp": "..." }
   ```

   When WallGold has not changed since the previous run (expected upstream behavior):

   ```json
   { "success": true, "collected": false, "reason": "duplicate_snapshot" }
   ```

### Local cron testing

```bash
# in .env.local: CRON_SECRET=...
curl -X POST http://localhost:3000/api/cron/wallgold \
  -H "Authorization: Bearer $CRON_SECRET"
# or with the query-parameter convenience:
curl "http://localhost:3000/api/cron/wallgold?secret=$CRON_SECRET"
```

Without (or with a wrong) secret the endpoint returns `401`; with `CRON_SECRET` unset it
returns `503 cron_secret_not_configured` — it fails closed, never open.

You can also run the collector directly: `npm run collect:once`.

---

## Local development without a database

For UI/collector work when you don't want to touch the cloud project:

```bash
npm run mock:db       # in-memory PostgREST-compatible shim on :54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
SUPABASE_SERVICE_ROLE_KEY=mock-service-role-key \
CRON_SECRET=local-secret npm run dev
```

Full end-to-end verification (starts both servers, runs the collector twice against the real
WallGold API, asserts idempotency, page rendering, validation errors and secret hygiene):

```bash
npm run build && bash scripts/e2e-local.sh
```

The shim is a development aid only — production always talks to Supabase Cloud.

---

## Tests

```bash
npm test
```

- `tests/unit/schemas.test.ts` — Zod validation for both endpoints (dynamic/unknown indicator
  keys, per-indicator fault isolation, raw payload preservation)
- `tests/unit/normalize.test.ts` — normalization, `divide10`/`decimals` price conversion,
  Tehran-time formatting
- `tests/unit/flows.test.ts` — time-range parsing, net-flow/ratio math, correlation normalization
- `tests/unit/validation.test.ts` — API query-parameter validation (symbol/range/pagination)
- `tests/unit/migrations.test.ts` — every migration + seed parses with the real Postgres parser
- `tests/integration/collector.test.ts` — collector with **mocked HTTP** (never hits the real
  WallGold API): retries, 4xx-no-retry, partial success, duplicate detection, self-healing
  backfill, structured logging, secret hygiene
- `tests/integration/cron-route.test.ts` — cron authentication (401/503) and response shapes

---

## Project structure

```text
app/
├── api/
│   ├── cron/wallgold/route.ts   # secured collector endpoint (CRON_SECRET)
│   ├── health/route.ts          # liveness/health probe (no secrets)
│   ├── prices/route.ts          # latest quotes (Zod-validated query)
│   ├── prices/history/route.ts  # aggregated series ?symbol=&range=
│   └── flows/route.ts           # flow series ?range=
├── dashboard/
│   ├── page.tsx                 # overview: market cards, charts, health
│   ├── prices/page.tsx          # chart + full quote table
│   ├── flows/page.tsx           # flow KPIs + flow chart
│   ├── history/page.tsx         # paginated price rows + raw payloads
│   ├── correlation/page.tsx     # co-movement analysis
│   └── health/page.tsx          # collector/DB status, gaps, runs
├── layout.tsx                   # RTL/Persian root (Vazirmatn, dark)
└── page.tsx                     # landing
components/
├── charts/     # PriceHistoryChart, FlowChart, CorrelationChart (client)
├── dashboard/  # MarketCard, MarketGrid, StatCard, selectors, badges
├── layout/     # nav, page header, loading skeleton
├── tables/     # DataTable + concrete tables + pagination
└── ui/         # shadcn primitives
lib/
├── wallgold/   # client.ts (HTTP) → schemas.ts (Zod) → normalize.ts → collector.ts
├── supabase/   # admin.ts (service role, server-only), client.ts (anon), queries.ts, database.types.ts
├── constants.ts / utils.ts / format.ts / logger.ts / env.ts / validation.ts
supabase/migrations/             # reproducible schema (see table above)
scripts/                         # collect-once, mock-postgrest, e2e-local.sh
tests/                           # unit + integration (mocked upstream)
```

Separation of concerns: **fetching → validation → normalization → persistence → querying → UI**,
with database queries confined to `lib/supabase/queries.ts`.

---

## Key behaviors

- **Endpoints** — `livedata.json?_wg=<ts>` and `prices.json?_=<ts>` with a fresh cache buster;
  plain `fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) })`, no cookies,
  no auth, no browser headers, no referer.
- **Retries** — attempt 1 → 500ms → attempt 2 → 1000ms → attempt 3 for transient failures
  (network, timeout, 5xx, 429, empty/malformed bodies). Obvious 4xx is never retried.
- **Partial success** — if one endpoint fails, the other is still stored and the cron response
  reports it (`"liveData": true, "prices": false` + `errors`).
- **Unknown indicators** — symbol keys are dynamic; every indicator WallGold sends gets a
  normalized row (unique symbols are never hard-coded), and the full payload is always kept in
  `raw_json` for future re-processing.
- **Numeric integrity** — raw values are stored exactly as sourced; `divide10`/`decimals` are
  stored as metadata and applied only by display helpers (`toDisplayPrice`).
- **Time handling** — everything stored as `timestamptz` in UTC; UI renders
  `Asia/Tehran` through `Intl` (never manual offset math).
- **Performance** — charts aggregate server-side: 1H–24H → raw/minute, 3D/7D → hourly,
  30D → daily; tables paginate server-side (`count=exact`, `range()`); health stats come from
  a single RPC.
- **Gap detection** — `wallgold_collection_runs` records every invocation; missing minutes are
  computed with `generate_series` (an unchanged upstream payload is a `duplicate` run, not a gap).
- **Retention** — no automatic deletion; schema is ready for a future retention policy
  (raw ≥1 year, normalized/aggregated long-term).

## Data model

| Table | Purpose | Duplicate key |
| --- | --- | --- |
| `wallgold_livedata` | Flow snapshots (deposit/withdraw/trade/delivery) + raw jsonb | `source_updated_at` |
| `wallgold_prices` | One row per unique prices payload (full raw jsonb) | `source_last_realtime_ts` |
| `wallgold_price_snapshots` | Normalized per-indicator rows | `(snapshot_id, symbol)` |
| `wallgold_collection_runs` | One row per cron/collector run (health, gaps) | — |

RLS is enabled on every table with read-only policies for `anon`/`authenticated`; the
service-role key (server only) bypasses RLS for writes.

## Accessibility & RTL

- Root document is `lang="fa" dir="rtl"` with self-hosted Vazirmatn (no CDN).
- Price direction is communicated with **arrow + signed number + text label**, never color alone.
- Semantic landmarks (`banner`, `nav`, `main`, `contentinfo`, regions with labels), keyboard
  reachable controls, `aria-pressed`/`aria-current` states, `<time datetime>` elements.
- Technical identifiers (symbols, code, UTC stamps) stay LTR via `.ltr` islands.
