/**
 * P3 — 3-way payout transfers ("separate charges and transfers").
 *
 * At checkout we collected the full `gross_charged` on the PLATFORM account.
 * On payment success this fans it out, per the frozen commission snapshot:
 *   • TALENT  → their full quote (`talent_net_cents`) — protected, paid in full
 *   • WORKSPACE → its margin net of the platform's seller share (`workspace_fee_cents`)
 *   • PLATFORM keeps `platform_fee_cents` (no transfer — it's already here)
 *
 * Runs from the booking_payment webhook after markPaid + the confirmation
 * fan-out. Best-effort + idempotent (one keyed transfer per participant+party,
 * so a re-delivered webhook never double-pays). A party without an ENABLED
 * connected account is skipped — the funds simply stay on the platform and a
 * structured log records the pending payout to forward once they onboard (no
 * money is lost). Mock mode (no STRIPE_SECRET_KEY, or no connected accounts
 * yet) logs the intended transfers instead of calling Stripe.
 *
 * Live transfers require the platform's Stripe Connect profile to be complete
 * + the recipient to have an onboarded, transfer-enabled connected account.
 * Until then this runs harmlessly in skip/mock mode.
 */

import { getStripe } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadBookingCommissionSnapshots } from "@/lib/billing/commission-engine";
import { getConnectedAccountSnapshotById } from "@/lib/payments/stripe-connect";
import {
  getTalentConnectedAccountSnapshot,
  canRouteTransfersToTalent,
} from "@/lib/payments/stripe-connect-talent";
import { recordPayoutLeg, syncBookingPayoutLifecycle } from "@/lib/payments/booking-payouts-ledger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

type Party = "talent" | "workspace";

export type TransferOutcome = {
  party: Party;
  participantId: string;
  amountCents: number;
  currency: string;
  status: "transferred" | "skipped_no_account" | "skipped_zero" | "mock" | "failed";
  destination?: string | null;
  transferId?: string | null;
  detail?: string;
};

/**
 * Optional dependency injection seam — production passes nothing (real
 * service-role client, real Stripe, real account lookups). Tests inject fakes
 * so the N-way split, idempotency, and held-skip can be asserted without a
 * live Stripe account or DB.
 */
export type TransferDeps = {
  sb?: SupabaseClient | null;
  stripe?: Stripe | null;
  resolveTalentAccount?: (talentProfileId: string) => Promise<string | null>;
  resolveWorkspaceAccount?: (tenantId: string) => Promise<string | null>;
};

/** Map a transfer outcome status to the ledger's persisted status.
 *  'mock' (no STRIPE_SECRET_KEY) and zero-amount legs are not recorded by the
 *  caller; only transferred / held (skipped_no_account) / failed reach here. */
function ledgerStatus(s: TransferOutcome["status"]): "transferred" | "held" | "failed" {
  if (s === "transferred") return "transferred";
  if (s === "failed") return "failed";
  return "held"; // skipped_no_account (and mock, defensively) → held
}

/** Resolve the talent_profiles.id this snapshot row pays out to. */
async function resolveTalentProfileId(
  sb: SupabaseClient,
  snap: { owning_party_type: string; owning_party_id: string; participant_id: string },
): Promise<string | null> {
  if (snap.owning_party_type === "talent") return snap.owning_party_id;
  const { data } = await sb
    .from("inquiry_participants")
    .select("talent_profile_id")
    .eq("id", snap.participant_id)
    .maybeSingle();
  return (data?.talent_profile_id as string | null) ?? null;
}

/** Transfer-eligible talent account id, or null. */
async function talentTransferAccount(talentProfileId: string): Promise<string | null> {
  const res = await getTalentConnectedAccountSnapshot(talentProfileId);
  if (!res.ok) return null;
  return canRouteTransfersToTalent(res.data) ? res.data.stripeAccountId : null;
}

/** Transfer-eligible workspace (agency) account id, or null. */
async function workspaceTransferAccount(tenantId: string): Promise<string | null> {
  const res = await getConnectedAccountSnapshotById(tenantId);
  if (!res.ok) return null;
  const s = res.data;
  return s.status === "enabled" && s.payoutsEnabled && s.stripeAccountId
    ? s.stripeAccountId
    : null;
}

async function payParty(
  stripe: Stripe | null,
  opts: {
    party: Party;
    participantId: string;
    bookingId: string;
    amountCents: number;
    currency: string;
    accountId: string | null;
  },
): Promise<TransferOutcome> {
  const { party, participantId, bookingId, amountCents, currency, accountId } = opts;
  const base = { party, participantId, amountCents, currency } as const;

  if (amountCents <= 0) return { ...base, status: "skipped_zero" };
  if (!accountId) {
    return {
      ...base,
      status: "skipped_no_account",
      detail: "no enabled connected account — payout pending onboarding (funds held on platform)",
    };
  }
  if (!stripe) return { ...base, status: "mock", destination: accountId };

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: amountCents,
        currency,
        destination: accountId,
        transfer_group: `booking_${bookingId}`,
        metadata: { booking_id: bookingId, participant_id: participantId, party },
      },
      { idempotencyKey: `transfer_${bookingId}_${participantId}_${party}` },
    );
    return { ...base, status: "transferred", destination: accountId, transferId: transfer.id };
  } catch (err) {
    logServerError(`transfers.create[${party}][booking=${bookingId}]`, err);
    return {
      ...base,
      status: "failed",
      destination: accountId,
      detail: err instanceof Error ? err.message : "transfer failed",
    };
  }
}

/**
 * Execute the talent + workspace transfers for a paid booking transaction.
 * Idempotent + best-effort; never throws (the payment already settled).
 */
export async function executeBookingTransfers(
  transactionId: string,
  deps: TransferDeps = {},
): Promise<TransferOutcome[]> {
  const sb = deps.sb ?? createServiceRoleClient();
  if (!sb) {
    logServerError("transfers", new Error("service-role client unavailable"));
    return [];
  }
  const resolveTalentAccount = deps.resolveTalentAccount ?? talentTransferAccount;
  const resolveWorkspaceAccount = deps.resolveWorkspaceAccount ?? workspaceTransferAccount;
  const outcomes: TransferOutcome[] = [];

  try {
    const { data: txn } = await sb
      .from("booking_transactions")
      .select("id, booking_id, status, currency")
      .eq("id", transactionId)
      .maybeSingle();
    if (!txn?.booking_id) return outcomes;
    // Only fan out once the charge is settled.
    if (!["paid", "payout_pending", "payout_sent"].includes(txn.status as string)) return outcomes;

    const bookingId = txn.booking_id as string;
    const snapshots = await loadBookingCommissionSnapshots(sb, bookingId);
    if (!snapshots.length) return outcomes;

    const stripe = deps.stripe ?? getStripe();

    for (const snap of snapshots) {
      const currency = (snap.currency_code || (txn.currency as string) || "usd").toLowerCase();
      const talentProfileId = await resolveTalentProfileId(sb, snap);
      const isWorkspaceOwned =
        snap.owning_party_type === "agency" || snap.owning_party_type === "workspace";
      const tenantId = isWorkspaceOwned ? snap.owning_party_id : null;

      // 1) Talent — full protected quote.
      if (snap.talent_net_cents > 0) {
        const accountId = talentProfileId ? await resolveTalentAccount(talentProfileId) : null;
        const outcome = await payParty(stripe, {
          party: "talent",
          participantId: snap.participant_id,
          bookingId,
          amountCents: snap.talent_net_cents,
          currency,
          accountId,
        });
        outcomes.push(outcome);
        await recordPayoutLeg(sb, {
          bookingId,
          transactionId,
          participantId: snap.participant_id,
          party: "talent",
          owningPartyType: snap.owning_party_type,
          owningPartyId: snap.owning_party_id,
          talentProfileId,
          tenantId,
          destinationAccountId: outcome.destination ?? accountId,
          amountCents: snap.talent_net_cents,
          currency,
          status: ledgerStatus(outcome.status),
          stripeTransferId: outcome.transferId ?? null,
          lastError: outcome.status === "failed" ? (outcome.detail ?? "transfer failed") : null,
        });
      }

      // 2) Workspace — margin net of the platform's seller share.
      if (isWorkspaceOwned && snap.workspace_fee_cents > 0) {
        const accountId = await resolveWorkspaceAccount(snap.owning_party_id);
        const outcome = await payParty(stripe, {
          party: "workspace",
          participantId: snap.participant_id,
          bookingId,
          amountCents: snap.workspace_fee_cents,
          currency,
          accountId,
        });
        outcomes.push(outcome);
        await recordPayoutLeg(sb, {
          bookingId,
          transactionId,
          participantId: snap.participant_id,
          party: "workspace",
          owningPartyType: snap.owning_party_type,
          owningPartyId: snap.owning_party_id,
          talentProfileId: null,
          tenantId,
          destinationAccountId: outcome.destination ?? accountId,
          amountCents: snap.workspace_fee_cents,
          currency,
          status: ledgerStatus(outcome.status),
          stripeTransferId: outcome.transferId ?? null,
          lastError: outcome.status === "failed" ? (outcome.detail ?? "transfer failed") : null,
        });
      }
      // Platform retains platform_fee_cents — already on the platform account.
    }

    // If the talent has now actually received their funds (all talent legs
    // transferred), flip the booking's payout_lifecycle to 'paid' so the talent
    // dashboard moves from "pending" to "paid" + surfaces "Paid this month".
    await syncBookingPayoutLifecycle(sb, bookingId);

    // Surface anything that didn't transfer (failed, or held pending an
    // onboarded account) so it can be reconciled / retried later.
    const pending = outcomes.filter(
      (o) => o.status === "failed" || o.status === "skipped_no_account",
    );
    if (pending.length) {
      logServerError(
        `transfers.pending[booking=${bookingId}]`,
        new Error(
          `${pending.length} payout(s) not sent: ${JSON.stringify(
            pending.map((o) => ({ party: o.party, status: o.status, amountCents: o.amountCents })),
          )}`,
        ),
      );
    }
    return outcomes;
  } catch (err) {
    logServerError(`transfers[txn=${transactionId}]`, err);
    return outcomes;
  }
}
