/**
 * POST /api/stripe/webhook
 *
 * Thin shim over the ONE platform webhook handler. Historically this route and
 * /api/webhooks/stripe were two separate implementations with two Stripe
 * singletons and divergent event coverage — whichever URL Stripe was NOT
 * pointed at silently dropped its money flows. Both routes now delegate to the
 * same `handleStripeWebhook`, so EITHER configured endpoint behaves identically
 * and shares one idempotency ledger. See `lib/stripe/webhook-handler.ts`.
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
