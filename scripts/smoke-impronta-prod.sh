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

# An anonymous hit on an admin URL must END at the login page — never render
# the admin. Assert the end of the redirect chain rather than the shape of one
# hop: since the branded-host canonical-admin work, /{slug}/admin first 308s to
# the canonical /admin and only then does the auth gate 307 to /login?next=…
# Pinning the single 307 made this smoke report a FAIL against a site that was
# behaving correctly (and, worse, would have stayed red until someone assumed
# the check itself was noise). Following the chain also makes the check
# STRONGER: if the admin ever answered 200 anonymously, final_url would be the
# admin URL and this fails, which a single-hop assertion could miss.
check_admin_requires_login() {
  local url="$1"
  local want_glob="$2"
  local out final_url final_code
  out=$(curl -sS -L --max-time 30 -o /dev/null \
    -w '%{url_effective} %{http_code}' "$url" 2>/dev/null) || out="ERR ERR"
  final_url="${out%% *}"
  final_code="${out##* }"
  # shellcheck disable=SC2053  # want_glob is intentionally a pattern
  if [[ "$final_code" == "200" && "$final_url" == $want_glob ]]; then
    printf "  %-52s %s\n" "$url" "gated ok (→ $final_url)"
  else
    printf "  %-52s %s\n" "$url" \
      "FAIL (expected a login page matching $want_glob, got $final_url [$final_code])"
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
# The `next` value is matched loosely (…admin…) so a future change to which
# admin path is canonical can't fail a correctly-gated site; landing on
# improntamodels.com/login is what actually matters.
check_admin_requires_login "https://improntamodels.com/impronta/admin" \
  "https://improntamodels.com/login?next=*admin*"
check_admin_requires_login "https://improntamodels.com/admin" \
  "https://improntamodels.com/login?next=*admin*"

check_tls_and_redirect_www

if [[ $FAIL -ne 0 ]]; then
  echo
  echo "Impronta smoke FAILED."
  exit 1
fi

echo
echo "Impronta hosts healthy."
