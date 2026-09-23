#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# CI-only: start / stop the Supabase HTTP surface for the cluster that
# `local-postgres.sh` built, WITHOUT Docker.
#
#   /rest/v1  → a real PostgREST binary (static, no runtime deps)
#   /auth/v1  → the minimal stand-in in local-services.mjs
#
# Read the header of `local-services.mjs` for exactly what is faithful and what
# is a stand-in. This script only does the two things that belong in a shell:
# prepare the ROLES PostgREST needs (a service-level concern a real Supabase
# project's roles already have, not application schema), and supervise the
# process.
#
# USAGE
#   eval "$(PGPORT=55700 bash supabase/ci/local-postgres.sh env)"
#   bash supabase/ci/local-services.sh up       # start, wait until ready
#   bash supabase/ci/local-services.sh env      # print SUPABASE_* exports
#   bash supabase/ci/local-services.sh down     # stop
#   bash supabase/ci/local-services.sh status
#
# Knobs: SUPABASE_PORT (54321), PGRST_PORT (3111), POSTGREST_BIN,
#        RUNTIME_DIR (/tmp) for the pid/log/conf files, plus the usual PG*.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
RUNTIME_DIR="${RUNTIME_DIR:-/tmp}"
SUPABASE_PORT="${SUPABASE_PORT:-54321}"
PGRST_PORT="${PGRST_PORT:-3111}"
PIDFILE="$RUNTIME_DIR/impronta-local-services.pid"
LOGFILE="$RUNTIME_DIR/impronta-local-services.log"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD RUNTIME_DIR SUPABASE_PORT PGRST_PORT

log() { printf '[local-services] %s\n' "$*" >&2; }

# ── roles PostgREST needs ────────────────────────────────────────────────────
# A real Supabase project ships these: `authenticator` LOGINs and is the role
# PostgREST connects as; `service_role` BYPASSRLS, which is exactly why a
# service-role key can seed. local-postgres.sh creates the roles NOLOGIN
# because nothing connected as them while only migrations ran. Granting the two
# attributes here keeps that bootstrap about SCHEMA and this script about
# SERVICES; it adds no application object.
prepare_roles() {
  psql -X -q -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<SQL || return 1
ALTER ROLE authenticator WITH LOGIN PASSWORD '${PGPASSWORD}';
ALTER ROLE service_role  WITH BYPASSRLS;
ALTER ROLE authenticated WITH NOBYPASSRLS;
ALTER ROLE anon          WITH NOBYPASSRLS;
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
}

running() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

cmd_up() {
  if running; then log "already running (pid $(cat "$PIDFILE")) on port $SUPABASE_PORT"; return 0; fi
  command -v psql >/dev/null || { log "psql not found"; return 1; }
  prepare_roles || { log "could not prepare roles on $PGHOST:$PGPORT"; return 1; }

  log "starting gateway on 127.0.0.1:$SUPABASE_PORT (log: $LOGFILE)"
  nohup node "$HERE/local-services.mjs" >"$LOGFILE" 2>&1 &
  echo $! > "$PIDFILE"

  local deadline=$((SECONDS + 60))
  until curl -fsS "http://127.0.0.1:$SUPABASE_PORT/auth/v1/health" >/dev/null 2>&1; do
    if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      log "gateway died on startup:"; tail -20 "$LOGFILE" >&2; rm -f "$PIDFILE"; return 1
    fi
    [ $SECONDS -gt $deadline ] && { log "gateway not ready in 60s"; tail -20 "$LOGFILE" >&2; return 1; }
    sleep 0.5
  done
  log "ready: http://127.0.0.1:$SUPABASE_PORT"
}

cmd_down() {
  if running; then
    local pid; pid="$(cat "$PIDFILE")"
    kill "$pid" 2>/dev/null
    sleep 0.5
    kill -9 "$pid" 2>/dev/null
  fi
  pkill -f "postgrest .*impronta-postgrest.conf" 2>/dev/null
  rm -f "$PIDFILE"
  log "stopped"
}

cmd_env() { node "$HERE/local-services.mjs" --print-keys; }

cmd_status() {
  if running; then log "running (pid $(cat "$PIDFILE")) http://127.0.0.1:$SUPABASE_PORT"; else log "not running"; return 1; fi
}

case "${1:-up}" in
  up|start) cmd_up ;;
  down|stop) cmd_down ;;
  env) cmd_env ;;
  status) cmd_status ;;
  *) log "usage: $0 {up|down|env|status}"; exit 2 ;;
esac
