/**
 * HTTP entry for Stripe webhooks (account + Connect secrets, idempotency claim).
 * Route files are thin shims over `handleStripeWebhook`.
 */

import { NextResponse } from "next/server";
import { getStripeFor, isStripeConfigured, type StripeAccountKey } from "@/lib/stripe/client";
import { eventModeMismatch } from "@/lib/stripe/key-mode";
import { logServerError } from "@/lib/server/safe-error";
import { reportLaneMismatch } from "@/lib/stripe/webhook-lane-mismatch";
import {
  claimStripeEvent,
  releaseStripeEventClaim,
} from "@/lib/stripe/event-idempotency";
import { processStripeEvent } from "@/lib/stripe/webhook-handler";
import type Stripe from "stripe";

/**
 * Returns `true` when this event.id was already processed (caller should
 * short-circuit with 200). Returns `false` when the event was just claimed.
 */
export async function claimEventForProcessing(
  event: Stripe.Event,
  account: StripeAccountKey = "us",
): Promise<boolean> {
  return claimStripeEvent({
    lane: account === "mx" ? "platform_mx" : "platform",
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode ?? null,
    apiVersion: event.api_version ?? null,
  });
}

/**
 * Release a claim so a transient failure can be retried.
 */
async function releaseEventClaim(eventId: string, account: StripeAccountKey = "us"): Promise<void> {
  return releaseStripeEventClaim({ lane: account === "mx" ? "platform_mx" : "platform", eventId });
}

/**
 * The one webhook entry. Both /api/stripe/webhook and /api/webhooks/stripe are
 * thin shims over this, so EITHER configured URL behaves identically and shares
 * one idempotency ledger.
 */
export async function handleStripeWebhook(
  req: Request,
  opts: { account?: StripeAccountKey } = {},
): Promise<NextResponse> {
  const account: StripeAccountKey = opts.account ?? "us";
  const stripe = getStripeFor(account);
  if (account === "us" ? !isStripeConfigured() : !stripe) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }
  // Stripe splits deliveries across TWO endpoint types, each with its own
  // signing secret: account (payment_intent.*, charge.*, …) and CONNECT
  // (account.updated, capability.updated, account.external_account.*).
  // Accept either secret so ONE URL can serve both endpoints.
  const webhookSecrets = (account === "mx"
    ? [process.env.STRIPE_MX_WEBHOOK_SECRET, process.env.STRIPE_MX_WEBHOOK_SECRET_CONNECT]
    : [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT]
  ).filter((s): s is string => !!s && s.trim().length > 0);
  if (webhookSecrets.length === 0) {
    logServerError(
      "stripe-webhook",
      account === "mx" ? "STRIPE_MX_WEBHOOK_SECRET not set" : "STRIPE_WEBHOOK_SECRET not set",
    );
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event | null = null;
  let lastVerifyError: unknown = null;
  for (const secret of webhookSecrets) {
    try {
      event = await stripe!.webhooks.constructEventAsync(body, signature, secret);
      break;
    } catch (err) {
      lastVerifyError = err;
    }
  }
  if (!event) {
    logServerError("stripe-webhook.verify", lastVerifyError);
    await reportLaneMismatch({
      expectedLane: account,
      body,
      signature,
      log: logServerError,
      verify: (b, sg, sec) => stripe!.webhooks.constructEventAsync(b, sg, sec),
    });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const modeKey = account === "mx" ? process.env.STRIPE_MX_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
  if (eventModeMismatch(event.livemode, modeKey)) {
    logServerError(
      "stripe-webhook.livemode-mismatch",
      `ignored ${event.id} ${event.type} lane=${account} livemode=${event.livemode}`,
    );
    return NextResponse.json({ received: true, ignored: "livemode_mismatch" });
  }

  const alreadyProcessed = await claimEventForProcessing(event, account);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  try {
    await processStripeEvent(event, stripe!, account);
  } catch (err) {
    logServerError(`stripe-webhook.${event.type}`, err);
    await releaseEventClaim(event.id, account);
    return NextResponse.json(
      { error: "Processing failure; will retry." },
      { status: 503 },
    );
  }

  return NextResponse.json({ received: true });
}
