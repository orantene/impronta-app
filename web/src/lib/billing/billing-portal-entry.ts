/**
 * billing-portal-entry.ts — which Stripe Customer Portal button, if any, the
 * Settings > Billing card shows (TUL-834).
 *
 * Before this, the portal button only appeared for a LIVE subscription. Someone
 * who cancelled (talent or workspace) lost the only way to download the
 * invoices they already paid. The portal works for any Stripe customer, so a
 * past subscriber now gets an "Invoices and receipts" entry instead of nothing.
 */

export type BillingPortalEntry = "manage" | "invoices" | null;

const ENDED = new Set(["canceled", "cancelled", "incomplete_expired"]);

export function billingPortalEntry(
  subscription: { status: string | null } | null | undefined,
): BillingPortalEntry {
  if (!subscription) return null;
  return ENDED.has(subscription.status ?? "") ? "invoices" : "manage";
}
