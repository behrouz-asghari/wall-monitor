# WallGold Data Monitor

**WallDB** is a production-oriented data collection, time-series storage, analytics, and monitoring platform for **WallGold** market data.

The system continuously collects WallGold's publicly available JSON data, validates and normalizes the payloads, stores both the original raw responses and structured historical records in **Supabase PostgreSQL**, and exposes the collected data through a server-rendered **Next.js** dashboard.

The application is designed primarily for Persian-speaking users and financial-market analysis, with a dense **RTL/Persian interface**, Tehran timezone rendering, historical price charts, money-flow analysis, correlation analysis, and collector/database health monitoring.

> **Live dashboard:** https://walldb.vercel.app  
> **Source:** https://github.com/behrouz-asghari/wall-monitor

---

## ✨ Features

### Data Collection

- Automated WallGold data collection
- Server-side HTTP requests
- No browser automation
- No cookies
- No authentication against WallGold
- No `Referer` header
- Cache-busting requests
- Request timeout protection
- Automatic retries for transient failures
- No retries for obvious client-side HTTP errors
- Partial-success handling
- Collection-run logging
- Duplicate snapshot detection
- Idempotent persistence
- Self-healing historical backfill behavior

The collector currently reads WallGold's public endpoints:

```text
https://wallgold.ir/wp-content/uploads/wallgold/livedata.json
https://wallgold.ir/wp-content/uploads/wallgold/prices.json
```

Requests use cache-busting query parameters so that the collector does not accidentally reuse a stale upstream response.

---

## 📊 Market Data

WallDB preserves WallGold's source data while also creating query-friendly normalized records.

The system supports dynamically changing WallGold indicators instead of relying on a hard-coded list of symbols.

This means new indicators can be received and stored without requiring the collector schema to be rewritten.

Collected data includes:

- Market prices
- Price snapshots
- Deposit flows
- Withdrawal flows
- Trading flows
- Physical delivery flows
- Source timestamps
- Raw WallGold JSON payloads
- Collection status
- Collection errors
- Historical normalized indicators

---

## 🏗️ Architecture

The data pipeline follows a deliberately separated architecture:

```text
                     ┌──────────────────────┐
                     │      WallGold.ir     │
                     │    Public JSON API   │
                     └──────────┬───────────┘
                                │
                                │ HTTPS
                                ▼
                     ┌──────────────────────┐
                     │  WallGold HTTP Client│
                     │ timeout + retries    │
                     │ cache busting        │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │    Zod Validation    │
                     │ fault isolation      │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │     Normalization    │
                     │ preserve raw values  │
                     │ normalize timestamps │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Supabase PostgreSQL  │
                     │ raw + normalized     │
                     │ snapshots + runs     │
                     └──────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
          ┌──────────────────┐    ┌──────────────────┐
          │ PostgreSQL RPCs  │    │ Next.js API      │
          │ aggregation      │    │ routes           │
          │ gap detection    │    │                  │
          │ statistics       │    │                  │
          └────────┬─────────┘    └────────┬─────────┘
                   │                       │
                   └───────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │   Next.js Dashboard  │
                    │                      │
                    │ Prices               │
                    │ Flows                │
                    │ History              │
                    │ Correlation           │
                    │ Health               │
                    └──────────────────────┘
```

The application keeps the main responsibilities separate:

```text
fetch
  ↓
validate
  ↓
normalize
  ↓
persist
  ↓
query / aggregate
  ↓
render
```

Database access is centralized in the Supabase query layer rather than being scattered throughout UI components.

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js** | Application framework and server-side rendering |
| **React 19** | UI |
| **TypeScript** | Type-safe application code |
| **Tailwind CSS** | Styling |
| **shadcn/ui** | UI primitives |
| **Recharts** | Price, flow and correlation charts |
| **Supabase** | PostgreSQL database, RLS and RPC |
| **Zod** | Runtime validation |
| **date-fns** | Date/time utilities |
| **Cloudflare Workers** | Scheduled collection |
| **Vercel** | Application deployment |
| **Vitest** | Unit and integration testing |
| **ESLint** | Static analysis |
| **Prettier** | Code formatting |
| **Vazirmatn** | Persian UI typography |

---

# 🚀 Getting Started

## Requirements

Recommended environment:

- Node.js
- npm
- Supabase CLI
- A Supabase project
- A WallGold-accessible network environment

For production deployment:

- Vercel
- Cloudflare account with Workers support

---

## Installation

Clone the repository:

```bash
git clone https://github.com/behrouz-asghari/wall-monitor.git
cd wall-monitor
```

Install dependencies:

```bash
npm install
```

---

## Environment Variables

Create a local environment file:

```bash
cp .env.example .env.local
```

Configure the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
NEXT_PUBLIC_APP_VERSION=
```

### Variable Reference

| Variable | Visibility | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Browser-safe Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Server-side collector writes |
| `CRON_SECRET` | **Secret** | Authenticates scheduled collector requests |
| `NEXT_PUBLIC_APP_VERSION` | Public | Optional application version reported by health endpoint |

### Important

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
```

to browser code.

Do not prefix server secrets with:

```text
NEXT_PUBLIC_
```

and never commit `.env.local`.

---

# 💻 Local Development

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:3000
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Create production build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Automatically fix ESLint issues where possible |
| `npm run typecheck` | Run TypeScript compiler without emitting files |
| `npm test` | Run Vitest test suite |
| `npm run format` | Format source files with Prettier |
| `npm run collect:once` | Run the WallGold collector once |
| `npm run mock:db` | Start the local in-memory PostgREST-compatible database shim |

---

# 🗄️ Supabase Setup

WallDB uses Supabase PostgreSQL as its persistent storage layer.

The database schema is migration-driven.

Do **not** manually modify production tables through the Supabase dashboard.

Inspect migrations:

```bash
npx supabase migration list
```

Apply migrations:

```bash
npx supabase db push
```

---

## Database Migrations

### `00001_core_tables.sql`

Creates the core WallGold storage tables:

- `wallgold_livedata`
- `wallgold_prices`
- `wallgold_price_snapshots`

It also defines:

- indexes
- unique constraints
- RLS policies
- grants

### `00002_functions_and_monitoring.sql`

Adds:

- `wallgold_collection_runs`
- price-series RPC functions
- flow-series RPC functions
- missing-interval detection
- collection statistics

The database is therefore responsible for expensive historical aggregation rather than sending large raw datasets to the browser.

---

# 🧱 Data Model

## `wallgold_livedata`

Stores WallGold flow snapshots.

Typical information includes:

- deposits
- withdrawals
- trades
- physical deliveries
- source timestamps
- raw JSON payload

Duplicate protection:

```text
UNIQUE(source_updated_at)
```

---

## `wallgold_prices`

Stores unique WallGold price payloads.

The complete source response is retained as JSONB.

Duplicate protection:

```text
UNIQUE(source_last_realtime_ts)
```

---

## `wallgold_price_snapshots`

Contains normalized rows for individual WallGold indicators.

Duplicate protection:

```text
UNIQUE(snapshot_id, symbol)
```

This allows the application to query individual instruments efficiently while retaining the original source payload.

---

## `wallgold_collection_runs`

Records collector execution history.

It is used for:

- collector health
- success/failure monitoring
- duplicate runs
- gap detection
- operational statistics
- debugging

---

# 🔒 Idempotency & Duplicate Protection

The collector is intentionally idempotent.

Repeated execution of the same upstream snapshot must not create duplicate historical records.

Database-level uniqueness is combined with:

```sql
ON CONFLICT DO NOTHING
```

This protects the history against:

- duplicate cron executions
- overlapping executions
- manual collector runs
- delayed scheduled jobs
- retries
- upstream unchanged responses

An unchanged WallGold response is treated as a **duplicate snapshot**, not as a missing data interval.

---

# 🔄 Collector Behavior

The collector uses the following strategy:

```text
Attempt 1
   ↓
failure?
   ↓
wait 500 ms
   ↓
Attempt 2
   ↓
failure?
   ↓
wait 1000 ms
   ↓
Attempt 3
```

Transient failures eligible for retry include:

- network errors
- timeouts
- HTTP 429
- HTTP 5xx
- empty responses
- malformed upstream responses

Obvious 4xx errors are not retried.

---

## Partial Success

The two WallGold sources are handled independently.

For example:

```json
{
  "success": true,
  "collected": true,
  "liveData": true,
  "prices": false,
  "errors": [
    "prices endpoint failed"
  ]
}
```

A failure in one source therefore does not discard successfully collected data from the other source.

---

# ⏱️ Scheduling

The production collector endpoint is:

```text
POST /api/cron/wallgold
```

It requires:

```http
Authorization: Bearer <CRON_SECRET>
```

The production schedule currently runs through a **Cloudflare Worker**.

The Worker triggers the collector every five minutes:

```text
*/5 * * * *
```

The Worker then sends a POST request to the deployed Next.js endpoint.

```text
Cloudflare Worker
       │
       │ every 5 minutes
       ▼
POST /api/cron/wallgold
       │
       │ Authorization: Bearer CRON_SECRET
       ▼
Next.js Collector
       │
       ▼
WallGold
       │
       ▼
Supabase PostgreSQL
```

GitHub is used as the source-code repository; scheduled execution is not dependent on GitHub Actions.

---

## Why Cloudflare Worker?

The project is designed to work with Vercel Hobby limitations.

Vercel Hobby does not provide the required high-frequency native cron schedule, so the five-minute schedule is delegated to a Cloudflare Worker.

On a Vercel plan that supports the required schedule, the same collector endpoint can be triggered directly by Vercel Cron.

The collector remains idempotent in either deployment model.

---

# 🔐 Cron Authentication

Requests without a valid secret are rejected.

### Missing or invalid secret

```http
401 Unauthorized
```

### Secret not configured

```http
503 cron_secret_not_configured
```

The endpoint fails closed rather than becoming publicly executable.

---

## Manual Collector Test

Production:

```bash
curl -X POST https://walldb.vercel.app/api/cron/wallgold \
  -H "Authorization: Bearer $CRON_SECRET"
```

Local:

```bash
curl -X POST http://localhost:3000/api/cron/wallgold \
  -H "Authorization: Bearer $CRON_SECRET"
```

A query-string convenience form is also available locally:

```bash
curl "http://localhost:3000/api/cron/wallgold?secret=$CRON_SECRET"
```

---

# 🩺 Health Check

The application exposes:

```text
GET /api/health
```

Example:

```bash
curl https://walldb.vercel.app/api/health
```

The health endpoint is designed to expose operational status without exposing secrets.

---

# 📡 API

## Latest Prices

```text
GET /api/prices
```

Returns the latest validated price data.

Query parameters are validated using Zod.

---

## Historical Prices

```text
GET /api/prices/history
```

Example:

```text
/api/prices/history?symbol=SYMBOL&range=7D
```

Historical data is aggregated server-side according to the requested time range.

---

## Flow Series

```text
GET /api/flows
```

Provides historical flow information for the dashboard.

---

## Collector

```text
POST /api/cron/wallgold
```

Secured using:

```http
Authorization: Bearer <CRON_SECRET>
```

---

## Health

```text
GET /api/health
```

Used for deployment and operational monitoring.

---

# 📈 Historical Aggregation

The system avoids sending unnecessarily large datasets to the browser.

Aggregation is performed server-side.

Current strategy:

| Requested Range | Resolution |
|---|---|
| 1H | Raw/minute |
| 6H | Raw/minute |
| 12H | Raw/minute |
| 24H | Raw/minute |
| 3D | Hourly |
| 7D | Hourly |
| 30D | Daily |

This keeps chart payloads relatively small while retaining high-resolution raw historical data in PostgreSQL.

---

# 🔢 Numeric Integrity

WallGold may provide prices using scaling metadata such as:

```text
divide10
decimals
```

WallDB does **not** permanently mutate the source number.

Instead:

```text
Raw source value
       +
Scaling metadata
       ↓
Display conversion
```

The original values remain available for:

- auditing
- reprocessing
- future normalization changes
- debugging
- historical integrity

Display conversion is handled by application formatting helpers.

---

# 🕐 Time Handling

Database timestamps are stored as:

```text
UTC / timestamptz
```

The UI renders them in:

```text
Asia/Tehran
```

Timezone conversion is handled through standard internationalization APIs rather than manually adding or subtracting offsets.

This avoids problems caused by:

- timezone assumptions
- daylight-saving changes
- server timezone differences
- inconsistent timestamp parsing

---

# 📊 Dashboard

The dashboard is intentionally information-dense and optimized for financial-market monitoring.

## Main Dashboard

Provides:

- market cards
- latest prices
- market state
- key statistics
- charts
- collection health

---

## Prices

The prices section provides:

- historical price charts
- instrument selection
- current quote information
- detailed price tables
- historical navigation

---

## Flows

The flow dashboard focuses on WallGold's money/asset movement data.

It provides:

- flow KPIs
- flow history
- net-flow calculations
- ratio-based indicators
- visualization of changes over time

---

## History

The history section exposes:

- paginated historical records
- source information
- timestamps
- raw payloads

Server-side pagination prevents large historical tables from being loaded entirely into the browser.

---

## Correlation

The correlation view is designed to investigate co-movement between market indicators.

It can be used to identify:

- positive co-movement
- negative co-movement
- weakly related indicators
- changing relationships over selected time ranges

Correlation calculations are normalized server-side before being rendered by the dashboard.

---

## Health

The health dashboard provides visibility into the data pipeline itself.

It monitors:

- collector executions
- successful collections
- failed collections
- duplicate runs
- missing intervals
- database statistics
- collection gaps

This makes the application useful not only as a market dashboard, but also as a **data-quality monitoring system**.

---

# 🧪 Testing

The project uses **Vitest** for unit and integration testing.

Run:

```bash
npm test
```

The test suite covers several layers.

### Schema Tests

```text
tests/unit/schemas.test.ts
```

Tests:

- WallGold response validation
- dynamic indicator keys
- unknown indicators
- per-indicator fault isolation
- raw payload preservation

### Normalization Tests

```text
tests/unit/normalize.test.ts
```

Tests:

- normalization
- `divide10`
- decimal conversion
- Tehran timezone formatting

### Flow Tests

```text
tests/unit/flows.test.ts
```

Tests:

- time-range parsing
- net-flow calculations
- flow ratios
- correlation normalization

### API Validation Tests

```text
tests/unit/validation.test.ts
```

Tests:

- symbols
- ranges
- pagination
- invalid query parameters

### Migration Tests

```text
tests/unit/migrations.test.ts
```

Ensures SQL migrations and seed data can be parsed correctly.

### Collector Integration Tests

```text
tests/integration/collector.test.ts
```

Covers:

- retries
- timeout behavior
- 4xx handling
- partial success
- duplicate detection
- self-healing backfill
- structured logging
- secret hygiene

The WallGold HTTP layer is mocked, so normal test execution does not depend on the live upstream service.

### Cron Route Tests

```text
tests/integration/cron-route.test.ts
```

Tests:

- unauthorized requests
- missing configuration
- successful authentication
- response shapes

---

# 🧪 End-to-End Local Verification

The repository includes a local PostgREST-compatible in-memory database shim.

Start it with:

```bash
npm run mock:db
```

Then run the application using the mock database configuration:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key \
SUPABASE_SERVICE_ROLE_KEY=mock-service-role-key \
CRON_SECRET=local-secret \
npm run dev
```

For full local verification:

```bash
npm run build && bash scripts/e2e-local.sh
```

The E2E workflow verifies important behaviors including:

- collector execution
- repeated execution
- idempotency
- page rendering
- validation errors
- secret handling

The mock database is a development tool only.

Production uses Supabase Cloud.

---

# 📁 Project Structure

```text
wall-monitor/
│
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── wallgold/
│   │   │       └── route.ts
│   │   ├── health/
│   │   │   └── route.ts
│   │   ├── prices/
│   │   │   ├── route.ts
│   │   │   └── history/
│   │   │       └── route.ts
│   │   └── flows/
│   │       └── route.ts
│   │
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── prices/
│   │   │   └── page.tsx
│   │   ├── flows/
│   │   │   └── page.tsx
│   │   ├── history/
│   │   │   └── page.tsx
│   │   ├── correlation/
│   │   │   └── page.tsx
│   │   └── health/
│   │       └── page.tsx
│   │
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── charts/
│   ├── dashboard/
│   ├── layout/
│   ├── tables/
│   └── ui/
│
├── lib/
│   ├── wallgold/
│   │   ├── client.ts
│   │   ├── schemas.ts
│   │   ├── normalize.ts
│   │   └── collector.ts
│   │
│   ├── supabase/
│   │   ├── admin.ts
│   │   ├── client.ts
│   │   ├── queries.ts
│   │   └── database.types.ts
│   │
│   ├── constants.ts
│   ├── env.ts
│   ├── format.ts
│   ├── logger.ts
│   ├── utils.ts
│   └── validation.ts
│
├── cloudflare/
│   └── wallgold-cron/
│
├── scripts/
│   ├── collect-once
│   ├── mock-postgrest
│   └── e2e-local.sh
│
├── supabase/
│   ├── migrations/
│   │   ├── 00001_core_tables.sql
│   │   └── 00002_functions_and_monitoring.sql
│   └── seed.sql
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── public/
│   └── fonts/
│
├── .env.example
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json
└── vitest.config.ts
```

---

# 🔐 Security

Security is treated as a first-class concern.

## Service Role Isolation

The Supabase service-role client is server-only.

The admin client explicitly prevents browser usage.

```text
Browser
   ✕
SUPABASE_SERVICE_ROLE_KEY

Server
   ✓
SUPABASE_SERVICE_ROLE_KEY
```

The collector client is created lazily to avoid accidentally embedding secrets into the build.

---

## RLS

Row Level Security is enabled on the database tables.

Browser-safe clients use the public Supabase anonymous key and are restricted by RLS.

Server-side writes use the service-role client.

```text
Browser
  │
  │ anon key
  ▼
Supabase
  │
  └── RLS → read-only access

Server Collector
  │
  │ service role
  ▼
Supabase
  │
  └── server-side writes
```

---

## Secret Redaction

Structured logs pass through a deep redaction layer.

Keys resembling:

```text
secret
token
authorization
```

are removed from logs.

API routes never return server secrets.

---

# ♿ Accessibility

The dashboard is designed for RTL Persian users while retaining technical identifiers in LTR contexts.

The root document uses:

```html
<html lang="fa" dir="rtl">
```

The application includes:

- semantic landmarks
- keyboard-accessible controls
- `aria-current`
- `aria-pressed`
- semantic `<time datetime>` elements
- labeled regions
- explicit price direction indicators

Price direction is not communicated through color alone.

Instead, changes are represented through:

```text
arrow + signed number + text
```

Technical values such as:

- symbols
- code
- timestamps
- UTC values

remain LTR where appropriate.

---

# 🧭 Time-Series Retention

The current system does not automatically delete historical records.

The schema is intentionally designed to support a future retention strategy.

A possible future policy could retain:

```text
Raw source data       → at least 1 year
Normalized data       → long-term
Aggregated series     → long-term
Collection statistics → long-term
```

No destructive retention policy is currently enabled.

---

# 🚀 Production Deployment

## Vercel

The Next.js application can be deployed to Vercel.

Typical workflow:

```bash
vercel link --project <project-name>
```

Configure:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
```

Then:

```bash
vercel --prod
```

---

## Cloudflare Worker

The scheduled collector is located at:

```text
cloudflare/wallgold-cron/
```

Install dependencies:

```bash
cd cloudflare/wallgold-cron
npm install
```

Configure the secret:

```bash
npx wrangler secret put CRON_SECRET
```

Deploy:

```bash
npm run deploy
```

The Worker runs every five minutes and calls:

```text
POST /api/cron/wallgold
```

---

# 🛠️ Design Principles

WallDB follows several principles that are important for a historical market-data system.

### Preserve source data

Never throw away the original upstream payload when normalizing it.

```text
raw_json
   +
normalized rows
```

This makes future reprocessing possible.

### Database-enforced idempotency

Do not rely only on application logic to detect duplicates.

Use:

```text
UNIQUE constraints
+
ON CONFLICT DO NOTHING
```

### Separate collection from presentation

The collector should not know about dashboard components.

The dashboard should not know how WallGold is fetched.

### Aggregate before rendering

Large historical datasets should be reduced on the server/database before reaching the browser.

### Fail partially, not completely

If one upstream endpoint fails, preserve successful data from other endpoints.

### Store time in UTC

Convert to Tehran time only when presenting it to users.

### Treat observability as data

Collection health and missing intervals are stored and queryable rather than existing only in logs.

---

# ⚠️ Data Source Disclaimer

WallDB depends on data made publicly available by WallGold.

The application does not claim ownership of WallGold's source data.

Upstream behavior may change at any time, including:

- endpoint URLs
- JSON structure
- field names
- indicator symbols
- timestamps
- scaling rules
- availability
- rate limits

The collector therefore uses runtime validation and preserves raw payloads to make upstream changes easier to detect and recover from.

WallDB is a monitoring and historical-analysis project and should not be treated as an official WallGold service.

---

# 🤝 Contributing

Contributions are welcome.

Before submitting a pull request:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For changes affecting the collector, also verify:

- retry behavior
- duplicate protection
- partial-success behavior
- raw payload preservation
- timestamp handling
- secret redaction
- API response validation

For database changes:

- create a migration
- do not manually modify production tables
- verify migration parsing
- verify RLS behavior
- test duplicate constraints

---

# 📌 Roadmap

Potential future improvements include:

- configurable retention policies
- additional market analytics
- richer anomaly detection
- configurable alerts
- Telegram/notification integrations
- export to CSV/Parquet
- additional correlation methods
- rolling volatility metrics
- moving averages
- drawdown analysis
- more granular flow analytics
- data-quality scoring
- automated upstream schema-change detection
- collector latency monitoring
- historical data backfill tooling

---

# 📄 License

This project is provided as an open-source software project.

See the repository license file for the applicable licensing terms.

---

## Project Status

WallDB is an actively developed personal market-data monitoring and historical-analysis project.

The current architecture is designed around:

```text
Reliable collection
        +
Raw data preservation
        +
Normalized time-series storage
        +
Database-side analytics
        +
Operational observability
        +
RTL financial dashboard
```

---

## Author

**Behrouz Asghari**

GitHub: https://github.com/behrouz-asghari

Project: https://github.com/behrouz-asghari/wall-monitor
