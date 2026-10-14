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
  subscription: { status: string; nextChargeAt: string | null; cancelAtPeriodEnd: boolean } | null;
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
      const { data } = await sb
        .from("provider_invoices")
        .select("stripe_invoice_id,invoice_number,stripe_created_at,total_cents,currency,status,invoice_pdf_url,hosted_invoice_url")
        .eq("talent_profile_id", talentProfile.id)
        .order("stripe_created_at", { ascending: false })
        .limit(24);
      invoices = (data ?? [])
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
        const { data: cust } = await sb
          .from("talent_stripe_customers")
          .select("stripe_customer_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        const stripe = getStripe();
        if (stripe && cust?.stripe_customer_id) {
          const c = await stripe.customers.retrieve(cust.stripe_customer_id, {
            expand: ["invoice_settings.default_payment_method"],
          });
          if (!c.deleted) {
            const pm = c.invoice_settings?.default_payment_method;
            if (pm && typeof pm !== "string" && pm.card) {
              card = { brand: pm.card.brand, last4: pm.card.last4 };
            }
          }
        }
      } catch (err) {
        logServerError("talent-billing-summary.card", err);
      }
    }
  }

  return {
    ok: true,
    summary: {
      planLabel: isKnownPlan(planKey) ? getPlan(planKey).displayName : planKey,
      subscription: live
        ? { status: sub!.status, nextChargeAt: sub!.currentPeriodEnd, cancelAtPeriodEnd: sub!.cancelAtPeriodEnd }
        : null,
      card,
      invoices,
    },
  };
}
