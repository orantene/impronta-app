/**
 * POST /api/webhooks/stripe-v2 — Stripe v2 thin-event destination for Global
 * Payouts (OutboundPayment lifecycle). Verifies the signature with
 * STRIPE_V2_WEBHOOK_SECRET, then reconciles the booking_payouts ledger.
 *
 * Separate from the v1 webhook (/api/webhooks/stripe) because v2 thin events
 * have a different payload + (eventually) a different signing secret. Until the
 * v2 event destination is configured + the secret is set, this returns 503.
 */

import { NextResponse } from "next/server";
import {
  verifyStripeSignature,
  processStripeV2ThinEvent,
  type StripeThinEvent,
} from "@/lib/payments/webhook-v2";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_V2_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured yet (Global Payouts not live). 503 so Stripe retries and
    // the misconfiguration is visible, rather than silently dropping an event.
    return NextResponse.json({ error: "v2 webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  const verified = verifyStripeSignature(rawBody, sig, secret);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  let evt: StripeThinEvent;
  try {
    evt = JSON.parse(rawBody) as StripeThinEvent;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const result = await processStripeV2ThinEvent(evt);
  if (!result.ok) {
    logServerError("api.webhooks.stripe-v2", new Error(result.error));
    return NextResponse.json({ error: result.error }, { status: 500 }); // 500 → Stripe retries
  }
  return NextResponse.json({ received: true, ...result }, { status: 200 });
}
