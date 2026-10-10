#!/usr/bin/env bash
# Start the isolated Live-QA stack (fxlank ONLY). Never production.
#
#   cd web && ./scripts/qa/start-isolated-stack.sh
#
# Builds a production Next server on :3008, then host proxies:
#   :3105 → marketing.local → :3008
#   :3106 → app.local → :3008
#
# Refuses unless the Supabase URL is the isolated project (fxlankepwnvelxjrahwk)
# and JOURNEYS_ISOLATED=1. Prints PIDs; stop with stop-isolated-stack.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$ROOT/web"
PID_FILE="${ISOLATED_STACK_PID_FILE:-$WEB/.isolated-stack.pids}"
UPSTREAM_PORT="${QA_PACK_SITE_PORT:-3008}"
MARKETING_PORT=3105
APP_PORT=3106
ISOLATED_REF="fxlankepwnvelxjrahwk"

fail() { echo "[start-isolated-stack] refusing: $*" >&2; exit 2; }

# Prefer an explicit env file (caller sources it), else web/.env.local.
if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" && -f "$WEB/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$WEB/.env.local"
  set +a
fi

[[ "${JOURNEYS_ISOLATED:-}" == "1" ]] || fail "JOURNEYS_ISOLATED=1 required"
[[ "${NEXT_PUBLIC_SUPABASE_URL:-}" == *"$ISOLATED_REF"* ]] || fail "NEXT_PUBLIC_SUPABASE_URL must be the isolated project ($ISOLATED_REF)"
if [[ -n "${STRIPE_SECRET_KEY:-}" && "$STRIPE_SECRET_KEY" == *_live_* ]]; then
  fail "STRIPE_SECRET_KEY is a LIVE key"
fi
if [[ -n "${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}" && "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" == *_live_* ]]; then
  fail "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a LIVE key"
fi

if [[ -f "$PID_FILE" ]]; then
  fail "PID file already exists ($PID_FILE). Run stop-isolated-stack.sh first."
fi

PROXY="$ROOT/scripts/local-host-proxy.mjs"
[[ -f "$PROXY" ]] || fail "missing $PROXY"

echo "[start-isolated-stack] building (isolated fxlank)…"
(
  cd "$WEB"
  npm run build
)

echo "[start-isolated-stack] starting next on :$UPSTREAM_PORT…"
(
  cd "$WEB"
  PORT="$UPSTREAM_PORT" \
  TULALA_ALLOW_DEV_SURFACES="${TULALA_ALLOW_DEV_SURFACES:-1}" \
  TULALA_MARKETING_ORIGIN="${TULALA_MARKETING_ORIGIN:-http://localhost:$MARKETING_PORT}" \
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=9216}" \
  npx next start -p "$UPSTREAM_PORT"
) &
SERVER_PID=$!

sleep 2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  fail "next start exited immediately (pid $SERVER_PID)"
fi

echo "[start-isolated-stack] starting host proxies…"
node "$PROXY" "$MARKETING_PORT" marketing.local "$UPSTREAM_PORT" &
MARKETING_PID=$!
node "$PROXY" "$APP_PORT" app.local "$UPSTREAM_PORT" &
APP_PID=$!

sleep 1
for pid in "$SERVER_PID" "$MARKETING_PID" "$APP_PID"; do
  kill -0 "$pid" 2>/dev/null || fail "process $pid died during start"
done

umask 077
printf 'SERVER_PID=%s\nMARKETING_PID=%s\nAPP_PID=%s\nUPSTREAM_PORT=%s\nMARKETING_PORT=%s\nAPP_PORT=%s\nSTARTED_AT=%s\n' \
  "$SERVER_PID" "$MARKETING_PID" "$APP_PID" \
  "$UPSTREAM_PORT" "$MARKETING_PORT" "$APP_PORT" \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$PID_FILE"

cat <<EOF
[start-isolated-stack] ready (isolated fxlank only)
  next        pid=$SERVER_PID  http://127.0.0.1:$UPSTREAM_PORT
  marketing   pid=$MARKETING_PID  http://localhost:$MARKETING_PORT  (Host: marketing.local)
  app         pid=$APP_PID  http://localhost:$APP_PORT  (Host: app.local)
  pid file    $PID_FILE
  stop with   ./scripts/qa/stop-isolated-stack.sh
EOF
