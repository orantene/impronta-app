#!/usr/bin/env bash
# qa-prod-local.sh — serve a PRODUCTION build of this worktree on localhost
# for fast local QA of the talent dashboard.
#
# Why: `next dev` (Turbopack) compiles /talent/* on first hit (40-230 s on a
# swapping 16 GB Mac), answers 404 while it compiles, and ships ~30 MB of
# unminified JS that takes a minute+ to hydrate. A production build is
# minified, pre-compiled and never recompiles under you.
#
# Usage (from web/):
#   bash scripts/qa-prod-local.sh            # build, then start on :3002
#   bash scripts/qa-prod-local.sh build      # build only
#   bash scripts/qa-prod-local.sh start      # start the existing build only
#   QA_PORT=3003 bash scripts/qa-prod-local.sh
#
# Sign-in: /api/dev/signin is 403 under `next start` (NODE_ENV=production).
# Supabase auth cookies are scoped to the host `localhost`, NOT the port, so
# sign in once on a dev server (e.g. http://localhost:3001/api/dev/signin?...)
# and the same browser session is signed in on http://localhost:3002.
# Host gate: localhost:<port> resolves via the `localhost` row in
# public.agency_domains (the port is stripped before lookup).
#
# Memory: one build worker (next.config `experimental.cpus: 1`), a capped
# heap, no Sentry source-map upload. The dev server writes to .next/dev, so a
# build here does not disturb a running `next dev` in the same worktree.
set -euo pipefail

cd "$(dirname "$0")/.."
MODE="${1:-all}"
PORT="${QA_PORT:-3002}"
HEAP_MB="${QA_BUILD_HEAP_MB:-4096}"

export NEXT_TELEMETRY_DISABLED=1
# Never upload source maps / create Sentry releases from a local QA build.
export SENTRY_AUTH_TOKEN=""
export SENTRY_UPLOAD_DISABLED=1

ts() { date +%s; }

if [[ "$MODE" == "all" || "$MODE" == "build" ]]; then
  echo "[qa-prod] building (heap ${HEAP_MB} MB, 1 worker) ..."
  t0=$(ts)
  NODE_OPTIONS="--max-old-space-size=${HEAP_MB}" npx next build
  t1=$(ts)
  echo "[qa-prod] build finished in $((t1 - t0)) s"
fi

if [[ "$MODE" == "all" || "$MODE" == "start" ]]; then
  if [[ ! -f .next/BUILD_ID ]]; then
    echo "[qa-prod] no production build in .next (run: $0 build)" >&2
    exit 1
  fi
  echo "[qa-prod] serving build $(cat .next/BUILD_ID) on http://localhost:${PORT}"
  exec env NODE_OPTIONS="--max-old-space-size=2048" npx next start -p "$PORT"
fi
