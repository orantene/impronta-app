// Phase D §3 — client Pro subscription webhook.
//
// POST /api/discover/subscriptions/webhook
//
// Dedicated Stripe webhook endpoint for client_subscriptions. Kept separate
// from the unified money webhook so the client Pro subscription stream has its
// own endpoint + (optionally) its own signing secret, and so a client-tier sync
// failure never affects booking-payment settlement.
//
// Handles:
//   checkout.session.completed         — retrieve the subscription, upsert 'pro'
//   customer.subscription.updated      — re-sync tier/status (renewal, dunning…)
//   customer.subscription.deleted      — downgrade to 'standard'
//
// Security: MUST NOT sit behind auth middleware (whitelisted in proxy.ts).
// Signature verification is the only auth. Uses STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET
// when set, else falls back to STRIPE_WEBHOOK_SECRET.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { syncClientProSubscriptionToDb } from "@/lib/stripe/client-billing";
import { logServerError } from "@/lib/server/safe-error";
import {
  claimStripeEvent,
  releaseStripeEventClaim,
} from "@/lib/stripe/event-idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }
  const webhookSecret =
    process.env.STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logServerError("client-subscription-webhook", "no webhook signing secret set");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const stripe = getStripe()!;
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    logServerError("client-subscription-webhook.verify", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency. This route had NONE: Stripe retries and duplicate deliveries
  // re-ran the tier sync every time. It claims under its OWN lane rather than
  // the bare event id, because the platform endpoint also subscribes to
  // customer.subscription.* — a shared key would mean whichever URL Stripe hit
  // first won the claim and the other handler silently never ran.
  const LANE = "discover_client_subscription" as const;
  const alreadyProcessed = await claimStripeEvent({
    lane: LANE,
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode ?? null,
    apiVersion: event.api_version ?? null,
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const sessionObj = event.data.object as Stripe.Checkout.Session;
      // Only act on our client Pro subscription checkouts.
      if (
        sessionObj.mode === "subscription" &&
        sessionObj.metadata?.checkout_type === "client_pro_subscription" &&
        sessionObj.subscription
      ) {
        const subId =
          typeof sessionObj.subscription === "string"
            ? sessionObj.subscription
            : sessionObj.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subId, {
          expand: ["items.data.price"],
        });
        // Re-shape into a subscription.updated-like event so the shared mapper
        // (which reads event.data.object as a Subscription) handles it. Carry
        // the user_id metadata through from the session if the subscription
        // metadata is missing it (older Checkout sessions).
        if (!subscription.metadata?.user_id && sessionObj.metadata?.user_id) {
          subscription.metadata = {
            ...subscription.metadata,
            user_id: sessionObj.metadata.user_id,
            checkout_type: "client_pro_subscription",
          };
        }
        const synthetic = {
          ...event,
          type: "customer.subscription.updated",
          data: { object: subscription },
        } as unknown as Stripe.Event;
        const res = await syncClientProSubscriptionToDb(synthetic);
        if (!res.ok) {
          await releaseStripeEventClaim({ lane: LANE, eventId: event.id });
          return NextResponse.json({ error: res.error }, { status: 503 });
        }
      }
      return NextResponse.json({ received: true });
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      // Only handle subscriptions we tagged as client Pro. Other subscription
      // events (talent / workspace) belong to the unified webhook.
      if (sub.metadata?.checkout_type !== "client_pro_subscription") {
        return NextResponse.json({ received: true, ignored: true });
      }
      const res = await syncClientProSubscriptionToDb(event);
      if (!res.ok) {
        await releaseStripeEventClaim({ lane: LANE, eventId: event.id });
        return NextResponse.json({ error: res.error }, { status: 503 });
      }
      return NextResponse.json({ received: true });
    }

    // Any other event type — ack without processing.
    return NextResponse.json({ received: true, ignored: true });
  } catch (err) {
    logServerError(`client-subscription-webhook.${event.type}`, err);
    await releaseStripeEventClaim({ lane: LANE, eventId: event.id });
    return NextResponse.json({ error: "Processing failure; will retry." }, { status: 503 });
  }
}
