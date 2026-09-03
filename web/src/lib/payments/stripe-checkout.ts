/**
 * Stripe Checkout integration for client-paid invoices.
 *
 * THE CHARGE ALWAYS LANDS ON THE PLATFORM ACCOUNT. This module used to branch:
 * when a workspace had finished Connect onboarding it created the session with
 * `{ stripeAccount }` — a Direct Charge on the workspace's own account, with
 * the platform taking `application_fee_amount`. That branch was removed
 * (finance audit, 2026-09-01) for two independent reasons:
 *
 *   1. Stripe refuses it. Our connected accounts are onboarded under the
 *      `recipient` service agreement, and per Stripe's "Service agreement
 *      types" docs those accounts "can't process payments or request the
 *      card_payments capability". Their capability set is `{transfers}` and
 *      nothing else. (`charges_enabled: true` on such an account is a legacy
 *      aggregate field and does NOT mean it can take a card — it was misread
 *      that way once already.)
 *   2. It contradicts the commission model. `markPaid` fans out to talent and
 *      workspace from the PLATFORM balance, which is what lets the talent be
 *      paid their full quote with the platform's seller share coming out of
 *      the workspace margin. A Direct Charge leaves the gross on the
 *      workspace's account, so the fan-out would pay out money the platform
 *      never received. `application_fee_amount` cannot express a three-way
 *      split.
 *
 * The money model is therefore ONE model everywhere: collect the full
 * `gross_charged` on the platform, then transfer out (`separate charges and
 * transfers`). The embedded Payment Element path
 * (`stripe-payment-intent.ts`) already worked this way; this module now
 * matches it. Do not reintroduce a connected-account branch here.
 *
 * Two pieces:
 *   1. `createCheckoutSessionForTransaction` — server-side helper that
 *      builds a one-shot Checkout session for a `booking_transactions`
 *      row. Returns the hosted URL the client should redirect to.
 *   2. The webhook handler at `web/src/app/api/webhooks/stripe/route.ts`
 *      consumes the resulting `checkout.session.completed` event and
 *      flips the transaction to `paid`.
 *
 * Configuration (env, both required for production use; degrades to a
 * mock URL when missing so the prototype still demos):
 *   STRIPE_SECRET_KEY        — Stripe SK
 *   STRIPE_WEBHOOK_SECRET    — endpoint secret for signature verification
 *   NEXT_PUBLIC_BASE_URL     — base URL for success/cancel redirects
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import { stripeCheckoutLocale } from "@/lib/i18n/vendor-locale";

/**
 * Re-export the ONE canonical Stripe singleton (server-only, defined in
 * `lib/stripe/client`). This module used to construct its OWN `new Stripe(...)`
 * — a second singleton with no `server-only` guard and an independently-pinned
 * API version that could drift from the rest of the billing code. Collapsing to
 * the shared client removes that divergence while keeping the public surface
 * (`getStripe`, `createCheckoutSessionForTransaction`) unchanged: it still
 * returns `null` when STRIPE_SECRET_KEY is unset, so the mock-URL degrade path
 * below is untouched.
 */
export { getStripe };

export type CheckoutSessionInput = {
  transactionId: string;
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  inquiryId: string;
  bookingId: string;
  successUrl: string;
  cancelUrl: string;
  description?: string;
  /**
   * The paying client's resolved app locale (`getRequestLocale()`), threaded
   * from the calling server action. Stripe otherwise reads the BROWSER
   * language, so a Spanish-speaking client on an English browser pays an
   * invoice through an English form. Absent / unmappable → the parameter is
   * omitted and Stripe keeps its own default.
   */
  locale?: string | null;
};

export type CheckoutSessionResult =
  | { ok: true; url: string; sessionId: string; mock?: boolean }
  | { ok: false; error: string };

/**
 * Create a Stripe Checkout Session in payment mode for a single line
 * item that totals `amountCents`. The transaction id is encoded in
 * `client_reference_id` so the webhook can find the correct
 * `booking_transactions` row to mark paid.
 *
 * When STRIPE_SECRET_KEY is missing, returns a mock URL pointing back
 * to the success page so the prototype demo still works end-to-end.
 *
 * `deps.stripe` exists only so the idempotency contract below can be asserted
 * without a network call, mirroring `disburse`'s injected client. Production
 * callers pass nothing and get the shared singleton.
 */
export async function createCheckoutSessionForTransaction(
  input: CheckoutSessionInput,
  deps: { stripe?: Stripe | null } = {},
): Promise<CheckoutSessionResult> {
  try {
    const stripe = deps.stripe !== undefined ? deps.stripe : getStripe();
    if (!stripe) {
      // Mock mode: skip Stripe entirely. The "session id" is synthetic so
      // the calling action can still echo something back. Webhook delivery
      // won't fire, so the transaction stays in payment_requested unless
      // the admin manually marks it paid.
      return {
        ok: true,
        url: `${input.successUrl}?mock=1&tx=${encodeURIComponent(input.transactionId)}`,
        sessionId: `mock_${input.transactionId}`,
        mock: true,
      };
    }

    if (input.amountCents <= 0) {
      return { ok: false, error: "Amount must be positive." };
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountCents,
            product_data: {
              name: input.description ?? "Booking invoice",
            },
          },
        },
      ],
      customer_email: input.payerEmail ?? undefined,
      // Pay in the language the client is already reading the app in.
      locale: stripeCheckoutLocale(input.locale),
      client_reference_id: input.transactionId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        transaction_id: input.transactionId,
        inquiry_id: input.inquiryId,
        booking_id: input.bookingId,
      },
    };

    // Always the PLATFORM account. See the module header for why the
    // connected-account (Direct Charge) branch was removed.
    //
    // Idempotent at the booking-transaction grain, mirroring the embedded
    // Payment Element lane (`stripe-payment-intent.ts`, key `pi_txn_<id>`).
    // Without a key, a double-tapped Pay button or a retried server action
    // mints TWO Checkout sessions against one `booking_transactions` row, and
    // a client who opens both can be charged twice for one invoice. The
    // transaction id is the right grain: a deposit and its balance are
    // separate rows with separate ids, so they never collide, and a genuine
    // resume of an abandoned checkout correctly returns the same session.
    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey: `cs_txn_${input.transactionId}`,
    });

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }

    return { ok: true, url: session.url, sessionId: session.id };
  } catch (err) {
    logServerError("payments.stripe.createCheckoutSessionForTransaction", err);
    return { ok: false, error: "Failed to create payment session." };
  }
}
