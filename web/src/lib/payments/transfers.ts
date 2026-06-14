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
import {
  disburse,
  type DisburseOutcome,
  type DisburseRoute,
  type PayoutRail,
} from "@/lib/payments/disburse";
import { getPrimaryFinancialAccountId } from "@/lib/payments/global-payouts";
import { resolveTalentPayoutRail } from "@/lib/payments/payout-rail-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

type Party = "talent" | "workspace";

/**
 * Outcome of one payout leg — now a re-export of the rail-agnostic
 * DisburseOutcome (which adds `rail`). Back-compat for callers that import
 * TransferOutcome from this module.
 */
export type TransferOutcome = DisburseOutcome;

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
  /**
   * Which rail to pay a talent leg on. Defaults to "connect_transfer" — the
   * Global Payouts rail is OPT-IN and off until a talent is provisioned for it,
   * so existing behaviour is unchanged.
   */
  resolvePayoutRail?: (
    party: Party,
    talentProfileId: string | null,
  ) => Promise<PayoutRail> | PayoutRail;
  /** GP recipient (v2 core account id) for a talent — defaults to their stripe_account_id. */
  resolveTalentRecipientAccount?: (talentProfileId: string) => Promise<string | null>;
  /** Source FinancialAccount id for the GP rail — defaults to the platform's primary FA. */
  getFinancialAccountId?: () => Promise<string | null>;
};

/** Map a transfer outcome status to the ledger's persisted status.
 *  'mock' (no STRIPE_SECRET_KEY) and zero-amount legs are not recorded by the
 *  caller; only transferred / held (skipped_no_account) / failed reach here. */
function ledgerStatus(s: TransferOutcome["status"]): "transferred" | "held" | "failed" {
  if (s === "transferred") return "transferred";
  if (s === "failed") return "failed";
  return "held"; // skipped_no_account / skipped_live_disabled (and mock, defensively) → held
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

/** GP recipient (v2 core account id) for a talent — prefer their dedicated
 *  Global Payouts recipient (gp_recipient_account_id, which has a bank payout
 *  method); fall back to the Connect account id (which doubles as a v2 recipient). */
async function talentRecipientAccount(talentProfileId: string): Promise<string | null> {
  const sb = createServiceRoleClient();
  if (sb) {
    const { data } = await sb
      .from("talent_profiles")
      .select("gp_recipient_account_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    const gp = (data?.gp_recipient_account_id as string | null) ?? null;
    if (gp) return gp;
  }
  const res = await getTalentConnectedAccountSnapshot(talentProfileId);
  return res.ok ? res.data.stripeAccountId : null;
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
  const resolvePayoutRail =
    deps.resolvePayoutRail ??
    ((_party: Party, tpId: string | null): Promise<PayoutRail> =>
      tpId ? resolveTalentPayoutRail(tpId, { sb }) : Promise.resolve<PayoutRail>("connect_transfer"));
  const resolveTalentRecipientAccount =
    deps.resolveTalentRecipientAccount ?? talentRecipientAccount;
  const getFinancialAccountId = deps.getFinancialAccountId ?? getPrimaryFinancialAccountId;
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
    if (!snapshots.length) {
      // QA 2026-06-13: a paid booking with NO commission snapshot means the
      // convert-time snapshot persist failed non-fatally — so the talent would
      // be silently never paid with no booking_payouts row to retry. Surface it
      // loudly for manual reconciliation instead of returning an empty no-op.
      logServerError(
        "transfers.no_snapshot",
        new Error(
          `paid booking ${bookingId} (txn ${transactionId}) has NO commission snapshot — payout skipped, talent NOT paid. Backfill persistBookingCommissionSnapshot then re-run.`,
        ),
      );
      return outcomes;
    }

    const stripe = deps.stripe ?? getStripe();

    const settledCurrency = String((txn.currency as string) || "usd").toLowerCase();
    for (const snap of snapshots) {
      const currency = (snap.currency_code || settledCurrency || "usd").toLowerCase();
      // Audit #5: never transfer in a currency the platform did NOT settle. The
      // client charge settled in the transaction currency; a snapshot lane in a
      // different currency (a legacy mixed-currency booking) can't be funded from
      // this settlement — paying it out would fail or misfund the talent. Skip
      // the lane and flag it for manual reconciliation rather than guessing.
      if (currency !== settledCurrency) {
        logServerError(
          "transfers.currency_mismatch",
          new Error(
            `snapshot lane ${currency} != settled ${settledCurrency} (booking ${bookingId}, txn ${transactionId}) — skipped payout to avoid misfunding`,
          ),
        );
        continue;
      }
      const talentProfileId = await resolveTalentProfileId(sb, snap);
      const isWorkspaceOwned =
        snap.owning_party_type === "agency" || snap.owning_party_type === "workspace";
      const tenantId = isWorkspaceOwned ? snap.owning_party_id : null;

      // 1) Talent — full protected quote. Routed via the resolved rail: a
      //    Connect transfer by default, or a Global Payouts OutboundPayment when
      //    the talent is provisioned for it (opt-in, off until then).
      if (snap.talent_net_cents > 0) {
        const rail: PayoutRail = talentProfileId
          ? await resolvePayoutRail("talent", talentProfileId)
          : "connect_transfer";
        let route: DisburseRoute;
        if (rail === "global_payouts" && talentProfileId) {
          const [financialAccountId, recipientAccountId] = await Promise.all([
            getFinancialAccountId(),
            resolveTalentRecipientAccount(talentProfileId),
          ]);
          route = {
            rail: "global_payouts",
            financialAccountId,
            recipientAccountId,
            payoutMethodId: null,
          };
        } else {
          const accountId = talentProfileId ? await resolveTalentAccount(talentProfileId) : null;
          route = { rail: "connect_transfer", connectAccountId: accountId };
        }
        const outcome = await disburse(
          {
            party: "talent",
            participantId: snap.participant_id,
            bookingId,
            amountCents: snap.talent_net_cents,
            currency,
            route,
          },
          { stripe },
        );
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
          destinationAccountId: outcome.destination ?? null,
          amountCents: snap.talent_net_cents,
          currency,
          status: ledgerStatus(outcome.status),
          stripeTransferId: outcome.transferId ?? null,
          lastError: outcome.status === "failed" ? (outcome.detail ?? "transfer failed") : null,
        });
      }

      // 2) Workspace — margin net of the platform's seller share. Agency payouts
      //    stay on the Connect rail (the GP rail is talent-only for now).
      if (isWorkspaceOwned && snap.workspace_fee_cents > 0) {
        const accountId = await resolveWorkspaceAccount(snap.owning_party_id);
        const outcome = await disburse(
          {
            party: "workspace",
            participantId: snap.participant_id,
            bookingId,
            amountCents: snap.workspace_fee_cents,
            currency,
            route: { rail: "connect_transfer", connectAccountId: accountId },
          },
          { stripe },
        );
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
          destinationAccountId: outcome.destination ?? null,
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
      (o) =>
        o.status === "failed" ||
        o.status === "skipped_no_account" ||
        o.status === "skipped_live_disabled",
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
