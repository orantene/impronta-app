/**
 * lib/stripe/event-idempotency.ts
 *
 * Event-level idempotency for Stripe webhooks, shared by every webhook route.
 *
 * Stripe retries. A delivery can arrive twice, out of order, or long after the
 * first attempt, so every handler that writes money has to be safe to run
 * against an event it has already seen. The mechanism is a claim: INSERT the
 * event id into `stripe_processed_events` on entry, and treat a unique-violation
 * as "someone already has this one".
 *
 * ── Why the lane prefix matters ──────────────────────────────────────────────
 * The claim table is keyed on ONE column, and more than one route processes
 * Stripe events. If two endpoints both subscribe to `customer.subscription.updated`,
 * Stripe delivers the SAME `event.id` to both URLs — and with a shared claim key
 * whichever POST landed first would win, leaving the other handler to
 * short-circuit as "already processed" and silently never run. That is the
 * failure mode this module exists to prevent.
 *
 * Each caller therefore claims under its own lane, and the stored key is
 * `<lane>:<event.id>` for every lane except the platform one, which keeps the
 * bare event id so existing rows and their history stay valid.
 *
 * ── Release on failure ───────────────────────────────────────────────────────
 * A claim that outlives a failed attempt makes Stripe's retry a no-op and
 * silently loses a paid event. Callers MUST release the claim before returning
 * a 5xx.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { interpretClaimError } from "@/lib/stripe/webhook-routing";

/**
 * Which webhook route is claiming. `platform` is the unified handler and keeps
 * the bare event id for backwards compatibility with rows already in the table.
 */
export type WebhookLane = "platform" | "discover_client_subscription";

export function laneScopedEventKey(lane: WebhookLane, eventId: string): string {
  return lane === "platform" ? eventId : `${lane}:${eventId}`;
}

/**
 * Claim an event for processing.
 *
 * Returns `true` when this event was ALREADY processed by this lane (the caller
 * should short-circuit with 200), `false` when the claim was just taken and the
 * caller owns the work.
 *
 * Best-effort by design: with no service-role client we return `false` rather
 * than blocking the webhook, because the per-handler writes are individually
 * idempotent and dropping a live payment would be far worse than running one
 * twice.
 */
export async function claimStripeEvent(input: {
  lane: WebhookLane;
  eventId: string;
  eventType: string;
  livemode?: boolean | null;
  apiVersion?: string | null;
}): Promise<boolean> {
  const sb = createServiceRoleClient();
  if (!sb) return false;

  const { error } = await sb.from("stripe_processed_events").insert({
    event_id: laneScopedEventKey(input.lane, input.eventId),
    event_type: input.eventType,
    livemode: input.livemode ?? null,
    api_version: input.apiVersion ?? null,
  });
  if (!error) return false; // claimed; first delivery for this lane
  if (interpretClaimError(error) === "duplicate") return true;
  logServerError("stripe.event-idempotency.claim", error);
  return false; // best effort: proceed rather than drop the event
}

/**
 * Release a claim so Stripe's retry actually re-runs the handler. Call this
 * before returning any 5xx.
 */
export async function releaseStripeEventClaim(input: {
  lane: WebhookLane;
  eventId: string;
}): Promise<void> {
  const sb = createServiceRoleClient();
  if (!sb) return;
  const { error } = await sb
    .from("stripe_processed_events")
    .delete()
    .eq("event_id", laneScopedEventKey(input.lane, input.eventId));
  if (error) logServerError("stripe.event-idempotency.release", error);
}
