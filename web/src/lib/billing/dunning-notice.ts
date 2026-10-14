/**
 * lib/billing/dunning-notice.ts (TUL-835)
 *
 * First-failure "your payment didn't go through" email, idempotent per Stripe
 * invoice id. Webhook replays and Smart Retry attempts on the same invoice
 * claim the same ledger row, so exactly one email goes out. Deps are injected
 * so the decision is unit-testable without Supabase or Resend.
 */
import type Stripe from "stripe";
import { DUNNING_GRACE_DAYS } from "./dunning-grace";
import { paymentFailedSubject, renderPaymentFailedEmail } from "@/lib/email/payment-failed";

export type DunningNoticeDeps = {
  /** Insert-if-absent. true = we own this invoice's notice now. */
  claim(row: { invoiceId: string; scope: "talent" | "workspace"; subscriptionId: string | null; to: string }): Promise<boolean>;
  release(invoiceId: string): Promise<void>;
  send(input: { to: string; subject: string; html: string }): Promise<"sent" | "skipped" | "failed">;
};

export type DunningNoticeResult = "sent" | "duplicate" | "no_recipient" | "skipped" | "failed";

function localeOf(invoice: Stripe.Invoice): "es" | "en" {
  // stripe@22 types dropped Invoice.customer_preferred_locales, but webhook
  // payloads on older API versions still carry it; fall back to an expanded
  // customer's preferred_locales.
  const legacy = (invoice as Stripe.Invoice & { customer_preferred_locales?: string[] | null })
    .customer_preferred_locales;
  const customer = invoice.customer;
  const expanded =
    customer && typeof customer === "object" && !("deleted" in customer && customer.deleted)
      ? (customer as Stripe.Customer).preferred_locales
      : null;
  const locales = legacy?.length ? legacy : expanded;
  const first = locales?.[0] ?? "";
  return first.toLowerCase().startsWith("es") ? "es" : "en";
}

export async function sendPaymentFailedNotice(
  input: {
    invoice: Stripe.Invoice;
    scope: "talent" | "workspace";
    subscriptionId: string | null;
    fallbackActionUrl: string;
  },
  deps: DunningNoticeDeps,
): Promise<DunningNoticeResult> {
  const { invoice } = input;
  const to = invoice.customer_email?.trim();
  if (!invoice.id || !to) return "no_recipient";

  const owned = await deps.claim({
    invoiceId: invoice.id,
    scope: input.scope,
    subscriptionId: input.subscriptionId,
    to,
  });
  if (!owned) return "duplicate";

  const locale = localeOf(invoice);
  const result = await deps.send({
    to,
    subject: paymentFailedSubject(locale),
    html: renderPaymentFailedEmail({
      locale,
      actionUrl: invoice.hosted_invoice_url ?? input.fallbackActionUrl,
      graceDays: DUNNING_GRACE_DAYS,
    }),
  });
  if (result === "failed") {
    // Give the claim back so Stripe's webhook retry can try the send again.
    await deps.release(invoice.id);
    return "failed";
  }
  return result;
}
