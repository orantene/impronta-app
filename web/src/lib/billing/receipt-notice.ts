/**
 * lib/billing/receipt-notice.ts (TUL-1232)
 *
 * Receipt email after every SUCCESSFUL automatic subscription charge, talent
 * and workspace plans alike. Idempotent on the Stripe invoice id through the
 * billing_notice_ledger (kind "receipt"), so a replayed webhook, or both
 * invoice.payment_succeeded and a retry attempt, send exactly one email.
 * Fail closed: an invoice that is not paid, or that charged nothing (trial
 * start, 100% promo), never gets a receipt. Money is display only.
 * Pure: no Stripe, Supabase or Resend imports.
 */
import type Stripe from "stripe";
import { paymentReceiptSubject, renderPaymentReceiptEmail } from "@/lib/email/payment-receipt";

export type ReceiptNoticeDeps = {
  /** Insert-if-absent. true = we own this invoice's receipt now. */
  claim(row: { key: string; scope: "talent" | "workspace"; subscriptionId: string | null; to: string }): Promise<boolean>;
  release(key: string): Promise<void>;
  send(input: { to: string; subject: string; html: string }): Promise<"sent" | "skipped" | "failed">;
  /** Recipient's app language, or null when unknown. Optional. */
  recipientLocale?(query: { scope: "talent" | "workspace"; subscriptionId: string | null }): Promise<string | null>;
};

export type ReceiptNoticeResult = "sent" | "duplicate" | "no_recipient" | "not_charged" | "no_currency" | "skipped" | "failed";

export function receiptNoticeKey(invoiceId: string): string {
  return `receipt:${invoiceId}`;
}

function normalizeLocale(value: string | null | undefined): "es" | "en" | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  return v.startsWith("es") ? "es" : "en";
}

function stripeLocaleOf(invoice: Stripe.Invoice): "es" | "en" | null {
  const legacy = (invoice as Stripe.Invoice & { customer_preferred_locales?: string[] | null })
    .customer_preferred_locales;
  const customer = invoice.customer;
  const expanded =
    customer && typeof customer === "object" && !("deleted" in customer && customer.deleted)
      ? (customer as Stripe.Customer).preferred_locales
      : null;
  const locales = legacy?.length ? legacy : expanded;
  return normalizeLocale(locales?.[0]);
}

export async function sendPaymentReceiptNotice(
  input: {
    invoice: Stripe.Invoice;
    scope: "talent" | "workspace";
    subscriptionId: string | null;
  },
  deps: ReceiptNoticeDeps,
): Promise<ReceiptNoticeResult> {
  const { invoice } = input;
  if (!invoice.id) return "not_charged";
  if (invoice.status !== "paid" || (invoice.amount_paid ?? 0) <= 0) return "not_charged";
  // Fail closed: a receipt never guesses the currency of a charge.
  const currency = invoice.currency?.trim();
  if (!currency) return "no_currency";
  const to = invoice.customer_email?.trim();
  if (!to) return "no_recipient";

  const key = receiptNoticeKey(invoice.id);
  const owned = await deps.claim({ key, scope: input.scope, subscriptionId: input.subscriptionId, to });
  if (!owned) return "duplicate";

  let app: "es" | "en" | null = null;
  if (deps.recipientLocale) {
    try {
      app = normalizeLocale(await deps.recipientLocale({ scope: input.scope, subscriptionId: input.subscriptionId }));
    } catch {
      app = null;
    }
  }
  const locale = app ?? stripeLocaleOf(invoice) ?? "en";

  const viewUrl = invoice.hosted_invoice_url;
  if (!viewUrl) {
    // Nothing honest to link to; give the claim back rather than send a dead button.
    await deps.release(key);
    return "skipped";
  }
  const result = await deps.send({
    to,
    subject: paymentReceiptSubject(locale),
    html: renderPaymentReceiptEmail({
      locale,
      amountCents: invoice.amount_paid,
      currency,
      invoiceNumber: invoice.number ?? null,
      viewUrl,
      pdfUrl: invoice.invoice_pdf ?? null,
    }),
  });
  if (result === "failed") {
    await deps.release(key);
    return "failed";
  }
  if (result === "skipped") {
    // Email is not configured: nothing was sent, so give the claim back and a
    // later replay (once email is on) can still deliver this receipt.
    await deps.release(key);
    return "skipped";
  }
  return result;
}
