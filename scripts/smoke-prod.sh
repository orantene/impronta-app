#!/usr/bin/env bash
# Production smoke test. Run after every `vercel promote` or whenever you want
# to verify the live surfaces are healthy.
#
# Expected:
#   tulala.digital            200
#   www.tulala.digital        308 -> https://tulala.digital/
#   app.tulala.digital        200
#   impronta.tulala.digital   308 -> https://improntamodels.com/
#
# Exits non-zero if any host fails or returns an unexpected status.

set -uo pipefail

HOSTS=(
  "tulala.digital:200"
  "www.tulala.digital:308"
  "app.tulala.digital:200"
  "impronta.tulala.digital:308"
)

FAIL=0

for ENTRY in "${HOSTS[@]}"; do
  HOST="${ENTRY%:*}"
  WANT="${ENTRY#*:}"
  HEADERS=$(mktemp)
  GOT=$(curl -sS -D "$HEADERS" -o /dev/null -w "%{http_code}" --max-time 20 "https://${HOST}/" || echo "ERR")
  if [[ "$GOT" == "$WANT" ]]; then
    printf "  %-30s  %-3s  ok\n" "$HOST" "$GOT"
  else
    printf "  %-30s  %-3s  FAIL (expected %s)\n" "$HOST" "$GOT" "$WANT"
    if grep -qi "_vercel_sso_nonce\\|x-vercel-protection" "$HEADERS"; then
      printf "  %-30s       hint: Vercel protection/SSO response detected\n" "$HOST"
    fi
    FAIL=1
  fi
  rm -f "$HEADERS"
done

if [[ $FAIL -ne 0 ]]; then
  echo
  echo "Production smoke FAILED. Check Vercel dashboard + post-deploy alias workflow."
  exit 1
fi

echo
echo "All hosts healthy."
