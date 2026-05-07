#!/usr/bin/env bash
# Impronta production smoke test.
# Focuses on the current branded production host flow:
#   impronta.tulala.digital -> improntamodels.com

set -uo pipefail

FAIL=0

check_status() {
  local url="$1"
  local want="$2"
  local got
  got=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$url" || echo "ERR")
  if [[ "$got" == "$want" ]]; then
    printf "  %-52s %-3s  ok\n" "$url" "$got"
  else
    printf "  %-52s %-3s  FAIL (expected %s)\n" "$url" "$got" "$want"
    FAIL=1
  fi
}

check_redirect_location() {
  local url="$1"
  local want="$2"
  local got
  got=$(curl -sS -I --max-time 20 "$url" \
    | awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0,11)}' \
    | tail -n1)
  if [[ "$got" == "$want" ]]; then
    printf "  %-52s %s\n" "$url" "Location ok"
  else
    printf "  %-52s %s\n" "$url" "Location FAIL (expected $want, got ${got:-<none>})"
    FAIL=1
  fi
}

check_tls_and_redirect_www() {
  local head_out
  if ! head_out=$(curl -sS -I --max-time 20 "https://www.improntamodels.com/" 2>&1); then
    printf "  %-52s %s\n" "https://www.improntamodels.com/" "TLS/HTTP FAIL (${head_out%%$'\n'*})"
    FAIL=1
    return
  fi
  local location
  location=$(printf "%s\n" "$head_out" \
    | awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $0); print substr($0,11)}' \
    | tail -n1)
  if [[ "$location" == "https://improntamodels.com/" ]]; then
    printf "  %-52s %s\n" "https://www.improntamodels.com/" "TLS ok + redirect ok"
  else
    printf "  %-52s %s\n" "https://www.improntamodels.com/" "TLS ok + redirect FAIL (got ${location:-<none>})"
    FAIL=1
  fi
}

check_status "https://impronta.tulala.digital/" "308"
check_redirect_location "https://impronta.tulala.digital/" "https://improntamodels.com/"
check_status "https://impronta.tulala.digital/login" "308"
check_redirect_location "https://impronta.tulala.digital/login" "https://improntamodels.com/login"

check_status "https://improntamodels.com/" "200"
check_status "https://improntamodels.com/login" "200"
check_status "https://improntamodels.com/impronta/admin" "307"
check_redirect_location "https://improntamodels.com/impronta/admin" "/login?next=/impronta/admin"

check_tls_and_redirect_www

if [[ $FAIL -ne 0 ]]; then
  echo
  echo "Impronta smoke FAILED."
  exit 1
fi

echo
echo "Impronta hosts healthy."
