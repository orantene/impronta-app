#!/usr/bin/env bash
# Staging smoke test. Run after re-aliasing a preview to staging.tulala.digital,
# before promoting to production (post-launch). Pre-launch this is optional.
#
# Expected: staging.tulala.digital 200

set -uo pipefail

HOST="staging.tulala.digital"
GOT=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://${HOST}/" || echo "ERR")

if [[ "$GOT" == "200" ]]; then
  printf "  %-30s  %-3s  ok\n" "$HOST" "$GOT"
  exit 0
fi

printf "  %-30s  %-3s  FAIL (expected 200)\n" "$HOST" "$GOT"
echo
echo "Staging not reachable. Confirm the host is seeded in agency_domains and"
echo "the alias points to a reachable preview deployment:"
echo "  vercel alias set <preview-url> staging.tulala.digital --scope oran-tenes-projects"
exit 1
