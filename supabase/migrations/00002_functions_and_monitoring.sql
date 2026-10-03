-- ---------------------------------------------------------------------------
-- 00002_functions_and_monitoring.sql
-- WallGold Data Monitor — collector run log + server-side query functions.
--
-- Aggregation, gap detection and health stats all live in Postgres so the
-- dashboard only ever downloads the data it actually needs (§30 performance).
-- Every function is parameterized (no string-built SQL) and read-only.
-- ---------------------------------------------------------------------------

-- 1) Collector run log -------------------------------------------------------
-- One row per cron invocation. This is what makes "cron status",
-- "last successful collection" and "missing intervals" detectable even when
-- the upstream data itself has not changed (which legitimately produces a
-- duplicate snapshot and therefore no new snapshot row).
create table if not exists public.wallgold_collection_runs (
  id               bigint generated always as identity primary key,
  started_at       timestamptz not null,
  finished_at      timestamptz,
  duration_ms      integer,
  status           text not null
                   check (status in ('ok', 'partial', 'duplicate', 'failed')),
  live_ok          boolean not null default false,
  live_inserted    boolean not null default false,
  prices_ok        boolean not null default false,
  prices_inserted  boolean not null default false,
  error            text,
  details          jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists wallgold_collection_runs_started_at_idx
  on public.wallgold_collection_runs (started_at desc);

comment on table public.wallgold_collection_runs is
  'One row per collector/cron invocation; source of truth for cron health.';

alter table public.wallgold_collection_runs enable row level security;

drop policy if exists "runs public read" on public.wallgold_collection_runs;
create policy "runs public read"
  on public.wallgold_collection_runs for select
  to anon, authenticated
  using (true);

grant select on public.wallgold_collection_runs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Price history series
--    bucket: 'minute' | 'hour' | 'day'
--    For a minute bucket with one row per minute this equals the raw series.
--    For coarser buckets: price/change = value of the newest row in the
--    bucket, high/low = max/min, plus a sample count for transparency.
-- ---------------------------------------------------------------------------
create or replace function public.wallgold_price_series(
  p_symbol text,
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text default 'minute'
)
returns table (
  bucket          timestamptz,
  price           numeric,
  open            numeric,
  high            numeric,
  low             numeric,
  change_amount   numeric,
  change_percent  numeric,
  direction       text,
  unit            text,
  divide10        boolean,
  decimals        smallint,
  samples         bigint
)
language plpgsql
stable
parallel safe
as $$
begin
  if p_bucket not in ('minute', 'hour', 'day') then
    raise exception 'unsupported bucket "%": expected minute|hour|day', p_bucket;
  end if;

  return query
  select
    date_trunc(p_bucket, s.collected_at at time zone 'utc') at time zone 'utc' as b,
    (array_agg(s.price          order by s.collected_at desc, s.id desc))[1]    as price,
    (array_agg(s.open           order by s.collected_at desc, s.id desc))[1]    as open,
    max(s.high)                                                               as high,
    min(s.low)                                                                as low,
    (array_agg(s.change_amount  order by s.collected_at desc, s.id desc))[1]    as change_amount,
    (array_agg(s.change_percent order by s.collected_at desc, s.id desc))[1]    as change_percent,
    (array_agg(s.direction      order by s.collected_at desc, s.id desc))[1]    as direction,
    (array_agg(s.unit           order by s.collected_at desc, s.id desc))[1]    as unit,
    (array_agg(s.divide10       order by s.collected_at desc, s.id desc))[1]    as divide10,
    (array_agg(s.decimals       order by s.collected_at desc, s.id desc))[1]    as decimals,
    count(*)                                                                   as samples
  from public.wallgold_price_snapshots s
  where s.symbol = p_symbol
    and s.collected_at >= p_from
    and s.collected_at <= p_to
  group by b
  order by b asc;
end;
$$;

comment on function public.wallgold_price_series(text, timestamptz, timestamptz, text) is
  'Aggregated price series for one symbol; bucket = minute|hour|day (UTC).';

-- ---------------------------------------------------------------------------
-- 3) Flow history series (deposit / withdraw / trade / net flow)
--    Volumes are gauges sampled once per minute, so averaging inside a bucket
--    is the meaningful reduction. net_flow is derived, never stored.
-- ---------------------------------------------------------------------------
create or replace function public.wallgold_flow_series(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket text default 'minute'
)
returns table (
  bucket                       timestamptz,
  trade_last_minute_toman      bigint,
  deposit_last_minute_toman    bigint,
  deposit_last_hour_volume_toman bigint,
  withdraw_last_minute_toman   bigint,
  withdraw_last_hour_volume_toman bigint,
  net_flow_hour_toman          bigint,
  samples                      bigint
)
language plpgsql
stable
parallel safe
as $$
begin
  if p_bucket not in ('minute', 'hour', 'day') then
    raise exception 'unsupported bucket "%": expected minute|hour|day', p_bucket;
  end if;

  return query
  select
    date_trunc(p_bucket, l.collected_at at time zone 'utc') at time zone 'utc' as b,
    round(avg(l.trade_last_minute_toman))::bigint         as trade_min,
    round(avg(l.deposit_last_minute_toman))::bigint       as dep_min,
    round(avg(l.deposit_last_hour_volume_toman))::bigint  as dep_hour,
    round(avg(l.withdraw_last_minute_toman))::bigint      as wdr_min,
    round(avg(l.withdraw_last_hour_volume_toman))::bigint as wdr_hour,
    (round(avg(l.deposit_last_hour_volume_toman))
      - round(avg(l.withdraw_last_hour_volume_toman)))::bigint as net_hour,
    count(*)                                              as samples
  from public.wallgold_livedata l
  where l.collected_at >= p_from
    and l.collected_at <= p_to
  group by b
  order by b asc;
end;
$$;

comment on function public.wallgold_flow_series(timestamptz, timestamptz, text) is
  'Aggregated flow series; net_flow_hour_toman is derived at query time.';

-- ---------------------------------------------------------------------------
-- 4) Missing collection intervals (gap detection)
--    Evidence of cron execution comes from wallgold_collection_runs — an
--    unchanged upstream payload is NOT a gap (it produces a duplicate
--    snapshot, which is expected upstream behavior).
-- ---------------------------------------------------------------------------
create or replace function public.wallgold_missing_intervals(
  p_from timestamptz,
  p_to   timestamptz,
  p_step interval default interval '1 minute'
)
returns table (missing_at timestamptz)
language sql
stable
parallel safe
as $$
  with expected as (
    select generate_series(
             date_trunc('minute', p_from at time zone 'utc') at time zone 'utc',
             date_trunc('minute', p_to   at time zone 'utc') at time zone 'utc',
             p_step
           ) as ts
  ),
  actual as (
    select distinct date_trunc('minute', r.started_at at time zone 'utc') at time zone 'utc' as ts
    from public.wallgold_collection_runs r
    where r.started_at >= p_from
      and r.started_at <= p_to
  )
  select e.ts
  from expected e
  left join actual a on a.ts = e.ts
  where a.ts is null
  order by e.ts
  limit 5000;
$$;

comment on function public.wallgold_missing_intervals(timestamptz, timestamptz, interval) is
  'Minute slots inside [p_from, p_to] where no collector run was recorded.';

-- ---------------------------------------------------------------------------
-- 5) One-round-trip health stats for the dashboard health page /api/health.
-- ---------------------------------------------------------------------------
create or replace function public.wallgold_collection_stats()
returns table (
  total_runs              bigint,
  last_run_at             timestamptz,
  last_success_at         timestamptz,
  failed_runs_24h         bigint,
  duplicate_runs_24h      bigint,
  price_snapshots         bigint,
  price_payloads          bigint,
  livedata_snapshots      bigint,
  last_collected_at       timestamptz,
  last_source_updated_at  timestamptz,
  last_price_source_ts    bigint
)
language sql
stable
parallel safe
as $$
  select
    (select count(*) from public.wallgold_collection_runs)                              as total_runs,
    (select max(started_at) from public.wallgold_collection_runs)                       as last_run_at,
    (select max(finished_at) from public.wallgold_collection_runs
      where status in ('ok', 'partial', 'duplicate'))                                   as last_success_at,
    (select count(*) from public.wallgold_collection_runs
      where started_at >= now() - interval '24 hours' and status = 'failed')            as failed_runs_24h,
    (select count(*) from public.wallgold_collection_runs
      where started_at >= now() - interval '24 hours' and status = 'duplicate')         as duplicate_runs_24h,
    (select count(*) from public.wallgold_price_snapshots)                              as price_snapshots,
    (select count(*) from public.wallgold_prices)                                       as price_payloads,
    (select count(*) from public.wallgold_livedata)                                     as livedata_snapshots,
    (select max(collected_at) from public.wallgold_prices)                              as last_collected_at,
    (select max(source_updated_at) from public.wallgold_livedata)                       as last_source_updated_at,
    (select max(source_last_realtime_ts) from public.wallgold_prices)                   as last_price_source_ts;
$$;

comment on function public.wallgold_collection_stats() is
  'Aggregated collector/database health counters in a single round trip.';

-- ---------------------------------------------------------------------------
-- Grants: parameterized, read-only functions are safe for the public/anon key.
-- ---------------------------------------------------------------------------
grant execute on function public.wallgold_price_series(text, timestamptz, timestamptz, text)
  to anon, authenticated, service_role;
grant execute on function public.wallgold_flow_series(timestamptz, timestamptz, text)
  to anon, authenticated, service_role;
grant execute on function public.wallgold_missing_intervals(timestamptz, timestamptz, interval)
  to anon, authenticated, service_role;
grant execute on function public.wallgold_collection_stats()
  to anon, authenticated, service_role;
