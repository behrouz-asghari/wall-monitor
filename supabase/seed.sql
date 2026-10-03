-- ---------------------------------------------------------------------------
-- seed.sql — DEMO DATA ONLY. NEVER RUN THIS AGAINST PRODUCTION.
--
-- Purpose: local UI development before the collector has real history.
-- Every row inserted here is marked with raw_json."DEMO_DATA" = true so it is
-- trivially distinguishable from real WallGold data.
--
-- Usage (local dev only):
--   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
--
-- To remove demo data afterwards (snapshots cascade via FK on purpose):
--   DELETE FROM wallgold_prices   WHERE raw_json->>'DEMO_DATA' IS NOT NULL;
--   DELETE FROM wallgold_livedata WHERE raw_json->>'DEMO_DATA' IS NOT NULL;
--
-- NOTE: demo rows use collected_at timestamps relative to now() but source
-- timestamps in the distant past, so the first real collection never conflicts
-- with them. Real WallGold history is NEVER fabricated — this file exists only
-- to render charts/tables during development.
-- ---------------------------------------------------------------------------

begin;

-- Synthetic prices.json payloads every 5 minutes over the last 6 hours ----------
with slots as (
  select n,
         date_trunc('minute', now()) - (n * interval '5 minutes') as ts,
         1791000000 - (n * 300)                                   as src_ts
  from generate_series(0, 71) as n
),
payloads as (
  select
    slots.n,
    slots.ts,
    slots.src_ts,
    jsonb_build_object(
      'DEMO_DATA', true,
      'indicators', jsonb_build_object(
        'gold18k', jsonb_build_object(
          'price', 26000000 + (slots.n * 10000),
          'open', null,
          'high', 26100000 + (slots.n * 10000),
          'low', 25900000 + (slots.n * 10000),
          'change_amount', 100000,
          'change_percent', 0.4,
          'direction', 'high',
          'updated_ms', (extract(epoch from slots.ts) * 1000)::bigint,
          'unit', 'تومان',
          'divide10', false,
          'decimals', 0,
          'prev', jsonb_build_object('close', 25800000, 'open', 25700000, 'high', 25900000, 'low', 25600000)
        ),
        'price_dollar_rl', jsonb_build_object(
          'price', 820000 + (slots.n * 500),
          'open', 818000,
          'high', 825000,
          'low', 815000,
          'change_amount', 4000,
          'change_percent', 0.5,
          'direction', 'high',
          'updated_ms', (extract(epoch from slots.ts) * 1000)::bigint,
          'unit', 'تومان',
          'divide10', false,
          'decimals', 0,
          'prev', jsonb_build_object('close', 816000, 'open', 814000, 'high', 820000, 'low', 810000)
        ),
        'ons', jsonb_build_object(
          'price', 4140.19,
          'open', 4141.3,
          'high', 4142.22,
          'low', 4135.91,
          'change_amount', 3.18,
          'change_percent', 0.08,
          'direction', 'low',
          'updated_ms', (extract(epoch from slots.ts) * 1000)::bigint,
          'unit', 'دلار',
          'divide10', false,
          'decimals', 2,
          'prev', jsonb_build_object('close', 4137.01, 'open', 4138.0, 'high', 4145.0, 'low', 4130.0)
        ),
        'silver_999', jsonb_build_object(
          'price', 5284000 + (slots.n * 1000),
          'open', 5284000,
          'high', 5300000,
          'low', 5270000,
          'change_amount', 55800,
          'change_percent', 1.07,
          'direction', 'high',
          'updated_ms', (extract(epoch from slots.ts) * 1000)::bigint,
          'unit', 'تومان',
          'divide10', true,
          'decimals', 0,
          'prev', jsonb_build_object('close', 4666100, 'open', 4507700, 'high', 4700900, 'low', 4485100)
        )
      ),
      'last_realtime', to_char(slots.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
      'last_realtime_ts', slots.src_ts,
      'icon_up', null,
      'icon_down', null
    ) as body
  from slots
),
inserted as (
  insert into public.wallgold_prices (source_last_realtime, source_last_realtime_ts, collected_at, raw_json)
  select
    to_char(p.ts AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    p.src_ts,
    p.ts,
    p.body
  from payloads p
  order by p.ts
  returning id, collected_at, raw_json
)
insert into public.wallgold_price_snapshots (
  snapshot_id, collected_at, symbol,
  price, open, high, low, change_amount, change_percent,
  direction, updated_ms, unit, divide10, decimals
)
select
  i.id,
  i.collected_at,
  sym.symbol,
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'price')::numeric,
  nullif(i.raw_json -> 'indicators' -> sym.symbol ->> 'open', '')::numeric,
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'high')::numeric,
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'low')::numeric,
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'change_amount')::numeric,
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'change_percent')::numeric,
  i.raw_json -> 'indicators' -> sym.symbol ->> 'direction',
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'updated_ms')::bigint,
  i.raw_json -> 'indicators' -> sym.symbol ->> 'unit',
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'divide10')::boolean,
  (i.raw_json -> 'indicators' -> sym.symbol ->> 'decimals')::smallint
from inserted i,
     jsonb_object_keys(i.raw_json -> 'indicators') as sym(symbol);

-- Synthetic livedata.json snapshots every 5 minutes over the last 6 hours ------
insert into public.wallgold_livedata (
  source_updated_at, valid_until, collected_at,
  trade_last_minute_toman,
  deposit_last_minute_toman, deposit_last_hour_volume_toman,
  withdraw_last_minute_toman, withdraw_last_hour_volume_toman,
  delivery_last_request_at, delivery_today_count, delivery_last_minute_count,
  raw_json
)
select
  ts,
  ts + interval '1 minute',
  ts,
  700000000 + (g * 1000000),
  400000000 + (g * 500000),
  24000000000 + (g * 100000000),
  80000000 + (g * 200000),
  8000000000 + (g * 40000000),
  ts - interval '3 minutes',
  60 + g,
  g % 3,
  jsonb_build_object(
    'DEMO_DATA', true,
    'source', 'DEMO DATA',
    'updatedAt', to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ'),
    'validUntil', to_char((ts + interval '1 minute') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ'),
    'trade', jsonb_build_object('lastMinuteToman', 700000000 + (g * 1000000)),
    'deposit', jsonb_build_object('lastMinuteToman', 400000000 + (g * 500000), 'lastHourVolumeToman', 24000000000 + (g * 100000000)),
    'withdraw', jsonb_build_object('lastMinuteToman', 80000000 + (g * 200000), 'lastHourVolumeToman', 8000000000 + (g * 40000000)),
    'delivery', jsonb_build_object('lastRequestAt', to_char((ts - interval '3 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ'), 'todayCount', 60 + g, 'lastMinuteCount', g % 3)
  )
from (
  select g, date_trunc('minute', now()) - (g * interval '5 minutes') as ts
  from generate_series(0, 71) as g
) slots
order by ts;

commit;

-- DEMO DATA: 72 price payloads + 288 price rows + 72 flow rows (6h @ 5min).
