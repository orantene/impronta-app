/**
 * Stripe Checkout integration for client-paid invoices.
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

import Stripe from "stripe";
import { logServerError } from "@/lib/server/safe-error";

let cached: Stripe | null = null;

/**
 * Return a Stripe instance when STRIPE_SECRET_KEY is configured. When
 * not configured (local dev / preview), returns null so callers can
 * gracefully degrade to a mock-URL flow.
 */
export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  return cached;
}

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
   * Stripe Connect account id (`acct_*`) to route this charge to. When set,
   * the charge becomes a Direct Charge on the connected account; the
   * platform receives `applicationFeeCents` as its cut. When omitted, the
   * charge runs as single-account on the platform's Stripe account
   * (legacy / fallback path).
   */
  connectedAccountId?: string | null;
  /**
   * Platform application fee, in cents. Only meaningful when
   * `connectedAccountId` is set. Defaults to 0 (no platform cut).
   */
  applicationFeeCents?: number;
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
 */
export async function createCheckoutSessionForTransaction(
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  try {
    const stripe = getStripe();
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

    const useConnect = !!input.connectedAccountId;
    const applicationFee = Math.max(0, Math.floor(input.applicationFeeCents ?? 0));

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
      client_reference_id: input.transactionId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        transaction_id: input.transactionId,
        inquiry_id: input.inquiryId,
        booking_id: input.bookingId,
      },
    };

    // Connect: Direct Charge on the connected account, platform takes
    // `application_fee_amount`. Application fee can only be set when the
    // charge is on a Connect account, hence the conditional.
    if (useConnect && applicationFee > 0) {
      sessionParams.payment_intent_data = {
        application_fee_amount: applicationFee,
      };
    }

    const session = useConnect
      ? await stripe.checkout.sessions.create(sessionParams, {
          stripeAccount: input.connectedAccountId!,
        })
      : await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return { ok: false, error: "Stripe returned no checkout URL." };
    }

    return { ok: true, url: session.url, sessionId: session.id };
  } catch (err) {
    logServerError("payments.stripe.createCheckoutSessionForTransaction", err);
    return { ok: false, error: "Failed to create payment session." };
  }
}
