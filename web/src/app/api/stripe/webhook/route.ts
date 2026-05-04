/**
 * POST /api/stripe/webhook
 *
 * Receives and verifies Stripe webhook events, then syncs billing state to the DB.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY         — Stripe API secret
 *   STRIPE_WEBHOOK_SECRET     — Signing secret from the Stripe Dashboard webhook endpoint
 *
 * Events handled:
 *   checkout.session.completed          → first subscription activated
 *   customer.subscription.updated       → plan change / renewal / cancellation toggle
 *   customer.subscription.deleted       → subscription cancelled → downgrade to free
 *   invoice.payment_failed              → mark past_due
 *
 * Security: this route MUST NOT be behind authentication middleware.
 * The Stripe signature verification is the only auth mechanism.
 * The route is public but rejects any request without a valid signature.
 */

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { syncStripeSubscriptionToDb } from "@/lib/stripe/workspace-billing";
import { syncTalentSubscriptionToDb } from "@/lib/stripe/talent-billing";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

// Disable body parsing — we need the raw body for Stripe signature verification.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logServerError("stripe-webhook", "STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const stripe = getStripe()!;

  // Read raw body for signature verification
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    logServerError("stripe-webhook.verify", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // ─── Event routing ────────────────────────────────────────────────────────

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const subId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

        if (!subId) {
          logServerError("stripe-webhook.checkout", "No subscription ID in session");
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subId, {
          expand: ["items.data.price"],
        });

        const checkoutType = session.metadata?.checkout_type ?? subscription.metadata?.checkout_type;
        const planKey = session.metadata?.plan_key ?? subscription.metadata?.plan_key ?? "studio";

        if (checkoutType === "talent_subscription") {
          await syncTalentSubscriptionToDb(subscription, planKey);
        } else {
          await syncStripeSubscriptionToDb(subscription, planKey);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const checkoutType = subscription.metadata?.checkout_type;
        const planKey = subscription.metadata?.plan_key ?? "studio";

        if (checkoutType === "talent_subscription") {
          await syncTalentSubscriptionToDb(subscription, planKey);
        } else {
          await syncStripeSubscriptionToDb(subscription, planKey);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const checkoutType = subscription.metadata?.checkout_type;
        const planKey = subscription.metadata?.plan_key ?? "studio";

        if (checkoutType === "talent_subscription") {
          await syncTalentSubscriptionToDb(subscription, planKey);
        } else {
          await syncStripeSubscriptionToDb(subscription, planKey);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;

        if (!subId) break;

        const subscription = await stripe.subscriptions.retrieve(subId);
        const checkoutType = subscription.metadata?.checkout_type;
        const planKey = subscription.metadata?.plan_key ?? "studio";

        if (checkoutType === "talent_subscription") {
          await syncTalentSubscriptionToDb(subscription, planKey);
        } else {
          await syncStripeSubscriptionToDb(subscription, planKey);
        }
        break;
      }

      default:
        // Unhandled event type — acknowledged but not processed.
        break;
    }
  } catch (err) {
    logServerError(`stripe-webhook.${event.type}`, err);
    // Return 200 anyway — Stripe retries on non-2xx, which causes infinite loops
    // for bugs that won't self-heal. Log + 200 is the safe default.
  }

  return NextResponse.json({ received: true });
}
