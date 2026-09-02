/**
 * lib/payments/provider-payouts.ts
 *
 * Persist Stripe payouts so a bank deposit can be explained.
 *
 * WHY THIS EXISTS: `payout.*` events were classified by the webhook router and
 * then thrown away. The handler's comment said "Log only today. B5 will persist
 * payout history for agency visibility" — and in production it did not even log,
 * because the `improntaLog` call sat behind `NODE_ENV !== "production"`.
 *
 * So nothing connected a Stripe payout to the deposit it becomes, on either
 * side of the platform. Tulala's own payouts to its bank left no trace (and its
 * only external account is currently in `verification_failed`, so the first one
 * will fail with nothing to notice it). Talent payouts were reported as "paid"
 * off the back of the TRANSFER succeeding, which is a different event from the
 * money landing in their bank days later.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: derive anything. It records what Stripe
 * reports, verbatim, including a `status` we have never seen before. This table
 * is the provider side of a future reconciliation, and reconciliation is only
 * worth running if the two sides are allowed to disagree.
 *
 * Server-only.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

export type PayoutUpsertInput = {
  payout: Stripe.Payout;
  /** `event.account` — present only for a connected-account payout. */
  stripeAccountId: string | null;
  eventId: string;
  eventType: string;
};

/**
 * Resolve which of our parties a connected account belongs to.
 *
 * Returns nulls for a platform payout, and ALSO for a connected account we
 * cannot place. Both are honest; guessing an owner here would misattribute
 * someone's money in every report built on this table afterwards.
 */
async function resolvePayoutOwner(
  stripeAccountId: string | null,
): Promise<{ tenantId: string | null; talentProfileId: string | null }> {
  if (!stripeAccountId) return { tenantId: null, talentProfileId: null };
  try {
    const { findAgencyByStripeAccountId } = await import("@/lib/payments/stripe-connect");
    const agency = await findAgencyByStripeAccountId(stripeAccountId);
    if (agency) return { tenantId: agency.agencyId, talentProfileId: null };

    const { findTalentByStripeAccountId } = await import("@/lib/payments/stripe-connect-talent");
    const talent = await findTalentByStripeAccountId(stripeAccountId);
    if (talent) return { tenantId: null, talentProfileId: talent.talentProfileId };
  } catch (err) {
    logServerError("provider-payouts.resolveOwner", err);
  }
  return { tenantId: null, talentProfileId: null };
}

function destinationKind(payout: Stripe.Payout): { kind: string | null; last4: string | null } {
  const dest = payout.destination;
  if (!dest || typeof dest === "string") return { kind: null, last4: null };
  const obj = dest as { object?: string; last4?: string };
  return { kind: obj.object ?? null, last4: obj.last4 ?? null };
}

/**
 * Record (or update) one Stripe payout.
 *
 * Upserted on `stripe_payout_id`, so the lifecycle — created → in_transit →
 * paid | failed | canceled — converges on ONE row instead of accumulating a
 * duplicate per delivery. A redelivered event is therefore a no-op rewrite of
 * the same values.
 *
 * Best-effort: a bookkeeping write must never 5xx a webhook whose money-side
 * work already succeeded, so failures are logged and swallowed.
 */
export async function recordProviderPayout(input: PayoutUpsertInput): Promise<void> {
  try {
    const sb = createServiceRoleClient();
    if (!sb) return;

    const { payout, stripeAccountId } = input;
    const owner = await resolvePayoutOwner(stripeAccountId);
    const dest = destinationKind(payout);

    const { error } = await sb.from("provider_payouts").upsert(
      {
        provider: "stripe",
        stripe_payout_id: payout.id,
        stripe_account_id: stripeAccountId,
        tenant_id: owner.tenantId,
        talent_profile_id: owner.talentProfileId,
        amount_cents: payout.amount ?? 0,
        currency: (payout.currency ?? "usd").toUpperCase(),
        status: payout.status ?? "unknown",
        failure_code: payout.failure_code ?? null,
        failure_message: payout.failure_message ?? null,
        arrival_date: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString()
          : null,
        method: payout.method ?? null,
        destination_kind: dest.kind,
        destination_last4: dest.last4,
        last_event_id: input.eventId,
        last_event_type: input.eventType,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_payout_id" },
    );
    if (error) logServerError("provider-payouts.upsert", error);
  } catch (err) {
    logServerError("provider-payouts.record", err);
  }
}
