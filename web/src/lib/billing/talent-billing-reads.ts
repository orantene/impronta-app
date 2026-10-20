/**
 * lib/billing/talent-billing-reads.ts (TUL-834)
 *
 * Talent-owned billing reads for the Talent > Settings summary. Callers pass
 * ids from requireTalentSelf() (never from the client); rows are owned by the
 * talent profile / user, not by an agency tenant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderInvoiceRow = {
  stripe_invoice_id: string;
  invoice_number: string | null;
  stripe_created_at: string;
  total_cents: number;
  currency: string;
  status: string | null;
  invoice_pdf_url: string | null;
  hosted_invoice_url: string | null;
  attempt_count: number | null;
  next_payment_attempt: string | null;
};

/** Latest 24 invoices for a talent profile from our provider_invoices register. */
export async function loadTalentProviderInvoices(
  sb: SupabaseClient,
  talentProfileId: string,
): Promise<ProviderInvoiceRow[]> {
  const { data, error } = await sb
    .from("provider_invoices")
    .select("stripe_invoice_id,invoice_number,stripe_created_at,total_cents,currency,status,invoice_pdf_url,hosted_invoice_url,attempt_count,next_payment_attempt")
    .eq("talent_profile_id", talentProfileId)
    .order("stripe_created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []) as ProviderInvoiceRow[];
}

/** The user's Stripe customer id, or null. */
export async function loadTalentStripeCustomerId(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await sb
    .from("talent_stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
}

/** The talent profile's Stripe subscription id, or null (TUL-835 card lookup). */
export async function loadTalentStripeSubscriptionId(
  sb: SupabaseClient,
  talentProfileId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("talent_subscriptions")
    .select("stripe_subscription_id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) throw error;
  return (data as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id ?? null;
}
