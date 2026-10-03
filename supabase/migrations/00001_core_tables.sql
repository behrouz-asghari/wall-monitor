-- ---------------------------------------------------------------------------
-- 00001_core_tables.sql
-- WallGold Data Monitor — core tables.
--
-- Design rules:
--   * source timestamps (source_updated_at / source_last_realtime_ts) are the
--     authoritative duplicate-protection keys -> UNIQUE constraints, and the
--     collector inserts with ON CONFLICT DO NOTHING (idempotent).
--   * every successful upstream response is stored verbatim as raw_json jsonb,
--     so future WallGold schema changes never lose data.
--   * normalized price rows keep the ORIGINAL source numbers; divide10/decimals
--     are stored as source metadata and only applied at display time.
--   * all timestamps are timestamptz stored in UTC.
-- ---------------------------------------------------------------------------

-- 1) Live data snapshots (deposit / withdraw / trade / delivery flows) --------
create table if not exists public.wallgold_livedata (
  id                              bigint generated always as identity primary key,
  source_updated_at               timestamptz not null,
  valid_until                     timestamptz,
  collected_at                    timestamptz not null default now(),

  trade_last_minute_toman         bigint,
  deposit_last_minute_toman       bigint,
  deposit_last_hour_volume_toman  bigint,

  withdraw_last_minute_toman      bigint,
  withdraw_last_hour_volume_toman bigint,

  delivery_last_request_at        timestamptz,
  delivery_today_count            integer,
  delivery_last_minute_count      integer,

  raw_json                        jsonb not null,
  created_at                      timestamptz not null default now(),

  constraint wallgold_livedata_source_updated_at_key unique (source_updated_at)
);

create index if not exists wallgold_livedata_collected_at_idx
  on public.wallgold_livedata (collected_at desc);

comment on table public.wallgold_livedata is
  'Raw snapshots of wallgold livedata.json; unique on the source update timestamp.';

-- 2) Raw price snapshots (whole prices.json payload) --------------------------
create table if not exists public.wallgold_prices (
  id                      bigint generated always as identity primary key,
  source_last_realtime    text,
  source_last_realtime_ts bigint not null,
  collected_at            timestamptz not null default now(),
  raw_json                jsonb not null,
  created_at              timestamptz not null default now(),

  constraint wallgold_prices_source_last_realtime_ts_key unique (source_last_realtime_ts)
);

create index if not exists wallgold_prices_collected_at_idx
  on public.wallgold_prices (collected_at desc);

comment on table public.wallgold_prices is
  'One row per unique source prices.json timestamp; holds the full raw payload.';

-- 3) Normalized per-indicator price history ----------------------------------
create table if not exists public.wallgold_price_snapshots (
  id               bigint generated always as identity primary key,
  snapshot_id      bigint not null references public.wallgold_prices (id) on delete cascade,
  collected_at     timestamptz not null default now(),

  symbol           text not null,

  price            numeric not null,
  open             numeric,
  high             numeric,
  low              numeric,

  change_amount    numeric,
  change_percent   numeric,

  direction        text,
  updated_ms       bigint,

  unit             text,
  divide10         boolean not null default false,
  decimals         smallint not null default 0,

  created_at       timestamptz not null default now(),

  constraint wallgold_price_snapshots_snapshot_symbol_key unique (snapshot_id, symbol)
);

create index if not exists wallgold_price_snapshots_symbol_idx
  on public.wallgold_price_snapshots (symbol);

create index if not exists wallgold_price_snapshots_collected_at_idx
  on public.wallgold_price_snapshots (collected_at desc);

create index if not exists wallgold_price_snapshots_symbol_collected_at_idx
  on public.wallgold_price_snapshots (symbol, collected_at desc);

create index if not exists wallgold_price_snapshots_snapshot_id_idx
  on public.wallgold_price_snapshots (snapshot_id);

comment on table public.wallgold_price_snapshots is
  'One row per (prices snapshot, indicator symbol); values preserved exactly as sourced.';

-- ---------------------------------------------------------------------------
-- Security: RLS enabled, read-only for the public/anon roles.
-- The collector uses the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.wallgold_livedata enable row level security;
alter table public.wallgold_prices enable row level security;
alter table public.wallgold_price_snapshots enable row level security;

drop policy if exists "livedata public read" on public.wallgold_livedata;
create policy "livedata public read"
  on public.wallgold_livedata for select
  to anon, authenticated
  using (true);

drop policy if exists "prices public read" on public.wallgold_prices;
create policy "prices public read"
  on public.wallgold_prices for select
  to anon, authenticated
  using (true);

drop policy if exists "price snapshots public read" on public.wallgold_price_snapshots;
create policy "price snapshots public read"
  on public.wallgold_price_snapshots for select
  to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated;
grant select on public.wallgold_livedata to anon, authenticated;
grant select on public.wallgold_prices to anon, authenticated;
grant select on public.wallgold_price_snapshots to anon, authenticated;
