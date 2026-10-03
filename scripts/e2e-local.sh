#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# e2e-local.sh — full local pipeline verification (no Docker required).
#
#   WallGold -> collector -> mock PostgREST -> query layer -> routes/pages
#
# Requires: npm install && npm run build (and network access to wallgold.ir)
# Never touches a production database.
# ---------------------------------------------------------------------------
set -u
cd "$(dirname "$0")/.."

CRON_SECRET="${CRON_SECRET:-e2e-local-secret}"
APP_PORT="${APP_PORT:-3100}"
MOCK_PORT="${MOCK_PORT:-54321}"

MOCK_LOG=mockdb.log
APP_LOG=next-server.log
rm -f "$MOCK_LOG" "$APP_LOG"

echo "==> starting in-memory PostgREST shim on :$MOCK_PORT"
MOCK_POSTGREST_PORT="$MOCK_PORT" node --import tsx scripts/mock-postgrest.ts > "$MOCK_LOG" 2>&1 &
MOCK_PID=$!

echo "==> starting production Next.js server on :$APP_PORT"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$MOCK_PORT" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="mock-anon-key" \
SUPABASE_SERVICE_ROLE_KEY="mock-service-role-key" \
CRON_SECRET="$CRON_SECRET" \
npx next start -p "$APP_PORT" > "$APP_LOG" 2>&1 &
APP_PID=$!

cleanup() {
  kill "$MOCK_PID" "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT

APP="http://127.0.0.1:$APP_PORT"

echo "==> waiting for servers"
for i in $(seq 1 60); do
  if curl -sf -o /dev/null "$APP/api/health" 2>/dev/null && curl -sf -o /dev/null "http://127.0.0.1:$MOCK_PORT/health" 2>/dev/null; then
    break
  fi
  sleep 1
done

pass=0
fail=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    pass=$((pass + 1)); echo "  PASS: $1 ($3)"
  else
    fail=$((fail + 1)); echo "  FAIL: $1 — expected [$2] got [$3]"
  fi
}

echo
echo "==> 1. cron security"
code=$(curl -s -o /dev/null -w "%{http_code}" "$APP/api/cron/wallgold")
check "cron without secret -> 401" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer wrong" "$APP/api/cron/wallgold")
check "cron wrong bearer -> 401" 401 "$code"

echo
echo "==> 2. collector run #1 (real WallGold fetch)"
run1=$(curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/wallgold")
echo "  response: $run1"
echo "$run1" | grep -q '"success": *true' && check "run1 success" ok ok || check "run1 success" ok failed
echo "$run1" | grep -q '"liveData": *true' && check "run1 liveData stored" ok ok || check "run1 liveData stored" ok failed
echo "$run1" | grep -q '"prices": *true' && check "run1 prices stored" ok ok || check "run1 prices stored" ok failed

echo
echo "==> 3. collector run #2 (must be idempotent: duplicate_snapshot)"
run2=$(curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/wallgold")
echo "  response: $run2"
echo "$run2" | grep -q '"reason": *"duplicate_snapshot"' \
  && check "run2 duplicate_snapshot" ok ok || check "run2 duplicate_snapshot" ok failed

echo
echo "==> 4. read APIs"
code=$(curl -s -o /dev/null -w "%{http_code}" "$APP/api/health")
check "/api/health -> 200" 200 "$code"
health=$(curl -s "$APP/api/health")
echo "  health: $health"
echo "$health" | grep -q '"database": *"ok"' && check "health database ok" ok ok || check "health database ok" ok failed

prices=$(curl -s "$APP/api/prices")
echo "$prices" | grep -q '"success": *true' && check "/api/prices success" ok ok || check "/api/prices success" ok failed
echo "$prices" | grep -q 'gold18k' && check "/api/prices contains gold18k" ok ok || check "/api/prices contains gold18k" ok failed

hist=$(curl -s "$APP/api/prices/history?symbol=gold18k&range=24H")
echo "$hist" | grep -q '"success": *true' && check "/api/prices/history success" ok ok || check "/api/prices/history success" ok failed
echo "$hist" | grep -q '"points"' && check "/api/prices/history has points" ok ok || check "/api/prices/history has points" ok failed
echo "  history snippet: $(echo "$hist" | head -c 220)"

code=$(curl -s -o /dev/null -w "%{http_code}" "$APP/api/prices/history?symbol=bad-value!&range=24H")
check "invalid symbol -> 400" 400 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$APP/api/prices/history?symbol=gold18k&range=99X")
check "invalid range -> 400" 400 "$code"

flows=$(curl -s "$APP/api/flows?range=24H")
echo "$flows" | grep -q '"netFlow"' && check "/api/flows has netFlow" ok ok || check "/api/flows has netFlow" ok failed

echo
echo "==> 5. dashboard pages render with real data"
for path in / /dashboard /dashboard/prices /dashboard/flows /dashboard/history /dashboard/correlation /dashboard/health; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$APP$path")
  check "GET $path -> 200" 200 "$code"
done

dash=$(curl -s "$APP/dashboard")
echo "$dash" | grep -q 'طلای ۱۸' && check "dashboard shows market card (طلای ۱۸)" ok ok || check "dashboard shows market card" ok failed
echo "$dash" | grep -q 'dir="rtl"' && check "dashboard is RTL" ok ok || check "dashboard is RTL" ok failed
echo "$dash" | grep -q 'سلامت داده' && check "dashboard shows health section" ok ok || check "dashboard shows health section" ok failed

health_page=$(curl -s "$APP/dashboard/health")
echo "$health_page" | grep -q 'آخرین اجرای کلنکتور' && check "health page shows last run" ok ok || check "health page shows last run" ok failed

echo
echo "==> 6. security: no service-role key in client-served output"
leaks=$( (curl -s "$APP/dashboard"; curl -s "$APP/") | grep -c "mock-service-role-key" || true)
check "service key absent from HTML" 0 "$leaks"
static_leaks=$(grep -rl "mock-service-role-key" .next/static 2>/dev/null | wc -l | tr -d ' ')
check "service key absent from static bundles" 0 "$static_leaks"

echo
echo "==> 7. structured collector log lines (no secrets)"
log_lines=$(grep -c '"scope":"collector"' "$APP_LOG" || true)
check "collector structured logs present" ok "$([ "$log_lines" -gt 0 ] && echo ok || echo missing)"
secret_in_logs=$(grep -c "mock-service-role-key" "$APP_LOG" || true)
check "no service key in server logs" 0 "$secret_in_logs"

echo
echo "=================================================="
echo "  E2E result: $pass passed, $fail failed"
echo "=================================================="
[ "$fail" -eq 0 ]
