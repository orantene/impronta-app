#!/usr/bin/env bash
# Onboarding QA dev stack: next dev :3008 (isolated Supabase via this
# worktree's .env.local) + host proxies so the marketing host (:3105) and the
# app host (:3106) both resolve without /etc/hosts edits in the browser.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cleanup() { jobs -p | xargs kill 2>/dev/null || true; }
trap cleanup EXIT INT TERM
grep -q 'fxlankepwnvelxjrahwk' "$ROOT/web/.env.local" || { echo "refusing: web/.env.local is not the isolated project"; exit 2; }
( cd "$ROOT/web" && PORT=3008 TULALA_ALLOW_DEV_SURFACES=1 NODE_OPTIONS=--max-old-space-size=9216 npx next dev -p 3008 ) &
sleep 3
node "$ROOT/scripts/local-host-proxy.mjs" 3105 marketing.local 3008 &
node "$ROOT/scripts/local-host-proxy.mjs" 3106 app.local 3008 &
node "$ROOT/scripts/local-host-proxy.mjs" 3103 qa-journeys.local 3008 &
wait
