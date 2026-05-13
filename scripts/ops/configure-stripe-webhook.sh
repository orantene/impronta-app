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
#
# Notes:
#   - Defaults to test mode if no arg.
#   - Prints the signing secret at the end — copy into Vercel:
#       vercel env add STRIPE_WEBHOOK_SECRET production
#   - Webhook endpoint is https://app.tulala.digital/api/stripe/webhook
#     by default; override via WEBHOOK_URL env var.

set -euo pipefail

MODE="${1:-test}"
WEBHOOK_URL="${WEBHOOK_URL:-https://app.tulala.digital/api/stripe/webhook}"

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

echo "→ Subscribing endpoint to ${#EVENTS[@]} event types:"
printf '  • %s\n' "${EVENTS[@]}"
echo

# stripe webhook_endpoints create — note the underscore form for CLI
stripe webhook_endpoints create $STRIPE_FLAG \
  --url "$WEBHOOK_URL" \
  --enabled-events "$EVENTS_CSV" \
  --description "Tulala platform webhook ($MODE)"

echo
echo "→ Done. Copy the signing secret printed above into Vercel:"
echo "   vercel env add STRIPE_WEBHOOK_SECRET production"
echo
echo "→ Then redeploy or vercel promote so the env var is picked up:"
echo "   vercel --prod"
