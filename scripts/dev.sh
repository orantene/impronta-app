#!/usr/bin/env bash
# Local dev orchestrator.
#
# Starts:
#   - next dev on :3000              (the upstream)
#   - host-rewriting proxy on :3102  (Host: app.local)
#
# Add more proxies here when you need to test other tenant subdomains
# (e.g. impronta.local on 3104, midnight.local on 3106). Each must also
# be seeded in `public.agency_domains` or middleware will return 404.
#
# Usage:
#   ./scripts/dev.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/web"

cleanup() {
  echo
  echo "Stopping dev processes..."
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev] starting next dev on :3000"
( cd "$WEB" && npm run dev ) &

# Give Next a head start so the proxy doesn't 502 on first request.
sleep 2

echo "[dev] starting host-proxy :3102 -> Host: app.local -> :3000"
node "$ROOT/scripts/local-host-proxy.mjs" 3102 app.local &

echo
echo "Ready:"
echo "  http://localhost:3000           # default host (admin/dev)"
echo "  http://app.local:3102           # app.tulala.digital equivalent"
echo
echo "Add /etc/hosts entries if you want to type 'app.local' in the browser:"
echo "  127.0.0.1  app.local marketing.local impronta.local"
echo

wait
