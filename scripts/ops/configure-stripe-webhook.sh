#!/usr/bin/env bash
# Item #22 ops script — configure Stripe webhook endpoint + subscribe to all
# event types the platform's webhook routes handle.
#
# Requires:
#   - stripe CLI installed: brew install stripe/stripe-cli/stripe
#   - logged in: stripe login
#
# Usage:
#   ./scripts/ops/configure-stripe-webhook.sh test
#   ./scripts/ops/configure-stripe-webhook.sh live
#   ./scripts/ops/configure-stripe-webhook.sh test mx   # the MX platform endpoint (STRIPE_API_KEY = the MX secret key)
#   ./scripts/ops/configure-stripe-webhook.sh test us --update we_123 [--dry-run]
#       UPDATE mode (TUL-1719): add the events below to an EXISTING endpoint instead of creating a second one. It only
#       ever ADDS (the union of what the endpoint already receives and this list); it never removes an event, and an
#       endpoint that already receives "*" is left alone. --dry-run prints what would be added and changes nothing.
#
# Notes:
#   - Defaults to test mode if no arg.
#   - Prints the signing secret at the end — copy into Vercel:
#       vercel env add STRIPE_WEBHOOK_SECRET production
#   - Webhook endpoint is https://app.tulala.digital/api/stripe/webhook
#     by default; override via WEBHOOK_URL env var.

set -euo pipefail

MODE="${1:-test}"
PLATFORM="${2:-us}"
case "$PLATFORM" in --*) PLATFORM="us" ;; esac
UPDATE_ID=""
DRY_RUN=0
ARGS=("$@")
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  case "${ARGS[$i]}" in
    --update) UPDATE_ID="${ARGS[$((i + 1))]:-}" ;;
    --update=*) UPDATE_ID="${ARGS[$i]#--update=}" ;;
    --dry-run) DRY_RUN=1 ;;
  esac
done
if [ "${ARGS[*]:-}" != "${ARGS[*]/--update/}" ] && [ -z "$UPDATE_ID" ]; then
  echo "ERROR: --update needs an endpoint id (we_...)"
  exit 1
fi
if [ "$PLATFORM" = "mx" ]; then
  WEBHOOK_URL="${WEBHOOK_URL:-https://app.tulala.digital/api/webhooks/stripe-mx}"
else
  WEBHOOK_URL="${WEBHOOK_URL:-https://app.tulala.digital/api/stripe/webhook}"
fi

if ! command -v stripe >/dev/null 2>&1; then
  echo "ERROR: stripe CLI not installed. brew install stripe/stripe-cli/stripe"
  exit 1
fi

STRIPE_FLAG=""
if [ "$MODE" = "live" ]; then
  echo "→ Configuring LIVE-MODE webhook endpoint at $WEBHOOK_URL"
  STRIPE_FLAG="--live"
else
  echo "→ Configuring TEST-MODE webhook endpoint at $WEBHOOK_URL"
fi

# Events the platform's two webhook routes handle (across both
# /api/stripe/webhook and /api/webhooks/stripe):
EVENTS=(
  # Checkout / billing core
  checkout.session.completed
  customer.subscription.updated
  customer.subscription.deleted
  customer.subscription.trial_will_end
  invoice.payment_failed
  charge.refunded
  charge.dispute.created
  charge.dispute.closed
  # Station rent on automatic payments (TUL-1700): the monthly draft, the paid month, and an abandoned Checkout.
  # Needed on BOTH the US and the MX endpoint; RENT_AUTOPAY_INVOICE_CREATED_SUBSCRIBED=1 is set only after this ran.
  invoice.created
  invoice.finalized
  invoice.paid
  invoice.payment_succeeded
  checkout.session.expired
  # Delayed payment methods (SEPA, Bacs, Pay by Bank) settle later: balance top-ups and card settles credit on succeeded (TUL-1747).
  checkout.session.async_payment_succeeded
  checkout.session.async_payment_failed
  payment_intent.succeeded
  payment_intent.payment_failed
  # Connect lifecycle
  account.updated
  capability.updated
  payout.paid
  payout.failed
  payout.created
  payout.canceled
)

EVENTS_CSV=$(IFS=,; echo "${EVENTS[*]}")

if [ -n "$UPDATE_ID" ]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq not installed (needed for --update). brew install jq"
    exit 1
  fi
  CURRENT_JSON=$(stripe webhook_endpoints retrieve "$UPDATE_ID" $STRIPE_FLAG ${STRIPE_API_KEY:+--api-key "$STRIPE_API_KEY"})
  CURRENT=$(printf '%s' "$CURRENT_JSON" | jq -r '.enabled_events[]' | sort -u)
  if printf '%s\n' "$CURRENT" | grep -qx '\*'; then
    echo "→ $UPDATE_ID already receives ALL events (*): nothing to add."
    exit 0
  fi
  ADDITIONS=$(comm -13 <(printf '%s\n' "$CURRENT") <(printf '%s\n' "${EVENTS[@]}" | sort -u))
  if [ -z "$ADDITIONS" ]; then
    echo "→ $UPDATE_ID already receives every event on the list: nothing to add."
    exit 0
  fi
  echo "→ $UPDATE_ID currently receives $(printf '%s\n' "$CURRENT" | wc -l | tr -d ' ') events. Adding:"
  printf '  + %s\n' $ADDITIONS
  if [ "$DRY_RUN" = "1" ]; then
    echo "→ --dry-run: nothing changed."
    exit 0
  fi
  MERGED_CSV=$( (printf '%s\n' "$CURRENT"; printf '%s\n' "${EVENTS[@]}") | sort -u | paste -sd, -)
  stripe webhook_endpoints update "$UPDATE_ID" $STRIPE_FLAG ${STRIPE_API_KEY:+--api-key "$STRIPE_API_KEY"} --enabled-events "$MERGED_CSV"
  echo "→ Updated $UPDATE_ID. The signing secret does not change."
  exit 0
fi

echo "→ Subscribing endpoint to ${#EVENTS[@]} event types:"
printf '  • %s\n' "${EVENTS[@]}"
echo

# stripe webhook_endpoints create — note the underscore form for CLI
stripe webhook_endpoints create $STRIPE_FLAG ${STRIPE_API_KEY:+--api-key "$STRIPE_API_KEY"} \
  --url "$WEBHOOK_URL" \
  --enabled-events "$EVENTS_CSV" \
  --description "Tulala platform webhook ($MODE)"

echo
echo "→ Done. Copy the signing secret printed above into Vercel:"
echo "   vercel env add STRIPE_WEBHOOK_SECRET production"
echo
echo "→ Then redeploy or vercel promote so the env var is picked up:"
echo "   vercel --prod"
