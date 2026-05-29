/**
 * POST /api/webhooks/stripe
 *
 * Thin shim over the ONE platform webhook handler. This URL previously had its
 * own implementation (booking-transaction markPaid, booking deposit, payout.*,
 * capability.updated) backed by a SECOND Stripe singleton, with no event-level
 * idempotency. All of that is now folded into `handleStripeWebhook`, which both
 * this route and /api/stripe/webhook delegate to — so whichever URL is
 * registered in the Stripe Dashboard, every money flow settles identically and
 * shares one idempotency ledger. See `lib/stripe/webhook-handler.ts`.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY      — Stripe API secret
 *   STRIPE_WEBHOOK_SECRET  — signing secret used to verify the event signature
 *
 * Security: this route MUST NOT sit behind auth middleware. Signature
 * verification is the only auth mechanism.
 */

import { handleStripeWebhook } from "@/lib/stripe/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return handleStripeWebhook(req);
}
