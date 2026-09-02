/**
 * lib/payments/provider-invoices.ts
 *
 * Persist Stripe invoices.
 *
 * WHY THIS EXISTS: invoices were only ever a TRIGGER. `invoice.payment_failed`
 * and `invoice.payment_succeeded` re-synced a subscription's status and were
 * then discarded; `invoice.paid`, `.finalized`, `.voided` and
 * `.marked_uncollectible` were neither handled nor subscribed. Nothing was
 * written down, which left no invoice register, no dunning history, and no
 * visibility of credit notes at all.
 *
 * ── ON TAX ───────────────────────────────────────────────────────────────────
 * This RECORDS tax, it does not CALCULATE it. Stripe Tax is not enabled on this
 * account and nothing anywhere computes tax, so `tax_cents` will be 0 on every
 * row written today. The field is populated from Stripe's `total_taxes` array
 * (an ARRAY in this API version, not a scalar — checked against the SDK rather
 * than assumed) so that the day tax is switched on, the record is already
 * capturing it. Issuing correct tax invoices remains blocked on a tax adviser
 * and the seller-of-record decision; recording what Stripe already did is not.
 *
 * Server-only.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type Stripe from "stripe";

function refIdOf(ref: unknown): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return (ref as { id?: string }).id ?? null;
}

function unixToIso(v: number | null | undefined): string | null {
  return v ? new Date(v * 1000).toISOString() : null;
}

/**
 * Sum Stripe's `total_taxes` array.
 *
 * Returns 0 when the array is null or empty, which is every invoice today.
 * Exported so the arithmetic is testable without a Stripe account.
 */
export function sumInvoiceTaxCents(invoice: Stripe.Invoice): number {
  const taxes = invoice.total_taxes;
  if (!Array.isArray(taxes) || taxes.length === 0) return 0;
  return taxes.reduce((sum, t) => sum + Number(t?.amount ?? 0), 0);
}

/**
 * Map a Stripe invoice onto our row shape. Pure and exported so the money
 * fields, the tax sum and the lifecycle timestamps can be asserted directly.
 */
export function mapInvoice(
  invoice: Stripe.Invoice,
  linkage: { tenantId: string | null; talentProfileId: string | null },
  event: { id: string; type: string },
): Record<string, unknown> {
  const transitions = invoice.status_transitions;
  return {
    provider: "stripe",
    stripe_invoice_id: invoice.id,
    invoice_number: invoice.number ?? null,
    stripe_customer_id: refIdOf(invoice.customer),
    stripe_subscription_id: refIdOf(invoice.parent?.subscription_details?.subscription),
    tenant_id: linkage.tenantId,
    talent_profile_id: linkage.talentProfileId,
    status: invoice.status ?? null,
    collection_method: invoice.collection_method ?? null,
    billing_reason: invoice.billing_reason ?? null,
    currency: (invoice.currency ?? "usd").toUpperCase(),
    subtotal_cents: invoice.subtotal ?? 0,
    tax_cents: sumInvoiceTaxCents(invoice),
    total_cents: invoice.total ?? 0,
    amount_paid_cents: invoice.amount_paid ?? 0,
    amount_due_cents: invoice.amount_due ?? 0,
    amount_remaining_cents: invoice.amount_remaining ?? 0,
    pre_payment_credit_notes_cents: invoice.pre_payment_credit_notes_amount ?? 0,
    post_payment_credit_notes_cents: invoice.post_payment_credit_notes_amount ?? 0,
    automatic_tax_enabled: !!invoice.automatic_tax?.enabled,
    automatic_tax_status: invoice.automatic_tax?.status ?? null,
    attempt_count: invoice.attempt_count ?? 0,
    next_payment_attempt: unixToIso(invoice.next_payment_attempt),
    period_start: unixToIso(invoice.period_start),
    period_end: unixToIso(invoice.period_end),
    stripe_created_at: unixToIso(invoice.created) ?? new Date().toISOString(),
    finalized_at: unixToIso(transitions?.finalized_at),
    paid_at: unixToIso(transitions?.paid_at),
    voided_at: unixToIso(transitions?.voided_at),
    marked_uncollectible_at: unixToIso(transitions?.marked_uncollectible_at),
    due_date: unixToIso(invoice.due_date),
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf_url: invoice.invoice_pdf ?? null,
    last_event_id: event.id,
    last_event_type: event.type,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Resolve which of our parties an invoice belongs to, via the subscription it
 * bills. Both null is the honest answer for an invoice we cannot place — a
 * one-off invoice, or one whose subscription predates metadata tagging.
 */
async function resolveInvoiceOwner(
  subscriptionId: string | null,
): Promise<{ tenantId: string | null; talentProfileId: string | null }> {
  const empty = { tenantId: null, talentProfileId: null };
  if (!subscriptionId) return empty;
  try {
    const sb = createServiceRoleClient();
    if (!sb) return empty;

    const { data: ws } = await sb
      .from("workspace_subscriptions")
      .select("tenant_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (ws) {
      return { tenantId: String((ws as { tenant_id: string }).tenant_id), talentProfileId: null };
    }

    const { data: ts } = await sb
      .from("talent_subscriptions")
      .select("talent_profile_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (ts) {
      return {
        tenantId: null,
        talentProfileId: String((ts as { talent_profile_id: string }).talent_profile_id),
      };
    }
  } catch (err) {
    logServerError("provider-invoices.resolveOwner", err);
  }
  return empty;
}

/**
 * Record (or update) one Stripe invoice.
 *
 * Upserted on `stripe_invoice_id` so the lifecycle — draft → open → paid |
 * void | uncollectible — converges on ONE row. Best-effort: a bookkeeping write
 * must never 5xx a webhook whose subscription-side work already succeeded.
 */
export async function recordProviderInvoice(input: {
  invoice: Stripe.Invoice;
  eventId: string;
  eventType: string;
}): Promise<void> {
  try {
    const sb = createServiceRoleClient();
    if (!sb) return;
    if (!input.invoice?.id) return;

    const subscriptionId = refIdOf(input.invoice.parent?.subscription_details?.subscription);
    const linkage = await resolveInvoiceOwner(subscriptionId);
    const row = mapInvoice(input.invoice, linkage, {
      id: input.eventId,
      type: input.eventType,
    });

    const { error } = await sb
      .from("provider_invoices")
      .upsert(row, { onConflict: "stripe_invoice_id" });
    if (error) logServerError("provider-invoices.upsert", error);
  } catch (err) {
    logServerError("provider-invoices.record", err);
  }
}
