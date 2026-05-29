/**
 * Embedded-checkout PaymentIntent creation (talent-protected money model).
 *
 * The client pays ON-PAGE via the Stripe Payment Element (a drawer in the
 * Messages Offer tab) — no hosted-Checkout redirect. We create a
 * PaymentIntent on the PLATFORM account for the full client charge
 * (gross_charged = service subtotal + client surcharge), collect it there,
 * and then fan the money out to talent + workspace via transfers (Phase 3,
 * "separate charges and transfers"). Collecting on the platform first is what
 * lets us pay the talent their FULL quote and deduct the platform's seller
 * share from the workspace margin — the split can't be expressed by a single
 * Direct Charge's application_fee.
 *
 * Reconciliation: metadata.transaction_id lets the `payment_intent.succeeded`
 * webhook find the booking_transactions row and mark it paid (the same row the
 * hosted flow keys off client_reference_id).
 *
 * Mock mode (no STRIPE_SECRET_KEY): returns a synthetic client secret + a
 * `mock` flag so the drawer can render a simulated confirm step and the
 * prototype still demos end-to-end without live keys.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";

export type PaymentIntentInput = {
  transactionId: string;
  /** What the client is charged, in cents = gross_charged (subtotal + surcharge). */
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  inquiryId: string;
  bookingId: string;
  description?: string;
  /**
   * Optional split breakdown, in cents, carried as PaymentIntent metadata so
   * the post-payment transfer step (Phase 3) and the confirmation PDF can read
   * the frozen lanes straight off the charge. All optional — the charge works
   * without them; they make downstream reconciliation self-describing.
   */
  breakdown?: {
    subtotalCents?: number;
    clientSurchargeCents?: number;
    platformFeeCents?: number;
    workspaceFeeCents?: number;
    talentNetCents?: number;
  };
};

export type PaymentIntentResult =
  | {
      ok: true;
      clientSecret: string;
      paymentIntentId: string;
      amountCents: number;
      currency: string;
      mock?: boolean;
    }
  | { ok: false; error: string };

/**
 * Create (or shape) a PaymentIntent for a booking transaction on the platform
 * account. `automatic_payment_methods` lets Stripe surface Apple Pay / Google
 * Pay / cards (and local methods like OXXO once enabled) in the Payment
 * Element without us hard-coding the list.
 */
export async function createPaymentIntentForTransaction(
  input: PaymentIntentInput,
): Promise<PaymentIntentResult> {
  try {
    if (input.amountCents <= 0) {
      return { ok: false, error: "Amount must be positive." };
    }

    const stripe = getStripe();
    if (!stripe) {
      // Mock mode — no live keys. Hand back a synthetic client secret the
      // drawer recognises (prefix `mock_pi_`) so it can simulate the confirm.
      return {
        ok: true,
        clientSecret: `mock_pi_${input.transactionId}_secret`,
        paymentIntentId: `mock_pi_${input.transactionId}`,
        amountCents: input.amountCents,
        currency: input.currency,
        mock: true,
      };
    }

    const metadata: Record<string, string> = {
      transaction_id: input.transactionId,
      inquiry_id: input.inquiryId,
      booking_id: input.bookingId,
    };
    const b = input.breakdown;
    if (b) {
      if (b.subtotalCents != null) metadata.subtotal_cents = String(b.subtotalCents);
      if (b.clientSurchargeCents != null) metadata.client_surcharge_cents = String(b.clientSurchargeCents);
      if (b.platformFeeCents != null) metadata.platform_fee_cents = String(b.platformFeeCents);
      if (b.workspaceFeeCents != null) metadata.workspace_fee_cents = String(b.workspaceFeeCents);
      if (b.talentNetCents != null) metadata.talent_net_cents = String(b.talentNetCents);
    }

    const params: Stripe.PaymentIntentCreateParams = {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      description: input.description ?? "Booking payment",
      receipt_email: input.payerEmail ?? undefined,
      // Idempotency at the booking-transaction grain keeps a double-open of the
      // drawer from minting two intents for the same invoice.
      metadata,
    };

    const intent = await stripe.paymentIntents.create(params, {
      idempotencyKey: `pi_txn_${input.transactionId}`,
    });

    if (!intent.client_secret) {
      return { ok: false, error: "Stripe returned no client secret." };
    }

    return {
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amountCents: input.amountCents,
      currency: input.currency,
    };
  } catch (err) {
    logServerError("payments.stripe.createPaymentIntentForTransaction", err);
    return { ok: false, error: "Failed to start payment." };
  }
}
