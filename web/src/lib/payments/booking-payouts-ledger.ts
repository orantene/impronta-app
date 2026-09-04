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

export type PayoutParty = "talent" | "workspace" | "channel_referral";
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
  /** Rail this leg was routed on (connect_transfer | global_payouts). NULL =
   *  legacy/Connect. releaseHeldPayouts uses it to never release a GP leg via Connect. */
  payoutRail: string | null;
  /**
   * Earliest moment this leg may be transferred. `null` means DUE NOW.
   *
   * REQUIRED, not optional, and deliberately so. The column is nullable so the
   * migration is a non-event for existing rows, but a producer that simply
   * FORGOT this field would get immediate release -- which is the exact bug
   * this exists to prevent. Making it required turns forgetting into a compile
   * error at the one writer instead of an early payout nobody sees.
   *
   * Independent of `status`. A leg can be blocked by account readiness AND by
   * time at once; `status` can only say one thing, which is why this is a
   * separate field rather than a `scheduled` state.
   */
  releaseAfter: string | null;
};

/** A payee predicate as data: equality filters + one-of filters, in order. */
export type PayoutPayeeScope = {
  eq: Array<[column: string, value: string]>;
  in: Array<[column: string, values: string[]]>;
};

/**
 * THE payee predicate for every `booking_payouts` read scoped to one payee.
 *
 * Every surface that asks "what does this talent / this workspace have in the
 * ledger?" must narrow the table the same way, or the answers diverge: a talent
 * is `party='talent'` + their `talent_profile_id`, while a tenant owns BOTH its
 * `workspace` margin legs and any `channel_referral` legs paid to it (Phase C —
 * `tenant_id` is the channel party there). Returns `null` when the target names
 * no payee, so a caller can never accidentally read the whole table.
 *
 * Returned as DATA rather than as a chained query so every call site keeps its
 * own concrete PostgREST builder type (chaining it through a generic helper trips
 * TS2589, "type instantiation is excessively deep").
 */
export function payoutLegPayeeScope(target: {
  talentProfileId?: string | null;
  tenantId?: string | null;
}): PayoutPayeeScope | null {
  if (target.talentProfileId) {
    return {
      eq: [
        ["party", "talent"],
        ["talent_profile_id", target.talentProfileId],
      ],
      in: [],
    };
  }
  if (target.tenantId) {
    return { eq: [["tenant_id", target.tenantId]], in: [["party", ["workspace", "channel_referral"]]] };
  }
  return null;
}

/** Stable per-leg Stripe idempotency key — shared by initial fan-out + release. */
export function payoutIdempotencyKey(bookingId: string, participantId: string, party: PayoutParty): string {
  return `transfer_${bookingId}_${participantId}_${party}`;
}

/**
 * The later of two holds, treating `null` as "due now" (i.e. no hold).
 *
 * Pure, and exported so the rule is testable without a database. The rule it
 * encodes: a hold may be EXTENDED, never shortened or removed by routine
 * bookkeeping. `null` can therefore never win over a real timestamp -- an
 * upsert that omits the gate must not release the money.
 */
export function laterHold(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/** True when a leg is due: no gate, or the gate has passed. */
export function isDue(releaseAfter: string | null, now: Date = new Date()): boolean {
  if (!releaseAfter) return true;
  return new Date(releaseAfter).getTime() <= now.getTime();
}

/**
 * Upsert a payout leg into the ledger. Idempotent on (booking, participant,
 * party). A leg that already reached 'transferred' is never downgraded.
 */
export async function recordPayoutLeg(sb: SupabaseClient, leg: PayoutLeg): Promise<void> {
  try {
    const { data: existing } = await sb
      .from("booking_payouts")
      .select("id, status, attempts, release_after")
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
      payout_rail: leg.payoutRail,
      last_error: leg.lastError,
      transferred_at: leg.status === "transferred" ? new Date().toISOString() : null,
    };

    if (existing) {
      // A HOLD MAY BE EXTENDED, NEVER SHORTENED OR REMOVED BY ROUTINE
      // BOOKKEEPING. This function is idempotent and rewrites `base` wholesale,
      // so spreading release_after into the update would let any retry that
      // happened to pass `null` WIPE the gate and release the money early --
      // the same defect this whole change exists to prevent, one level down.
      //
      // So the update keeps whatever gate is already stored, and only moves it
      // LATER. Cancelling a hold is an explicit act elsewhere, never a side
      // effect of recording a leg.
      const existingRelease = (existing.release_after as string | null) ?? null;
      const nextRelease = laterHold(existingRelease, leg.releaseAfter);
      await sb
        .from("booking_payouts")
        .update({
          ...base,
          release_after: nextRelease,
          attempts: ((existing.attempts as number) ?? 0) + 1,
        })
        .eq("id", existing.id as string);
    } else {
      await sb
        .from("booking_payouts")
        .insert({ ...base, release_after: leg.releaseAfter, attempts: 1 });
    }
  } catch (err) {
    // The ledger is best-effort bookkeeping — never let it break a real transfer.
    logServerError(`booking-payouts.record[booking=${leg.bookingId}]`, err);
  }
}

/**
 * Flip a booking's `agency_bookings.payout_lifecycle` to 'paid' once the TALENT
 * has actually received their money — i.e. every talent payout leg recorded for
 * the booking is 'transferred'. This is the link that moves the talent dashboard
 * from "pending" to "paid" (and surfaces it under "Paid this month"):
 * `mapBookingPayoutStatus` reads `agency_bookings.payout_lifecycle`, which the
 * payment flow otherwise never updated (it only flips `booking_transactions`).
 *
 * TALENT legs only — a held AGENCY leg (workspace not yet onboarded) is tracked
 * separately by the held-payouts system and must NOT block the talent's paid
 * status, since the talent has been paid in full regardless. Best-effort; the
 * money already moved, so a bookkeeping failure here is logged, never thrown.
 */
export async function syncBookingPayoutLifecycle(
  sb: SupabaseClient,
  bookingId: string,
): Promise<void> {
  try {
    const { data, error } = await sb
      .from("booking_payouts")
      .select("status")
      .eq("booking_id", bookingId)
      .eq("party", "talent");
    if (error || !data?.length) return;
    const allTransferred = data.every((r) => (r.status as string) === "transferred");
    if (!allTransferred) return;
    await sb
      .from("agency_bookings")
      .update({ payout_lifecycle: "paid", updated_at: new Date().toISOString() })
      .eq("id", bookingId);
  } catch (err) {
    logServerError(`booking-payouts.syncLifecycle[booking=${bookingId}]`, err);
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
  payout_rail: string | null;
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
    // Phase C — a channel_referral leg is paid to a workspace Connect account
    // (tenant_id = the channel party), exactly like a workspace leg. The shared
    // payee scope matches both parties for a tenant so a held referral leg can
    // auto-release when the channel's account flips enabled.
    const scope = payoutLegPayeeScope(target);
    if (!scope) return [];

    // `status` says the payee's account could not receive. `release_after` says
    // the money is not due yet -- a ticket payout gated until the show. Both
    // must be satisfied: an account.updated flip or the reconcile cron
    // legitimately resolves the first and must NOT resolve the second.
    // Without this predicate a show-gated leg releases on the next account flip
    // or the next cron run, silently, and the only signal is that it worked.
    let query = sb
      .from("booking_payouts")
      .select("id, booking_id, participant_id, party, talent_profile_id, tenant_id, amount_cents, currency, attempts, payout_rail, release_after")
      .in("status", ["held", "failed"])
      .or(`release_after.is.null,release_after.lte.${new Date().toISOString()}`);
    for (const [col, val] of scope.eq) query = query.eq(col, val);
    for (const [col, vals] of scope.in) query = query.in(col, vals);

    const { data, error } = await query;
    if (error || !data?.length) return [];

    for (const row of data as HeldRow[]) {
      // Never release a Global Payouts leg via the Connect rail. This path only
      // does stripe.transfers.create() (Connect); a GP leg released here would
      // double-pay once the GP retry (its own outbound-payment webhook) also
      // lands. Leave it held for the GP release path. NULL rail = legacy Connect.
      if (row.payout_rail === "global_payouts") {
        outcomes.push({
          legId: row.id,
          party: row.party,
          amountCents: row.amount_cents,
          result: "still_held",
          detail: "global_payouts leg is not Connect-releasable",
        });
        continue;
      }
      // talent → talent Connect account; workspace AND channel_referral → the
      // workspace Connect account keyed on tenant_id (the channel party for a
      // referral leg). Both non-talent parties route Connect transfers.
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
        // A released talent leg may complete the booking's talent payout →
        // flip it to 'paid' so the talent dashboard reflects the late payout.
        if (row.party === "talent") await syncBookingPayoutLifecycle(sb, row.booking_id);
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

export type HeldLedgerRow = {
  id: string;
  bookingId: string;
  participantId: string;
  party: PayoutParty;
  talentProfileId: string | null;
  tenantId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  /** When set and in the future, this leg is SCHEDULED (waiting for a date),
   *  not STUCK (waiting for an account). The admin list shows both and filters
   *  neither -- hiding scheduled legs from a reconciliation view is how money
   *  goes missing quietly, but twenty scheduled legs must not read as twenty
   *  problems either. */
  releaseAfter: string | null;
};

/**
 * Count one talent's HELD payout legs — bookings where the client paid but the
 * transfer couldn't route because the talent has no enabled connected account
 * yet (executeBookingTransfers records the leg as 'held', funds stay on the
 * platform). Drives the talent PayoutNudgeCard count ("you have N accepted
 * bookings ready to pay out — connect Stripe"). Service-role read so the count
 * is accurate regardless of the caller's RLS; best-effort, returns 0 on error.
 */
export async function countHeldTalentPayoutLegs(
  talentProfileId: string,
  sbIn?: SupabaseClient | null,
): Promise<number> {
  const sb = sbIn ?? createServiceRoleClient();
  if (!sb || !talentProfileId) return 0;
  try {
    const { count, error } = await sb
      .from("booking_payouts")
      .select("id", { count: "exact", head: true })
      .eq("talent_profile_id", talentProfileId)
      .eq("party", "talent")
      .eq("status", "held");
    if (error) {
      logServerError("booking-payouts-ledger.countHeldTalentPayoutLegs", error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    logServerError("booking-payouts-ledger.countHeldTalentPayoutLegs", err);
    return 0;
  }
}

/**
 * All currently-held (and failed) payout legs across the platform — for the
 * platform-admin reconciliation list. Service-role read; newest first.
 */
export async function listHeldPayouts(sbIn?: SupabaseClient | null): Promise<HeldLedgerRow[]> {
  const sb = sbIn ?? createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("booking_payouts")
      // Deliberately NOT filtered by release_after. This is the platform-admin
      // reconciliation view and an admin must see everything -- hiding
      // scheduled legs is how money goes missing quietly. But the gate is
      // SELECTED so the list can distinguish "stuck" from "scheduled":
      // twenty legs correctly waiting for a show must not read as twenty
      // problems, which is the same cry-wolf failure as an over-eager alarm.
      .select(
        "id, booking_id, participant_id, party, talent_profile_id, tenant_id, amount_cents, currency, status, attempts, last_error, created_at, release_after",
      )
      .in("status", ["held", "failed"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      bookingId: r.booking_id as string,
      participantId: r.participant_id as string,
      party: r.party as PayoutParty,
      talentProfileId: (r.talent_profile_id as string | null) ?? null,
      tenantId: (r.tenant_id as string | null) ?? null,
      amountCents: r.amount_cents as number,
      currency: r.currency as string,
      status: r.status as string,
      attempts: (r.attempts as number) ?? 0,
      lastError: (r.last_error as string | null) ?? null,
      createdAt: r.created_at as string,
      releaseAfter: (r.release_after as string | null) ?? null,
    }));
  } catch (err) {
    logServerError("booking-payouts.listHeld", err);
    return [];
  }
}

/** Sum of a payee's currently-held payout legs, grouped by currency. For the UX banner. */
export async function getHeldPayoutTotals(
  target: { talentProfileId?: string | null; tenantId?: string | null },
  sbIn?: SupabaseClient | null,
): Promise<Array<{ currency: string; amountCents: number; count: number }>> {
  const sb = sbIn ?? createServiceRoleClient();
  if (!sb) return [];
  try {
    // Phase C — a tenant's held total includes both its workspace-margin legs and
    // any channel_referral legs owed to it (tenant_id = channel party), which is
    // exactly what the shared payee scope encodes.
    const scope = payoutLegPayeeScope(target);
    if (!scope) return [];

    let query = sb.from("booking_payouts").select("amount_cents, currency").eq("status", "held");
    for (const [col, val] of scope.eq) query = query.eq(col, val);
    for (const [col, vals] of scope.in) query = query.in(col, vals);

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

// ─── Reversals (audit #14: dispute lost + refund clawback) ──────────────────

export type PayoutReversalMode = "full" | "partial";

export type PayoutReversalOutcome = {
  legId: string;
  participantId: string;
  party: PayoutParty;
  /** Cents reversed (full) / clawed (partial) / 0 for held-cancel + noop. */
  amountCents: number;
  result: "reversed" | "reversed_partial" | "cancelled_held" | "failed" | "noop";
  reversalId?: string | null;
  detail?: string;
};

export type ReverseDeps = {
  sb?: SupabaseClient | null;
  stripe?: Stripe | null;
};

type LedgerLegRow = {
  id: string;
  participant_id: string;
  party: PayoutParty;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_transfer_id: string | null;
  attempts: number;
};

/** Key a partial clawback amount is mapped onto a specific ledger leg. */
export function reversalLegKey(participantId: string, party: PayoutParty): string {
  return `${participantId}:${party}`;
}

/**
 * Talent-protective partial-refund clawback split.
 *
 * Audit #14 — "don't over-claw the talent": a partial refund is absorbed FIRST
 * by the platform fee the platform retained, THEN by the workspace margin, and
 * only a residual beyond both would reach the talent's protected quote. The
 * talent is never auto-clawed here — `talentResidualCents` is returned so the
 * caller can escalate it to manual ops instead of silently reducing a payout
 * the talent already received.
 *
 * The workspace clawback is split across the (possibly several) workspace legs
 * in proportion to each leg's transferred amount; the rounding remainder is
 * assigned to the largest leg first (and never beyond that leg's own amount) so
 * the per-leg cents sum EXACTLY to the workspace clawback total — no drift, no
 * over-reversal.
 */
export function computeTalentProtectiveClawback(input: {
  platformFeeCents: number;
  workspaceLegs: Array<{ key: string; amountCents: number }>;
  talentTotalCents: number;
  refundedCents: number;
}): {
  platformAbsorbedCents: number;
  workspaceClawbackByLeg: Map<string, number>;
  workspaceClawbackTotalCents: number;
  talentResidualCents: number;
} {
  const refunded = Math.max(0, Math.round(input.refundedCents));
  const platformAbsorbedCents = Math.min(refunded, Math.max(0, input.platformFeeCents));
  const afterPlatform = refunded - platformAbsorbedCents;

  const wsLegs = input.workspaceLegs.filter((l) => l.amountCents > 0);
  const workspaceTotal = wsLegs.reduce((s, l) => s + l.amountCents, 0);
  const workspaceClawbackTotalCents = Math.min(afterPlatform, workspaceTotal);

  const workspaceClawbackByLeg = new Map<string, number>();
  if (workspaceClawbackTotalCents > 0 && workspaceTotal > 0) {
    const sorted = [...wsLegs].sort((a, b) => b.amountCents - a.amountCents);
    let allocated = 0;
    for (const leg of sorted) {
      const share = Math.floor((workspaceClawbackTotalCents * leg.amountCents) / workspaceTotal);
      workspaceClawbackByLeg.set(leg.key, share);
      allocated += share;
    }
    let remainder = workspaceClawbackTotalCents - allocated;
    for (const leg of sorted) {
      if (remainder <= 0) break;
      const cur = workspaceClawbackByLeg.get(leg.key) ?? 0;
      const room = leg.amountCents - cur;
      const add = Math.min(room, remainder);
      workspaceClawbackByLeg.set(leg.key, cur + add);
      remainder -= add;
    }
  }

  const afterWorkspace = afterPlatform - workspaceClawbackTotalCents;
  const talentResidualCents = Math.min(Math.max(0, afterWorkspace), Math.max(0, input.talentTotalCents));

  return { platformAbsorbedCents, workspaceClawbackByLeg, workspaceClawbackTotalCents, talentResidualCents };
}

async function markLegReversed(
  sb: SupabaseClient,
  leg: { id: string; attempts: number },
  note: string,
): Promise<void> {
  await sb
    .from("booking_payouts")
    .update({
      status: "reversed",
      attempts: (leg.attempts ?? 0) + 1,
      last_error: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leg.id);
}

/**
 * Build the per-partial-reversal Stripe idempotency key.
 *
 * UNIQUE per distinct partial refund (so two genuinely-different partials on the
 * SAME workspace transfer each get their own reversal) yet STABLE for a
 * re-delivered same refund (so it replays the identical reversal — no
 * double-claw). The stable per-refund anchor is the Stripe Refund id (`re_...`),
 * which Stripe emits once per refund and which is also persisted as
 * `provider_refund_id`; we fall back to the charge id (still per refund event on
 * the legacy/trimmed-payload path) only when no refund id is present.
 *
 * Before this, the key was `reverse_partial_<transferId>` — reused for EVERY
 * partial against the same transfer, so a 2nd distinct partial reused the key
 * with a different amount and Stripe rejected it (the reversal was logged +
 * escalated, never applied). Anchoring on the refund id fixes that.
 */
export function partialReversalIdempotencyKey(transferId: string, anchor: string | null): string {
  return anchor ? `reverse_partial_${transferId}_${anchor}` : `reverse_partial_${transferId}`;
}

/** Partial workspace-leg reversal (talent untouched). Idempotent per (transfer,
 *  refund): a re-delivered same refund replays the SAME reversal, a genuinely
 *  different partial gets its own. `anchor` is the stable per-refund key (Stripe
 *  `re_...`, else the charge id).
 *
 *  The clawback is capped at the leg's REMAINING (un-reversed) amount —
 *  `amount_cents − alreadyReversedCents` — NOT the leg's full transferred amount.
 *  `alreadyReversedCents` is the transfer's live `amount_reversed` (read by the
 *  caller from `stripe.transfers.list`, the same source the full path uses), so
 *  two additive partials on the SAME leg can never cumulatively over-reverse past
 *  the leg total — correct independent of the talent-protective split. */
async function partialReverseLeg(
  sb: SupabaseClient,
  stripe: Stripe | null,
  leg: LedgerLegRow,
  clawbackCents: number,
  reference: string,
  anchor: string | null,
  alreadyReversedCents = 0,
): Promise<PayoutReversalOutcome> {
  const base = { legId: leg.id, participantId: leg.participant_id, party: leg.party } as const;
  const remaining = Math.max(0, leg.amount_cents - Math.max(0, alreadyReversedCents));
  const amount = Math.min(Math.max(0, Math.round(clawbackCents)), remaining);
  if (amount <= 0) return { ...base, amountCents: 0, result: "noop" };

  if (!leg.stripe_transfer_id || !stripe) {
    await sb
      .from("booking_payouts")
      .update({ last_error: `${reference} partial_reversal ${amount} (mock)`, updated_at: new Date().toISOString() })
      .eq("id", leg.id);
    return { ...base, amountCents: amount, result: "reversed_partial" };
  }

  try {
    // `reverse_partial_<transferId>_<refundId>` is unique per distinct partial
    // refund yet stable for a re-delivered same refund: a re-delivery replays the
    // SAME reversal (no double-claw), while a genuinely DIFFERENT later partial
    // refund (different `re_...`) gets a NEW key → Stripe applies it as a second,
    // distinct reversal of this transfer instead of rejecting a key reuse.
    const reversal = await stripe.transfers.createReversal(
      leg.stripe_transfer_id,
      { amount },
      { idempotencyKey: partialReversalIdempotencyKey(leg.stripe_transfer_id, anchor) },
    );
    await sb
      .from("booking_payouts")
      .update({
        last_error: `${reference} partial_reversal ${amount} -> ${reversal.id}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leg.id);
    return { ...base, amountCents: amount, result: "reversed_partial", reversalId: reversal.id };
  } catch (err) {
    logServerError(`booking-payouts.partialReverse[leg=${leg.id}]`, err);
    return { ...base, amountCents: 0, result: "failed", detail: err instanceof Error ? err.message : "reversal failed" };
  }
}

/**
 * Reverse a booking's payouts after a LOST dispute / refund, syncing the ledger.
 *
 *   mode 'full'  — dispute lost or full refund. Every transferred leg's Stripe
 *     transfer is reversed for its remaining (un-reversed) amount and the leg is
 *     marked 'reversed'. Held/failed legs (money never sent) are ALSO marked
 *     'reversed' so they can never be released later — the booking was clawed
 *     back in full.
 *   mode 'partial' — partial refund. ONLY the workspace legs named in
 *     `workspaceClawbackByLeg` are reversed, each by its clawback amount (a
 *     partial Stripe reversal). Talent legs and held legs are left intact (the
 *     talent keeps their protected quote). `partialReversalAnchor` is the stable
 *     per-refund key (the Stripe Refund id `re_...`, else the charge id) the
 *     partial idempotency key is built from — UNIQUE per distinct refund so two
 *     partials on the same transfer don't collide, STABLE on a re-delivery so the
 *     same refund replays the same reversal.
 *
 * Idempotent + best-effort; never throws (the refund/chargeback already settled
 * at Stripe). Full reversals reuse `reverse_<transferId>` and reverse only the
 * remaining amount read live from the transfer, so a re-delivery — or a
 * partial-then-full sequence — never double-reverses.
 */
export async function reverseBookingPayouts(
  bookingId: string,
  plan: {
    mode: PayoutReversalMode;
    reference: string;
    workspaceClawbackByLeg?: Map<string, number>;
    /** Partial mode only: stable per-refund anchor (Stripe `re_...` / charge id)
     *  for the partial-reversal idempotency key. */
    partialReversalAnchor?: string | null;
  },
  deps: ReverseDeps = {},
): Promise<PayoutReversalOutcome[]> {
  const sb = deps.sb ?? createServiceRoleClient();
  if (!sb) return [];
  const stripe = deps.stripe ?? getStripe();
  const outcomes: PayoutReversalOutcome[] = [];

  try {
    const { data, error } = await sb
      .from("booking_payouts")
      .select("id, participant_id, party, amount_cents, currency, status, stripe_transfer_id, attempts")
      .eq("booking_id", bookingId);
    if (error || !data?.length) return [];
    const legs = data as LedgerLegRow[];

    // Read each live transfer's already-reversed amount once (both modes) so we
    // reverse only the leg's REMAINING amount: 'full' reverses the whole residual,
    // 'partial' caps each clawback at the residual. This makes a second additive
    // partial on the same leg correct (and a partial-then-full sequence safe)
    // regardless of the talent-protective split.
    const reversedAlready = new Map<string, number>();
    if (stripe) {
      try {
        const list = await stripe.transfers.list({ transfer_group: `booking_${bookingId}`, limit: 100 });
        for (const t of list.data) reversedAlready.set(t.id, t.amount_reversed ?? 0);
      } catch (err) {
        logServerError(`booking-payouts.reverse.list[booking=${bookingId}]`, err);
      }
    }

    for (const leg of legs) {
      const base = { legId: leg.id, participantId: leg.participant_id, party: leg.party } as const;

      if (leg.status === "reversed") {
        outcomes.push({ ...base, amountCents: 0, result: "noop" });
        continue;
      }

      if (plan.mode === "partial") {
        const clawback = plan.workspaceClawbackByLeg?.get(reversalLegKey(leg.participant_id, leg.party)) ?? 0;
        if (leg.party !== "workspace" || leg.status !== "transferred" || clawback <= 0) continue;
        const already = leg.stripe_transfer_id ? (reversedAlready.get(leg.stripe_transfer_id) ?? 0) : 0;
        outcomes.push(
          await partialReverseLeg(sb, stripe, leg, clawback, plan.reference, plan.partialReversalAnchor ?? null, already),
        );
        continue;
      }

      // ── mode 'full' ──
      if (leg.status === "transferred" && leg.stripe_transfer_id && stripe) {
        const already = reversedAlready.get(leg.stripe_transfer_id) ?? 0;
        const remaining = Math.max(0, leg.amount_cents - already);
        let reversalId: string | null = null;
        if (remaining > 0) {
          try {
            const reversal = await stripe.transfers.createReversal(
              leg.stripe_transfer_id,
              { amount: remaining },
              { idempotencyKey: `reverse_${leg.stripe_transfer_id}` },
            );
            reversalId = reversal.id;
          } catch (err) {
            logServerError(`booking-payouts.reverse[leg=${leg.id}]`, err);
            await sb
              .from("booking_payouts")
              .update({
                attempts: (leg.attempts ?? 0) + 1,
                last_error: `${plan.reference}: reversal failed`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", leg.id);
            outcomes.push({ ...base, amountCents: remaining, result: "failed", detail: err instanceof Error ? err.message : "reversal failed" });
            continue;
          }
        }
        await markLegReversed(sb, leg, `${plan.reference}${reversalId ? ` ${reversalId}` : ""}`);
        outcomes.push({ ...base, amountCents: remaining, result: "reversed", reversalId });
        continue;
      }

      // Transferred-but-mock (no transfer id / no Stripe), or held/failed →
      // cancel in the ledger so it can never be released after a full clawback.
      const cancelled = leg.status === "held" || leg.status === "failed";
      await markLegReversed(sb, leg, `${plan.reference}${cancelled ? " (cancelled before transfer)" : " (mock)"}`);
      outcomes.push({ ...base, amountCents: 0, result: cancelled ? "cancelled_held" : "reversed" });
    }
  } catch (err) {
    logServerError(`booking-payouts.reverse[booking=${bookingId}]`, err);
  }
  return outcomes;
}
