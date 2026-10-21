import "server-only";

/**
 * TUL-1601 · The I/O side of automatic monthly rent: the webhook apply deps, and keeping the Stripe subscription in
 * step with the plan (ended -> cancelled now, paused -> collection paused, active -> resumed), on the platform the
 * subscription lives on (the studio's: US or MX, TUL-1610). Every call is tenant-scoped and fail-soft toward NOT charging.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { rentAutopayFlagOn, rentAutopayPercentFlagOn } from "./rent-autopay";
import { rentReversalCents } from "./rent-autopay-refunds";
import { percentMonthForInvoice, percentRentLines } from "./rent-autopay";
import { shouldSkipAutopayInvoice } from "./rent-outside";
import { periodOfSeconds } from "./rent-autopay-routing";
import { loadMemberSalesBase } from "./rent-sales-base.server";
import { getAppUrl } from "@/lib/auth-flow";
import { dispatchEventNotifications } from "@/lib/notifications/dispatcher";
import { afterResponse } from "@/lib/server/after-response";
import { logServerError } from "@/lib/server/safe-error";
import { getStripeFor, type StripeAccountKey } from "@/lib/stripe/client";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { applyRentSubscriptionEvent, type ApplyOutcome, type RentAutopayApplyDeps } from "./rent-autopay-apply";
import type { RentSubscriptionEvent } from "./rent-autopay-routing";

export async function cancelRentSubscription(subscriptionId: string, platform: StripeAccountKey = "us"): Promise<boolean> {
  const stripe = getStripeFor(platform);
  if (!stripe) return false;
  try {
    // Ended now: no proration, no refund of a month already paid, no further invoices.
    await stripe.subscriptions.cancel(subscriptionId, { invoice_now: false, prorate: false });
    return true;
  } catch (err) {
    logServerError("rent.autopay.cancel", err);
    return false;
  }
}

function buildApplyDeps(admin: SupabaseClient, account: StripeAccountKey): RentAutopayApplyDeps {
  return {
    async loadPlan(planId, tenantId) {
      const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId)
        .select("status, autopay_status, stripe_subscription_id, talent_profile_id")
        .eq("id", planId)
        .maybeSingle();
      // A DB error is not "plan not found": throwing makes handleRentSubscriptionEvent answer "unavailable" (Stripe retries).
      if (error) throw error;
      if (!data) return null;
      const r = data as { status: string; autopay_status: string; stripe_subscription_id: string | null; talent_profile_id: string };
      return { status: r.status, autopayStatus: r.autopay_status, subscriptionId: r.stripe_subscription_id, talentProfileId: r.talent_profile_id };
    },
    async setAutopay(planId, tenantId, patch) {
      const { error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId)
        .update({
          autopay_status: patch.autopayStatus,
          ...(patch.subscriptionId !== undefined ? { stripe_subscription_id: patch.subscriptionId } : {}),
          ...(patch.clearFirstPeriod ? { autopay_first_period: null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", planId);
      if (error) logServerError("rent.autopay.setAutopay", error);
      return !error;
    },
    async loadInvoice(planId, tenantId, period) {
      const { data, error } = await tenantScopedQuery(admin, "studio_rent_invoices", tenantId)
        .select("status, stripe_invoice_id, source")
        .eq("plan_id", planId)
        .eq("period", period)
        .maybeSingle();
      // A DB error is not "no invoice yet": throwing makes the webhook answer "unavailable" and Stripe retries.
      if (error) throw error;
      const r = data as { status: string; stripe_invoice_id: string | null; source: string } | null;
      return r ? { status: r.status, stripeInvoiceId: r.stripe_invoice_id, source: r.source } : null;
    },
    async writeInvoice(row) {
      const { error } = await tenantScopedQuery(admin, "studio_rent_invoices", row.tenantId).upsert(
        {
          plan_id: row.planId,
          talent_profile_id: row.talentProfileId,
          period: row.period,
          amount_cents: row.amountCents,
          currency: row.currency,
          status: row.status,
          source: "autopay",
          stripe_invoice_id: row.stripeInvoiceId,
          ...(row.status === "paid" ? { paid_at: new Date().toISOString() } : {}),
        },
        { onConflict: "plan_id,period" },
      );
      if (error) logServerError("rent.autopay.writeInvoice", error);
      return !error;
    },
    // The event arrived on the platform the subscription lives on.
    cancelSubscription: (id) => cancelRentSubscription(id, account),
    async notify(kind, p) {
      try {
        const [{ data: tp }, { data: ag }] = await Promise.all([
          admin.from("talent_profiles").select("user_id").eq("id", p.talentProfileId).maybeSingle(),
          admin.from("agencies").select("display_name").eq("id", p.tenantId).maybeSingle(),
        ]);
        const userId = (tp as { user_id?: string | null } | null)?.user_id ?? null;
        if (!userId) return;
        afterResponse(() =>
          dispatchEventNotifications({
            type: kind === "autopay_failed" ? "rent.autopay_failed" : "rent.autopay_canceled",
            tenantId: p.tenantId,
            userId,
            eventId: `rent-autopay:${p.planId}:${kind}:${p.period ?? "plan"}`,
            payload: {
              workspaceName: (ag as { display_name?: string | null } | null)?.display_name ?? null,
              period: p.period ?? null,
              rentUrl: `${getAppUrl()}/talent/rent-proposals`,
            },
          }).catch((err) => logServerError("rent.autopay.notify", err)),
        );
      } catch (err) {
        logServerError("rent.autopay.notify", err);
      }
    },
    alert(detail) {
      logServerError("rent.autopay.doublePayment", new Error(detail));
    },
  };
}

/** Webhook entry: apply one classified rent-subscription event. Never throws. */
export async function handleRentSubscriptionEvent(admin: SupabaseClient, ev: Exclude<RentSubscriptionEvent, { type: "draft" | "past_draft" }>, account: StripeAccountKey = "us"): Promise<ApplyOutcome> {
  try {
    return await applyRentSubscriptionEvent(ev, buildApplyDeps(admin, account));
  } catch (err) {
    logServerError("rent.autopay.handle", err);
    return "unavailable";
  }
}

/**
 * Keep the subscription in step with the plan, and tell Stripe FIRST: the caller changes the plan only when this
 * returns ok, so a Stripe failure can never leave a plan ended while the member keeps being charged.
 * ended: cancelled now. paused: collection paused (invoices voided, nothing charged). active: collection resumed.
 * A plan with no live subscription is ok. A live subscription with no Stripe client is NOT ok.
 */
export async function syncRentAutopayWithPlan(
  admin: SupabaseClient,
  p: { tenantId: string; planId: string; planStatus: "active" | "paused" | "ended" },
  deps: { stripeFor?: (k: StripeAccountKey) => Stripe | null } = {},
): Promise<{ ok: boolean }> {
  try {
    const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId)
      .select("stripe_subscription_id, autopay_status, autopay_platform")
      .eq("id", p.planId)
      .maybeSingle();
    // A read we could not make is NOT "no subscription": the plan must not change while a card may still be charged.
    if (error) {
      logServerError("rent.autopay.sync.read", error);
      return { ok: false };
    }
    const r = data as { stripe_subscription_id: string | null; autopay_status: string; autopay_platform: StripeAccountKey | null } | null;
    const platform: StripeAccountKey = r?.autopay_platform === "mx" ? "mx" : "us";
    if (!r?.stripe_subscription_id || r.autopay_status === "off" || r.autopay_status === "canceled") return { ok: true };
    const stripe = (deps.stripeFor ?? getStripeFor)(platform);
    if (!stripe) return { ok: false };
    if (p.planStatus === "ended") {
      await stripe.subscriptions.cancel(r.stripe_subscription_id, { invoice_now: false, prorate: false });
      await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).update({ autopay_status: "canceled" }).eq("id", p.planId);
      return { ok: true };
    }
    await stripe.subscriptions.update(r.stripe_subscription_id, {
      pause_collection: p.planStatus === "paused" ? { behavior: "void" } : "",
    });
    return { ok: true };
  } catch (err) {
    logServerError("rent.autopay.sync", err);
    return { ok: false };
  }
}

// ── TUL-1611: refunds and disputes on an automatic rent charge ────────────────────────────────────────────────

export type RentChargeOutcome = "not_rent" | "reversed" | "nothing_to_reverse" | "dispute_flagged" | "needs_manual" | "retry";

/** A Stripe refusal that retrying cannot fix (bad request / not found / forbidden), as opposed to a network or 5xx error. */
export function isPermanentStripeError(err: unknown): boolean {
  const e = err as { type?: string; statusCode?: number } | null;
  if (!e) return false;
  const code = e.statusCode ?? 0;
  return e.type === "StripeInvalidRequestError" || (code >= 400 && code < 500 && code !== 409 && code !== 429);
}

/**
 * Runs BEFORE the normal refund/dispute routing (which keeps recording every dispute and ignores untracked refunds).
 * Resolves the charge to a rent invoice (PaymentIntent -> invoice payment -> our row by Stripe invoice id). Not a rent
 * charge: no-op. A refund or a LOST dispute reverses the studio's proportional share from its transfer
 * (`rentReversalCents`, cumulative, idempotency-keyed); a new dispute is flagged on the row and the owner is told.
 */
export async function handleRentChargeEvent(admin: SupabaseClient, stripe: Stripe, event: Stripe.Event): Promise<RentChargeOutcome> {
  // This runs on EVERY platform refund and dispute. It must be invisible unless the charge is a confirmed rent charge:
  // flag off or a Connect-account event is never ours, and any doubt before the rent row is confirmed is "not_rent"
  // (a booking refund must still record normally). Only a confirmed rent row may ask Stripe to retry.
  if (!rentAutopayFlagOn()) return "not_rent";
  if (event.account) return "not_rent";
  let confirmed = false;
  let confirmedRow: { id: string; tenantId: string } | null = null;
  try {
    let charge: Stripe.Charge;
    let lostDisputeCents = 0;
    let disputeOpened = false;
    if (event.type === "charge.refunded") {
      charge = event.data.object as Stripe.Charge;
    } else if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
      if (!chargeId) return "not_rent";
      charge = await stripe.charges.retrieve(chargeId);
      if (event.type === "charge.dispute.closed" && dispute.status === "lost") lostDisputeCents = dispute.amount ?? 0;
      disputeOpened = event.type === "charge.dispute.created";
    } else {
      return "not_rent";
    }
    const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!pi) return "not_rent";
    const payments = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, limit: 1 });
    const inv = payments.data[0]?.invoice;
    const invoiceId = typeof inv === "string" ? inv : inv?.id;
    if (!invoiceId) return "not_rent";

    // stripe_invoice_id is unique across workspaces (index): this lookup names exactly one rent row, or none.
    const { data: row, error } = await admin
      .from("studio_rent_invoices")
      .select("id, tenant_id, plan_id, period, talent_profile_id")
      .eq("stripe_invoice_id", invoiceId)
      .maybeSingle();
    if (error) {
      // Logged with the event id, never swallowed: on prod before the rent tables exist this is expected and a booking
      // refund must still record, but a real rent refund hit by a transient error can be found and reconciled.
      logServerError("rent.autopay.chargeEvent.rentRowLookup", new Error(`event ${event.id} (${event.type}): ${(error as { message?: string }).message ?? "rent row lookup failed"}`));
      return "not_rent";
    }
    if (!row) return "not_rent";
    confirmed = true;
    const r = row as { id: string; tenant_id: string; plan_id: string; period: string; talent_profile_id: string };
    confirmedRow = { id: r.id, tenantId: r.tenant_id };

    if (disputeOpened) {
      await tenantScopedQuery(admin, "studio_rent_invoices", r.tenant_id).update({ disputed_at: new Date().toISOString() }).eq("id", r.id);
      logServerError("rent.autopay.dispute", new Error(`rent invoice ${r.id} (${r.period}) disputed: charge ${charge.id}`));
      afterResponse(() =>
        dispatchEventNotifications({
          type: "rent.autopay_disputed",
          tenantId: r.tenant_id,
          eventId: `rent-dispute:${charge.id}`,
          payload: { period: r.period, rentUrl: `${getAppUrl()}` },
        }).catch((err) => logServerError("rent.autopay.disputeNotify", err)),
      );
      return "dispute_flagged";
    }

    const transferId = typeof charge.transfer === "string" ? charge.transfer : charge.transfer?.id;
    let reversed = 0;
    if (transferId) {
      const transfer = await stripe.transfers.retrieve(transferId);
      const amount = rentReversalCents({
        chargeCents: charge.amount,
        transferCents: transfer.amount,
        alreadyReversedCents: transfer.amount_reversed ?? 0,
        refundedCents: charge.amount_refunded ?? 0,
        lostDisputeCents,
      });
      if (amount > 0) {
        const target = (transfer.amount_reversed ?? 0) + amount;
        await stripe.transfers.createReversal(transferId, { amount }, { idempotencyKey: `rent_reverse_${transferId}_${target}` });
        reversed = amount;
      }
    }
    const fullyRefunded = (charge.amount_refunded ?? 0) >= charge.amount;
    await tenantScopedQuery(admin, "studio_rent_invoices", r.tenant_id)
      .update({
        refunded_cents: charge.amount_refunded ?? 0,
        ...(fullyRefunded ? { status: "refunded" } : {}),
        ...(lostDisputeCents > 0 ? { dispute_lost_at: new Date().toISOString() } : {}),
      })
      .eq("id", r.id);
    return reversed > 0 ? "reversed" : "nothing_to_reverse";
  } catch (err) {
    logServerError("rent.autopay.chargeEvent", err);
    if (!confirmed) {
      // Not (yet) known to be rent: never a 503 for a booking refund. Logged with the event id so a real rent refund can be reconciled by hand.
      logServerError("rent.autopay.chargeEvent.unconfirmed", new Error(`event ${event.id} (${event.type}) could not be classified as rent or not`));
      return "not_rent";
    }
    if (isPermanentStripeError(err)) {
      // A confirmed rent charge whose reversal Stripe permanently refuses: mark the row for reconcile and stop the retry loop.
      logServerError("rent.autopay.chargeEvent.permanent", new Error(`event ${event.id}: reversal permanently failed, reconcile rent row`));
      if (confirmedRow) {
        const { error: markErr } = await tenantScopedQuery(admin, "studio_rent_invoices", confirmedRow.tenantId).update({ reversal_failed_at: new Date().toISOString() }).eq("id", confirmedRow.id);
        if (markErr) logServerError("rent.autopay.chargeEvent.markFailed", markErr);
      }
      return "needs_manual";
    }
    return "retry";
  }
}

/**
 * TUL-1700: the support / reconcile read for refunds and lost disputes whose share reversal Stripe permanently refused
 * (rows marked `reversal_failed_at`). Newest first. null = unreadable (never an empty list that hides a problem).
 */
export async function listRentReversalsToReconcile(admin: SupabaseClient, p: { tenantId?: string; limit?: number } = {}): Promise<Array<{ id: string; tenantId: string; planId: string; period: string; failedAt: string }> | null> {
  try {
    let q = admin.from("studio_rent_invoices").select("id, tenant_id, plan_id, period, reversal_failed_at").not("reversal_failed_at", "is", null);
    if (p.tenantId) q = q.eq("tenant_id", p.tenantId);
    const { data, error } = await q.order("reversal_failed_at", { ascending: false }).limit(Math.min(Math.max(p.limit ?? 50, 1), 200));
    if (error || !Array.isArray(data)) {
      logServerError("rent.autopay.reconcileList", error);
      return null;
    }
    return (data as Array<{ id: string; tenant_id: string; plan_id: string; period: string; reversal_failed_at: string }>).map((r) => ({ id: r.id, tenantId: r.tenant_id, planId: r.plan_id, period: r.period, failedAt: r.reversal_failed_at }));
  } catch (err) {
    logServerError("rent.autopay.reconcileList", err);
    return null;
  }
}

// ── TUL-1609: the closed month's percentage on the monthly invoice ─────────────────────────────────────────────

export type PercentDraftOutcome = "added" | "nothing_owed" | "skipped" | "retry";

/**
 * TUL-1701: a month whose percentage the subscription did NOT bill (the invoice was already finalized, or the
 * percentage switch is off) is written on the plan and the owner is told, so it is never lost silently. Fail-soft: a
 * marker that cannot be written still alerts. (Collecting a marked month by payment link needs a percentage-only
 * invoice key of its own: a separate card, the (plan, month) row is taken by that month's rent.)
 */
export type MarkMissedOutcome = "marked" | "already" | "error";

export async function markPercentMissed(admin: SupabaseClient, p: { tenantId: string; planId: string; month: string; reason: "finalized" | "flag_off" }): Promise<MarkMissedOutcome> {
  try {
    const { data, error: readErr } = await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).select("autopay_percent_missed").eq("id", p.planId).maybeSingle();
    // A read we could not make is NOT "nothing marked yet": writing [month] now would overwrite the months already marked.
    if (readErr) throw readErr;
    if (!data) throw new Error(`plan ${p.planId} not found`);
    const current = ((data as { autopay_percent_missed?: string[] | null }).autopay_percent_missed ?? []) as string[];
    if (current.includes(p.month)) return "already";
    const { error } = await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).update({ autopay_percent_missed: [...current, p.month] }).eq("id", p.planId);
    if (error) throw error;
    logServerError("rent.autopay.percentMissed", new Error(`plan ${p.planId}: percentage of ${p.month} was not billed (${p.reason})`));
    afterResponse(() =>
      dispatchEventNotifications({
        type: "rent.autopay_percent_missed",
        tenantId: p.tenantId,
        eventId: `rent-percent-missed:${p.planId}:${p.month}`,
        payload: { period: p.month, rentUrl: `${getAppUrl()}` },
      }).catch((err) => logServerError("rent.autopay.percentMissedNotify", err)),
    );
    return "marked";
  } catch (err) {
    logServerError("rent.autopay.percentMissedMark", err);
    return "error";
  }
}

/**
 * TUL-1717 · An invoice of a percentage plan that reached us already past its draft window (`invoice.created` with a
 * status other than draft, or `invoice.finalized`) and was never stamped: its closed month's percentage was NOT billed, so
 * the month is marked for the link path instead of being lost. Stamped invoices, fixed-only plans, a month the owner
 * took outside and a foreign subscription are skipped. A read or write that failed is "retry", never a silent skip.
 */
export async function handleRentUnbilledPercent(
  admin: SupabaseClient,
  ev: Extract<RentSubscriptionEvent, { type: "past_draft" }>,
): Promise<"marked" | "skipped" | "retry"> {
  try {
    if (ev.stamped) return "skipped";
    const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", ev.tenantId)
      .select("stripe_subscription_id, rent_percent_bps, accepted_percent_bps, autopay_first_period, autopay_skip_periods")
      .eq("id", ev.planId)
      .maybeSingle();
    if (error) {
      logServerError("rent.autopay.pastDraft.read", error);
      return "retry";
    }
    const plan = data as { stripe_subscription_id: string | null; rent_percent_bps: number | null; accepted_percent_bps: number | null; autopay_first_period: string | null; autopay_skip_periods: string[] | null } | null;
    if (!plan || plan.stripe_subscription_id !== ev.subscriptionId) return "skipped";
    const percentBps = plan.rent_percent_bps ?? 0;
    if (percentBps <= 0 || plan.accepted_percent_bps !== percentBps) return "skipped";
    const month = percentMonthForInvoice({ invoicePeriod: periodOfSeconds(ev.periodStart), autopayFirstPeriod: plan.autopay_first_period });
    if (!month) return "skipped";
    if (shouldSkipAutopayInvoice(plan.autopay_skip_periods ?? [], month)) return "skipped";
    const out = await markPercentMissed(admin, { tenantId: ev.tenantId, planId: ev.planId, month, reason: "finalized" });
    return out === "error" ? "retry" : out === "marked" ? "marked" : "skipped";
  } catch (err) {
    logServerError("rent.autopay.pastDraft", err);
    return "retry";
  }
}

/**
 * On a monthly DRAFT invoice of a percentage plan, add the closed month's percentage (and the Tulala fee on it) as
 * invoice items, then stamp the invoice metadata so a replay adds nothing (and the paid event records the full rent).
 * The subscription's transfer_data moves the studio's share of the whole invoice. A base that cannot be read asks
 * Stripe to retry; Stripe finalizes drafts about an hour after creation.
 */
export async function addPercentToDraft(admin: SupabaseClient, stripe: Stripe, ev: Extract<RentSubscriptionEvent, { type: "draft" }>): Promise<PercentDraftOutcome> {
  try {
    if (ev.percentAdded) return "skipped";
    const { data } = await tenantScopedQuery(admin, "studio_rent_plans", ev.tenantId)
      .select("stripe_subscription_id, rent_percent_bps, accepted_percent_bps, currency, talent_profile_id, autopay_first_period, autopay_skip_periods")
      .eq("id", ev.planId)
      .maybeSingle();
    const plan = data as { stripe_subscription_id: string | null; rent_percent_bps: number | null; accepted_percent_bps: number | null; currency: string; talent_profile_id: string; autopay_first_period: string | null; autopay_skip_periods: string[] | null } | null;
    if (!plan || plan.stripe_subscription_id !== ev.subscriptionId) return "skipped";
    const percentBps = plan.rent_percent_bps ?? 0;
    // Only the percentage the member accepted is ever charged.
    if (percentBps <= 0 || plan.accepted_percent_bps !== percentBps) return "skipped";
    const month = percentMonthForInvoice({ invoicePeriod: periodOfSeconds(ev.periodStart), autopayFirstPeriod: plan.autopay_first_period });
    if (!month || ev.feeBps == null || !ev.customerId) return "skipped";
    // TUL-1646: a month the owner recorded as paid outside already settled its percentage; never bill it again.
    if (shouldSkipAutopayInvoice(plan.autopay_skip_periods ?? [], month)) return "skipped";
    // Re-read the LIVE invoice FIRST: the event may be old. A stamped invoice is done, whatever the switch says now.
    const live = await stripe.invoices.retrieve(ev.invoiceId);
    if (live.metadata?.rent_percent_cents != null) return "skipped";
    // The percentage switch is off (never on, or turned off after being on): the fixed part still bills, so say so loudly.
    if (!rentAutopayPercentFlagOn()) {
      return (await markPercentMissed(admin, { tenantId: ev.tenantId, planId: ev.planId, month, reason: "flag_off" })) === "error" ? "retry" : "skipped";
    }
    // No longer a draft (a sales read that kept failing until Stripe finalized it): it can no longer take the percentage:
    // mark the month, never lose it.
    if (live.status !== "draft") {
      return (await markPercentMissed(admin, { tenantId: ev.tenantId, planId: ev.planId, month, reason: "finalized" })) === "error" ? "retry" : "skipped";
    }
    const base = await loadMemberSalesBase(admin, { tenantId: ev.tenantId, talentProfileId: plan.talent_profile_id, period: month, currency: plan.currency });
    const lines = percentRentLines({ salesBaseCents: base, percentBps, feeBps: ev.feeBps });
    if (!lines) return "retry";
    const currency = plan.currency.toLowerCase();
    if (lines.percentCents > 0) {
      await stripe.invoiceItems.create(
        { customer: ev.customerId, invoice: ev.invoiceId, amount: lines.percentCents, currency, description: `Station rent: ${percentBps / 100}% of sales, ${month}`, metadata: { rent_part: "percent", month } },
        { idempotencyKey: `rent_pct_${ev.invoiceId}` },
      );
      if (lines.feeCents > 0) {
        await stripe.invoiceItems.create(
          { customer: ev.customerId, invoice: ev.invoiceId, amount: lines.feeCents, currency, description: "Tulala service fee", metadata: { rent_part: "percent_fee", month } },
          { idempotencyKey: `rent_pct_fee_${ev.invoiceId}` },
        );
      }
    }
    await stripe.invoices.update(ev.invoiceId, { metadata: { rent_percent_cents: String(lines.percentCents), rent_percent_month: month } });
    return lines.percentCents > 0 ? "added" : "nothing_owed";
  } catch (err) {
    logServerError("rent.autopay.percentDraft", err);
    return "retry";
  }
}

// ── TUL-1646: a month paid outside Tulala must not also be charged by card ──────────────────────────────────────

/** Void one subscription invoice that is still collectable: a draft is deleted (else finalized then voided), an open one voided. */
export async function voidRentInvoice(stripe: Stripe, invoice: { id: string; status: string | null }): Promise<boolean> {
  try {
    if (invoice.status === "draft") {
      try {
        await stripe.invoices.del(invoice.id);
      } catch {
        await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
        await stripe.invoices.voidInvoice(invoice.id);
      }
      return true;
    }
    if (invoice.status === "open") {
      await stripe.invoices.voidInvoice(invoice.id);
      return true;
    }
    return false; // paid / void / uncollectible: nothing to void
  } catch (err) {
    logServerError("rent.autopay.voidInvoice", err);
    return false;
  }
}

/** Void the subscription's draft or open invoices that bill `period` (a month the owner recorded as paid outside). */
export async function voidSubscriptionInvoicesForPeriod(
  stripe: Stripe,
  subscriptionId: string,
  period: string,
): Promise<{ ok: boolean; voided: number }> {
  try {
    const list = await stripe.invoices.list({ subscription: subscriptionId, limit: 6 });
    let voided = 0;
    for (const inv of list.data) {
      const start = inv.lines?.data?.[0]?.period?.start ?? inv.period_start;
      if (periodOfSeconds(start) !== period) continue;
      if (await voidRentInvoice(stripe, { id: inv.id as string, status: inv.status })) voided += 1;
    }
    return { ok: true, voided };
  } catch (err) {
    logServerError("rent.autopay.voidForPeriod", err);
    return { ok: false, voided: 0 };
  }
}

/**
 * A monthly renewal draft: if the owner recorded this month as paid outside, void it instead of charging;
 * otherwise add the closed month's percentage (TUL-1609).
 */
export async function handleRentDraft(admin: SupabaseClient, stripe: Stripe, ev: Extract<RentSubscriptionEvent, { type: "draft" }>): Promise<PercentDraftOutcome | "voided"> {
  try {
    const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", ev.tenantId).select("autopay_skip_periods, stripe_subscription_id").eq("id", ev.planId).maybeSingle();
    // An unreadable plan must not fall through to billing a month the owner may have recorded as paid outside.
    if (error) {
      logServerError("rent.autopay.handleDraft.read", error);
      return "retry";
    }
    const plan = data as { autopay_skip_periods: string[] | null; stripe_subscription_id: string | null } | null;
    if (plan?.stripe_subscription_id === ev.subscriptionId && shouldSkipAutopayInvoice(plan.autopay_skip_periods ?? [], periodOfSeconds(ev.periodStart))) {
      return (await voidRentInvoice(stripe, { id: ev.invoiceId, status: "draft" })) ? "voided" : "retry";
    }
  } catch (err) {
    logServerError("rent.autopay.handleDraft", err);
    return "retry";
  }
  return addPercentToDraft(admin, stripe, ev);
}

/** Void this month's collectable subscription invoices on the subscription's own platform (TUL-1646). */
export async function voidAutopayMonth(p: { subscriptionId: string; platform: StripeAccountKey | null; period: string }): Promise<boolean> {
  const stripe = getStripeFor(p.platform === "mx" ? "mx" : "us");
  if (!stripe) return false;
  return (await voidSubscriptionInvoicesForPeriod(stripe, p.subscriptionId, p.period)).ok;
}
