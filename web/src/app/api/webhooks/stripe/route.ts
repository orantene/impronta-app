/**
 * Stripe webhook handler — consumes `checkout.session.completed` events
 * and flips the corresponding `booking_transactions` row to `paid`.
 *
 * Endpoint: POST /api/webhooks/stripe
 *
 * Configuration (required):
 *   STRIPE_SECRET_KEY        — used to construct the Stripe client
 *   STRIPE_WEBHOOK_SECRET    — endpoint secret used to verify signatures
 *
 * Without these env vars the route refuses every request with 503 so
 * misconfigured deployments don't silently accept unsigned events.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/payments/stripe-checkout";
import { markPaid, loadActiveBookingTransaction } from "@/lib/bookings/transactions";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Stripe requires the raw body for signature verification.
  const bodyText = await req.text();

  let event: import("stripe").Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
  } catch (err) {
    logServerError("webhooks.stripe.signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const transactionId =
          (session.client_reference_id as string | null)
          ?? (session.metadata?.transaction_id as string | undefined)
          ?? null;
        if (!transactionId) {
          logServerError("webhooks.stripe.checkoutCompleted", new Error("no transaction id"));
          break;
        }
        const result = await markPaid(transactionId);
        if (!result.ok) {
          logServerError("webhooks.stripe.markPaid", new Error(result.error));
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as import("stripe").Stripe.PaymentIntent;
        // PaymentIntent doesn't carry the transaction id directly; rely
        // on the metadata we set on the Checkout session (Stripe forwards
        // it to the PaymentIntent).
        const transactionId = (intent.metadata?.transaction_id as string | undefined) ?? null;
        if (transactionId) {
          // Best-effort failure path. We don't markFailed here because
          // we don't know that the user wants to abandon the txn — they
          // may retry the same Checkout session. Logging is enough.
          logServerError("webhooks.stripe.paymentFailed", new Error(`tx ${transactionId} failed`));
        }
        break;
      }
      default:
        // Ignore other event types — we only care about checkout completion.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    logServerError("webhooks.stripe.dispatch", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Suppress "unused import" warning for the loadActiveBookingTransaction
// helper that's reserved for a future enhancement (e.g. validating the
// transaction is in the expected status before marking paid).
void loadActiveBookingTransaction;
void createServiceRoleClient;
