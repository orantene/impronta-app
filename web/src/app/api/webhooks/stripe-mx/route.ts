/**
 * POST /api/webhooks/stripe-mx
 *
 * Stripe MEXICO platform webhook. Same classifier + handler as the US route
 * (`handleStripeWebhook`), tagged `account: "mx"`: verifies with
 * STRIPE_MX_WEBHOOK_SECRET (and optional STRIPE_MX_WEBHOOK_SECRET_CONNECT),
 * uses the MX client, and claims idempotency under the `platform_mx` lane.
 * Answers 503 (never 200) while the secret or MX key is unset.
 *
 * No auth middleware: signature verification is the only auth.
 */

import { handleStripeWebhook } from "@/lib/stripe/webhook-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return handleStripeWebhook(req, { account: "mx" });
}
