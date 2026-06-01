/**
 * Held-payouts ledger — persistence + release.
 *
 * Every payout leg fanned out by `executeBookingTransfers` is recorded in
 * `public.booking_payouts` (one row per booking/participant/party). A leg that
 * couldn't transfer because the recipient hadn't finished Stripe onboarding is
 * stored as `held` — and later RELEASED (re-attempted) once their connected
 * account is enabled, instead of being abandoned on the platform balance.
 *
 * Release reuses the SAME Stripe idempotency key as the original attempt
 * (`transfer_<booking>_<participant>_<party>`), so a release can never
 * double-pay a leg that already went out.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import { getTalentConnectedAccountSnapshot, canRouteTransfersToTalent } from "@/lib/payments/stripe-connect-talent";
import { getConnectedAccountSnapshotById } from "@/lib/payments/stripe-connect";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type PayoutParty = "talent" | "workspace";
export type PayoutStatus = "transferred" | "held" | "failed" | "reversed";

/** A payout leg to record. `accountId` null ⇒ held (no enabled account yet). */
export type PayoutLeg = {
  bookingId: string;
  transactionId: string | null;
  participantId: string;
  party: PayoutParty;
  owningPartyType: string | null;
  owningPartyId: string | null;
  talentProfileId: string | null;
  tenantId: string | null;
  destinationAccountId: string | null;
  amountCents: number;
  currency: string;
  status: PayoutStatus;
  stripeTransferId: string | null;
  lastError: string | null;
};

/** Stable per-leg Stripe idempotency key — shared by initial fan-out + release. */
export function payoutIdempotencyKey(bookingId: string, participantId: string, party: PayoutParty): string {
  return `transfer_${bookingId}_${participantId}_${party}`;
}

/**
 * Upsert a payout leg into the ledger. Idempotent on (booking, participant,
 * party). A leg that already reached 'transferred' is never downgraded.
 */
export async function recordPayoutLeg(sb: SupabaseClient, leg: PayoutLeg): Promise<void> {
  try {
    const { data: existing } = await sb
      .from("booking_payouts")
      .select("id, status, attempts")
      .eq("booking_id", leg.bookingId)
      .eq("participant_id", leg.participantId)
      .eq("party", leg.party)
      .maybeSingle();

    // Never overwrite a completed transfer.
    if (existing && (existing.status as string) === "transferred") return;

    const base = {
      booking_id: leg.bookingId,
      transaction_id: leg.transactionId,
      participant_id: leg.participantId,
      party: leg.party,
      owning_party_type: leg.owningPartyType,
      owning_party_id: leg.owningPartyId,
      talent_profile_id: leg.talentProfileId,
      tenant_id: leg.tenantId,
      destination_account_id: leg.destinationAccountId,
      amount_cents: leg.amountCents,
      currency: leg.currency,
      status: leg.status,
      stripe_transfer_id: leg.stripeTransferId,
      last_error: leg.lastError,
      transferred_at: leg.status === "transferred" ? new Date().toISOString() : null,
    };

    if (existing) {
      await sb
        .from("booking_payouts")
        .update({ ...base, attempts: ((existing.attempts as number) ?? 0) + 1 })
        .eq("id", existing.id as string);
    } else {
      await sb.from("booking_payouts").insert({ ...base, attempts: 1 });
    }
  } catch (err) {
    // The ledger is best-effort bookkeeping — never let it break a real transfer.
    logServerError(`booking-payouts.record[booking=${leg.bookingId}]`, err);
  }
}

type HeldRow = {
  id: string;
  booking_id: string;
  participant_id: string;
  party: PayoutParty;
  talent_profile_id: string | null;
  tenant_id: string | null;
  amount_cents: number;
  currency: string;
  attempts: number;
};

export type ReleaseOutcome = {
  legId: string;
  party: PayoutParty;
  amountCents: number;
  result: "released" | "still_held" | "failed";
  transferId?: string | null;
  detail?: string;
};

export type ReleaseDeps = {
  sb?: SupabaseClient | null;
  stripe?: Stripe | null;
  resolveTalentAccount?: (talentProfileId: string) => Promise<string | null>;
  resolveWorkspaceAccount?: (tenantId: string) => Promise<string | null>;
};

async function defaultTalentAccount(talentProfileId: string): Promise<string | null> {
  const res = await getTalentConnectedAccountSnapshot(talentProfileId);
  if (!res.ok) return null;
  return canRouteTransfersToTalent(res.data) ? res.data.stripeAccountId : null;
}

async function defaultWorkspaceAccount(tenantId: string): Promise<string | null> {
  const res = await getConnectedAccountSnapshotById(tenantId);
  if (!res.ok) return null;
  const s = res.data;
  return s.status === "enabled" && s.payoutsEnabled && s.stripeAccountId ? s.stripeAccountId : null;
}

/**
 * Re-attempt held/failed payout legs for ONE payee (a talent or a workspace).
 * Called when an account flips to payouts-enabled (account.updated webhook) and
 * by the reconcile cron. Idempotent + best-effort; never throws.
 *
 * Returns one outcome per leg processed (empty when nothing was held).
 */
export async function releaseHeldPayouts(
  target: { talentProfileId?: string | null; tenantId?: string | null },
  deps: ReleaseDeps = {},
): Promise<ReleaseOutcome[]> {
  const sb = deps.sb ?? createServiceRoleClient();
  if (!sb) return [];
  const stripe = deps.stripe ?? getStripe();
  const resolveTalentAccount = deps.resolveTalentAccount ?? defaultTalentAccount;
  const resolveWorkspaceAccount = deps.resolveWorkspaceAccount ?? defaultWorkspaceAccount;
  const outcomes: ReleaseOutcome[] = [];

  try {
    let query = sb
      .from("booking_payouts")
      .select("id, booking_id, participant_id, party, talent_profile_id, tenant_id, amount_cents, currency, attempts")
      .in("status", ["held", "failed"]);

    if (target.talentProfileId) {
      query = query.eq("party", "talent").eq("talent_profile_id", target.talentProfileId);
    } else if (target.tenantId) {
      query = query.eq("party", "workspace").eq("tenant_id", target.tenantId);
    } else {
      return [];
    }

    const { data, error } = await query;
    if (error || !data?.length) return [];

    for (const row of data as HeldRow[]) {
      const accountId =
        row.party === "talent"
          ? row.talent_profile_id
            ? await resolveTalentAccount(row.talent_profile_id)
            : null
          : row.tenant_id
            ? await resolveWorkspaceAccount(row.tenant_id)
            : null;

      // Still not transfer-eligible — leave it held, bump attempts.
      if (!accountId) {
        await sb
          .from("booking_payouts")
          .update({ attempts: (row.attempts ?? 0) + 1, last_error: "account still not transfer-enabled" })
          .eq("id", row.id);
        outcomes.push({ legId: row.id, party: row.party, amountCents: row.amount_cents, result: "still_held" });
        continue;
      }

      if (!stripe) {
        outcomes.push({ legId: row.id, party: row.party, amountCents: row.amount_cents, result: "still_held", detail: "stripe unconfigured" });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create(
          {
            amount: row.amount_cents,
            currency: row.currency,
            destination: accountId,
            transfer_group: `booking_${row.booking_id}`,
            metadata: { booking_id: row.booking_id, participant_id: row.participant_id, party: row.party, released: "1" },
          },
          { idempotencyKey: payoutIdempotencyKey(row.booking_id, row.participant_id, row.party) },
        );
        await sb
          .from("booking_payouts")
          .update({
            status: "transferred",
            stripe_transfer_id: transfer.id,
            destination_account_id: accountId,
            transferred_at: new Date().toISOString(),
            attempts: (row.attempts ?? 0) + 1,
            last_error: null,
          })
          .eq("id", row.id);
        outcomes.push({ legId: row.id, party: row.party, amountCents: row.amount_cents, result: "released", transferId: transfer.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "transfer failed";
        await sb
          .from("booking_payouts")
          .update({ status: "failed", attempts: (row.attempts ?? 0) + 1, last_error: msg })
          .eq("id", row.id);
        logServerError(`booking-payouts.release[leg=${row.id}]`, err);
        outcomes.push({ legId: row.id, party: row.party, amountCents: row.amount_cents, result: "failed", detail: msg });
      }
    }
  } catch (err) {
    logServerError("booking-payouts.release", err);
  }

  return outcomes;
}

/** Sum of a payee's currently-held payout legs, grouped by currency. For the UX banner. */
export async function getHeldPayoutTotals(
  target: { talentProfileId?: string | null; tenantId?: string | null },
  sbIn?: SupabaseClient | null,
): Promise<Array<{ currency: string; amountCents: number; count: number }>> {
  const sb = sbIn ?? createServiceRoleClient();
  if (!sb) return [];
  try {
    let query = sb.from("booking_payouts").select("amount_cents, currency").eq("status", "held");
    if (target.talentProfileId) query = query.eq("party", "talent").eq("talent_profile_id", target.talentProfileId);
    else if (target.tenantId) query = query.eq("party", "workspace").eq("tenant_id", target.tenantId);
    else return [];

    const { data, error } = await query;
    if (error || !data?.length) return [];

    const byCurrency = new Map<string, { amountCents: number; count: number }>();
    for (const r of data as Array<{ amount_cents: number; currency: string }>) {
      const cur = (r.currency || "mxn").toLowerCase();
      const acc = byCurrency.get(cur) ?? { amountCents: 0, count: 0 };
      acc.amountCents += r.amount_cents;
      acc.count += 1;
      byCurrency.set(cur, acc);
    }
    return [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v }));
  } catch (err) {
    logServerError("booking-payouts.heldTotals", err);
    return [];
  }
}
