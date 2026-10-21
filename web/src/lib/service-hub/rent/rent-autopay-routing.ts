/**
 * TUL-1601 · Recognise the Stripe events of a rent subscription (pure). A rent subscription carries
 * `checkout_type: "rent_subscription"` and `rent_plan_id` in its metadata (session and subscription); its invoices
 * carry the subscription's metadata under `parent.subscription_details.metadata`. Anything else returns null and
 * the existing plan-subscription routing handles it unchanged.
 */
import type Stripe from "stripe";

export type RentSubscriptionEvent =
  | { type: "started"; planId: string; tenantId: string; subscriptionId: string; customerId: string | null }
  | { type: "status"; planId: string; tenantId: string; subscriptionId: string; stripeStatus: string; paused: boolean; deleted: boolean }
  | { type: "paid"; planId: string; tenantId: string; subscriptionId: string; invoiceId: string; periodStart: number; amountPaid: number; currency: string; rentCents: number }
  | { type: "failed"; planId: string; tenantId: string; subscriptionId: string; invoiceId: string; periodStart: number; attempt: number; currency: string; rentCents: number };

function rentMeta(md: Stripe.Metadata | null | undefined): { planId: string; tenantId: string; rentCents: number } | null {
  if (!md || md.checkout_type !== "rent_subscription") return null;
  const planId = md.rent_plan_id;
  const tenantId = md.tenant_id;
  const rentCents = Number(md.rent_cents);
  if (!planId || !tenantId || !Number.isInteger(rentCents) || rentCents <= 0) return null;
  return { planId, tenantId, rentCents };
}

const id = (ref: string | { id?: string } | null | undefined): string | null => (!ref ? null : typeof ref === "string" ? ref : ref.id ?? null);

/** The invoice's billed period start (the first line's period), else the invoice's own period start. */
function periodStartOf(inv: Stripe.Invoice): number {
  const fromLine = inv.lines?.data?.[0]?.period?.start;
  return typeof fromLine === "number" ? fromLine : inv.period_start;
}

export function classifyRentSubscriptionEvent(event: Stripe.Event): RentSubscriptionEvent | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const m = rentMeta(s.metadata);
      const subscriptionId = id(s.subscription as string | Stripe.Subscription | null);
      if (!m || s.mode !== "subscription" || !subscriptionId) return null;
      return { type: "started", planId: m.planId, tenantId: m.tenantId, subscriptionId, customerId: id(s.customer as string | null) };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const m = rentMeta(sub.metadata);
      if (!m) return null;
      return {
        type: "status",
        planId: m.planId,
        tenantId: m.tenantId,
        subscriptionId: sub.id,
        stripeStatus: sub.status,
        paused: Boolean(sub.pause_collection),
        deleted: event.type === "customer.subscription.deleted",
      };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const details = inv.parent?.subscription_details;
      const m = rentMeta(details?.metadata ?? null);
      const subscriptionId = id(details?.subscription as string | Stripe.Subscription | null | undefined);
      if (!m || !subscriptionId || !inv.id) return null;
      if (event.type === "invoice.paid") {
        // A 0-amount invoice (the anchor invoice at sign-up) is not a rent payment.
        if ((inv.amount_paid ?? 0) <= 0) return null;
        return { type: "paid", planId: m.planId, tenantId: m.tenantId, subscriptionId, invoiceId: inv.id, periodStart: periodStartOf(inv), amountPaid: inv.amount_paid, currency: inv.currency, rentCents: m.rentCents };
      }
      return { type: "failed", planId: m.planId, tenantId: m.tenantId, subscriptionId, invoiceId: inv.id, periodStart: periodStartOf(inv), attempt: inv.attempt_count ?? 1, currency: inv.currency ?? "", rentCents: m.rentCents };
    }
    default:
      return null;
  }
}

/** UTC month "YYYY-MM" of a unix-seconds timestamp: the rent period an invoice pays for. */
export function periodOfSeconds(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Plan autopay status from a subscription's Stripe status. */
export function autopayStatusOf(e: { stripeStatus: string; paused: boolean; deleted: boolean }): "active" | "paused" | "past_due" | "canceled" | "pending" {
  if (e.deleted || e.stripeStatus === "canceled" || e.stripeStatus === "incomplete_expired") return "canceled";
  if (e.paused) return "paused";
  if (e.stripeStatus === "past_due" || e.stripeStatus === "unpaid") return "past_due";
  if (e.stripeStatus === "incomplete") return "pending";
  return "active";
}
