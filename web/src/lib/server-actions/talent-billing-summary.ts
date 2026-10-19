"use server";

// TUL-834 · read-only billing summary for Talent > Settings: current plan, next
// charge, card on file (brand + last4) and the invoice list. Self-scoped via
// requireTalentSelf(); no id comes from the client. Invoices are read from our
// own `provider_invoices` register (written by the webhook), the card is one
// Stripe customer read. Failures degrade to null/empty, never throw.

import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { loadTalentSubscriptionState } from "@/lib/stripe/talent-billing";
import { getPlan, isKnownPlan } from "@/lib/access/plan-catalog";
import {
  loadTalentProviderInvoices,
  loadTalentStripeCustomerId,
  loadTalentStripeSubscriptionId,
} from "@/lib/billing/talent-billing-reads";
import { pickDefaultCard } from "@/lib/billing/talent-billing-display";

export type TalentBillingInvoice = {
  id: string;
  number: string | null;
  date: string;
  amountCents: number;
  currency: string;
  status: string | null;
  pdfUrl: string | null;
  hostedUrl: string | null;
};

export type TalentBillingSummary = {
  planLabel: string;
  /** Raw plan key, so the panel can print the dashboard's own plan name (TUL-835). */
  planKey: string;
  subscription: {
    status: string;
    nextChargeAt: string | null;
    cancelAtPeriodEnd: boolean;
    /** When it first went past_due (starts the grace window). */
    pastDueSince: string | null;
  } | null;
  card: { brand: string; last4: string } | null;
  invoices: TalentBillingInvoice[];
};

export type TalentBillingSummaryResult =
  | { ok: true; summary: TalentBillingSummary }
  | { ok: false; error: string };

export async function loadTalentBillingSummary(): Promise<TalentBillingSummaryResult> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return { ok: false, error: scope.error };
  const { talentProfile, planKey, session } = scope;

  const sub = await loadTalentSubscriptionState(talentProfile.id, session.supabase);
  const live = !!sub && sub.status !== "cancelled" && sub.status !== "incomplete_expired";

  let invoices: TalentBillingInvoice[] = [];
  let card: TalentBillingSummary["card"] = null;
  const sb = createServiceRoleClient();
  if (sb) {
    try {
      const data = await loadTalentProviderInvoices(sb, talentProfile.id);
      invoices = data
        .filter((r) => r.status !== "draft")
        .map((r) => ({
          id: r.stripe_invoice_id,
          number: r.invoice_number,
          date: r.stripe_created_at,
          amountCents: r.total_cents,
          currency: r.currency,
          status: r.status,
          pdfUrl: r.invoice_pdf_url,
          hostedUrl: r.hosted_invoice_url,
        }));
    } catch (err) {
      logServerError("talent-billing-summary.invoices", err);
    }

    if (live && isStripeConfigured()) {
      try {
        // TUL-835: Stripe keeps the default card on the subscription for a
        // Checkout subscription, on the customer's invoice settings, or as a
        // legacy default source. Read all three (display only, no writes).
        const stripe = getStripe();
        const [customerId, subscriptionId] = await Promise.all([
          loadTalentStripeCustomerId(sb, session.user.id),
          loadTalentStripeSubscriptionId(sb, talentProfile.id),
        ]);
        let subscriptionDefaultPaymentMethod: unknown = null;
        if (stripe && subscriptionId) {
          // A failed subscription read must not hide the customer's card.
          subscriptionDefaultPaymentMethod = await stripe.subscriptions
            .retrieve(subscriptionId, { expand: ["default_payment_method"] })
            .then((s) => s.default_payment_method)
            .catch((err: unknown) => {
              logServerError("talent-billing-summary.card.subscription", err);
              return null;
            });
        }
        let customerInvoiceDefaultPaymentMethod: unknown = null;
        let customerDefaultSource: unknown = null;
        if (stripe && customerId) {
          const c = await stripe.customers.retrieve(customerId, {
            expand: ["invoice_settings.default_payment_method", "default_source"],
          });
          if (!c.deleted) {
            customerInvoiceDefaultPaymentMethod = c.invoice_settings?.default_payment_method ?? null;
            customerDefaultSource = c.default_source ?? null;
          }
        }
        card = pickDefaultCard({
          subscriptionDefaultPaymentMethod,
          customerInvoiceDefaultPaymentMethod,
          customerDefaultSource,
        });
      } catch (err) {
        logServerError("talent-billing-summary.card", err);
      }
    }
  }

  return {
    ok: true,
    summary: {
      planLabel: isKnownPlan(planKey) ? getPlan(planKey).displayName : planKey,
      planKey,
      subscription: live
        ? {
            status: sub!.status,
            nextChargeAt: sub!.currentPeriodEnd,
            cancelAtPeriodEnd: sub!.cancelAtPeriodEnd,
            pastDueSince: sub!.pastDueSince ?? null,
          }
        : null,
      card,
      invoices,
    },
  };
}

