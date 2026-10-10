#!/usr/bin/env bash
# Stop the isolated Live-QA stack started by start-isolated-stack.sh.
# Kills only the PIDs recorded in the pid file. Never touches production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WEB="$ROOT/web"
PID_FILE="${ISOLATED_STACK_PID_FILE:-$WEB/.isolated-stack.pids}"

if [[ ! -f "$PID_FILE" ]]; then
  echo "[stop-isolated-stack] no pid file at $PID_FILE (nothing to stop)"
  exit 0
fi

# shellcheck disable=SC1090
. "$PID_FILE"

stop_one() {
  local name="$1" pid="${2:-}"
  if [[ -z "$pid" ]]; then
    echo "[stop-isolated-stack] $name: no pid recorded"
    return 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "[stop-isolated-stack] $name pid=$pid already gone"
    return 0
  fi
  echo "[stop-isolated-stack] stopping $name pid=$pid"
  kill "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.3
  done
  echo "[stop-isolated-stack] $name pid=$pid still alive; sending KILL"
  kill -9 "$pid" 2>/dev/null || true
}

stop_one "app-proxy" "${APP_PID:-}"
stop_one "marketing-proxy" "${MARKETING_PID:-}"
stop_one "next-server" "${SERVER_PID:-}"

rm -f "$PID_FILE"
echo "[stop-isolated-stack] done"
