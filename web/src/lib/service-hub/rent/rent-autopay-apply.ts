/**
 * TUL-1601 · What a rent-subscription webhook event does (deps-injected, no I/O here). Idempotent per Stripe id:
 * a replayed event changes nothing. The plan must name THIS subscription; an event for any other subscription is
 * ignored, and a second subscription for the same plan is cancelled so a member is never charged twice.
 */
import { autopayStatusOf, periodOfSeconds, type RentSubscriptionEvent } from "./rent-autopay-routing";

export type AutopayPlanRow = { status: string; autopayStatus: string; subscriptionId: string | null; talentProfileId: string };
export type AutopayInvoiceRow = { status: string; stripeInvoiceId: string | null; source: string };

export type RentAutopayApplyDeps = {
  loadPlan(planId: string, tenantId: string): Promise<AutopayPlanRow | null>;
  setAutopay(planId: string, tenantId: string, patch: { autopayStatus: string; subscriptionId?: string | null; clearFirstPeriod?: boolean }): Promise<boolean>;
  loadInvoice(planId: string, tenantId: string, period: string): Promise<AutopayInvoiceRow | null>;
  /** Insert-or-update the (plan, period) row as an automatic payment. */
  writeInvoice(row: { planId: string; tenantId: string; talentProfileId: string; period: string; amountCents: number; currency: string; status: "paid" | "failed"; stripeInvoiceId: string }): Promise<boolean>;
  cancelSubscription(subscriptionId: string): Promise<boolean>;
  notify(kind: "autopay_failed" | "autopay_canceled", p: { planId: string; tenantId: string; talentProfileId: string; period?: string }): Promise<void>;
  alert(detail: string): void;
};

export type ApplyOutcome =
  | "linked"
  | "status_set"
  | "paid_recorded"
  | "failed_recorded"
  | "duplicate"
  | "ignored_other_subscription"
  | "cancelled_second_subscription"
  | "double_payment_alert"
  | "plan_not_found"
  | "unavailable";

export async function applyRentSubscriptionEvent(ev: Exclude<RentSubscriptionEvent, { type: "draft" }>, deps: RentAutopayApplyDeps): Promise<ApplyOutcome> {
  const plan = await deps.loadPlan(ev.planId, ev.tenantId);
  if (!plan) return "plan_not_found";

  if (ev.type === "expired") {
    // Only a plan that never got a subscription goes back to off; a live one is never touched by a stale session.
    if (plan.subscriptionId || plan.autopayStatus !== "pending") return "duplicate";
    return (await deps.setAutopay(ev.planId, ev.tenantId, { autopayStatus: "off", clearFirstPeriod: true })) ? "status_set" : "unavailable";
  }

  if (ev.type === "started") {
    if (plan.subscriptionId === ev.subscriptionId) return "duplicate";
    const live = plan.subscriptionId && plan.autopayStatus !== "canceled" && plan.autopayStatus !== "off";
    if (live || plan.status !== "active") {
      // Never two live subscriptions (or one on a plan that is no longer active): cancel the newcomer. A cancel that
      // fails is retried, never acked: the stray subscription would keep charging.
      if (!(await deps.cancelSubscription(ev.subscriptionId))) {
        deps.alert(`rent plan ${ev.planId}: could not cancel stray subscription ${ev.subscriptionId}`);
        return "unavailable";
      }
      return "cancelled_second_subscription";
    }
    return (await deps.setAutopay(ev.planId, ev.tenantId, { autopayStatus: "active", subscriptionId: ev.subscriptionId })) ? "linked" : "unavailable";
  }

  if (plan.subscriptionId !== ev.subscriptionId) {
    // The plan is not linked to any subscription yet: the 'started' event may simply not have been applied. A PAID
    // invoice is retried (and shouted about) until it links; failed or status events from a stranger are ignored.
    if (!plan.subscriptionId) {
      if (ev.type !== "paid") return "ignored_other_subscription";
      deps.alert(`rent plan ${ev.planId}: invoice ${ev.invoiceId} was PAID by subscription ${ev.subscriptionId} before the plan was linked`);
      return "unavailable";
    }
    if (ev.type === "paid") {
      // Money was taken by a rent subscription this plan does not know: shout, stop it, retry until it is stopped.
      deps.alert(`rent plan ${ev.planId}: invoice ${ev.invoiceId} was PAID by unlinked subscription ${ev.subscriptionId}`);
      if (!(await deps.cancelSubscription(ev.subscriptionId))) return "unavailable";
    }
    return "ignored_other_subscription";
  }

  if (ev.type === "status") {
    const next = autopayStatusOf(ev);
    if (next === plan.autopayStatus) return "duplicate";
    if (!(await deps.setAutopay(ev.planId, ev.tenantId, { autopayStatus: next }))) return "unavailable";
    if (next === "canceled") await deps.notify("autopay_canceled", { planId: ev.planId, tenantId: ev.tenantId, talentProfileId: plan.talentProfileId });
    return "status_set";
  }

  const period = periodOfSeconds(ev.periodStart);
  const existing = await deps.loadInvoice(ev.planId, ev.tenantId, period);
  if (existing?.stripeInvoiceId === ev.invoiceId && (existing.status === "paid" || ev.type === "failed")) return "duplicate";

  if (ev.type === "paid") {
    if (plan.status === "ended") {
      // Money was taken for a plan that has ended: shout, stop the subscription, and still record the month honestly.
      deps.alert(`rent plan ${ev.planId} is ended but subscription ${ev.subscriptionId} was paid (invoice ${ev.invoiceId})`);
      await deps.cancelSubscription(ev.subscriptionId);
    }
    if (existing && existing.source !== "autopay" && existing.stripeInvoiceId !== ev.invoiceId) {
      // A payment-link or outside row already owns this month (any status): never overwritten, never touched.
      deps.alert(`rent plan ${ev.planId} period ${period}: automatic invoice ${ev.invoiceId} paid but the month has a ${existing.source} row (${existing.status}); reconcile by hand`);
      return "double_payment_alert";
    }
    if (existing && existing.status === "paid" && existing.stripeInvoiceId !== ev.invoiceId) {
      // The month was already paid another way (a payment link): money taken twice. Loud, never silent.
      deps.alert(`rent plan ${ev.planId} period ${period}: automatic invoice ${ev.invoiceId} paid on top of an already paid month`);
      return "double_payment_alert";
    }
    const ok = await deps.writeInvoice({ planId: ev.planId, tenantId: ev.tenantId, talentProfileId: plan.talentProfileId, period, amountCents: ev.rentCents, currency: ev.currency.toUpperCase(), status: "paid", stripeInvoiceId: ev.invoiceId });
    if (!ok) return "unavailable";
    if (plan.autopayStatus === "past_due") await deps.setAutopay(ev.planId, ev.tenantId, { autopayStatus: "active" });
    return "paid_recorded";
  }

  // failed
  if (existing?.status === "paid") return "duplicate"; // a later retry succeeded first
  if (existing && existing.source !== "autopay") return "duplicate"; // never overwrite a link or outside row
  const ok = await deps.writeInvoice({ planId: ev.planId, tenantId: ev.tenantId, talentProfileId: plan.talentProfileId, period, amountCents: ev.rentCents, currency: ev.currency.toUpperCase(), status: "failed", stripeInvoiceId: ev.invoiceId });
  if (!ok) return "unavailable";
  await deps.notify("autopay_failed", { planId: ev.planId, tenantId: ev.tenantId, talentProfileId: plan.talentProfileId, period });
  return "failed_recorded";
}
