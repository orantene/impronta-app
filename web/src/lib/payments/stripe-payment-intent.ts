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
import { getStripeFor, getStripeMxPublishableKey, type StripeAccountKey } from "@/lib/stripe/client";
import { recordChargePlatform, resolveSellerPlatformForTransaction } from "@/lib/stripe/charge-platform";
import { paymentsMockAllowed } from "@/lib/payments/mock-guard";
import { logServerError } from "@/lib/server/safe-error";
import { sanitizeStatementDescriptorSuffix } from "@/lib/payments/statement-descriptor";

export type PaymentIntentInput = {
  transactionId: string;
  /** What the client is charged, in cents = gross_charged (subtotal + surcharge). */
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  inquiryId: string;
  bookingId: string;
  description?: string;
  /** Public display name of the talent/workspace; becomes the card statement suffix. */
  payeeName?: string | null;
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
      /** Publishable key of the platform that took the charge (MX differs from US). */
      publishableKey?: string | null;
      stripePlatform?: StripeAccountKey;
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
  /** Test seam: inject the platform and/or client; production passes nothing. */
  deps: { platform?: StripeAccountKey; stripe?: Stripe | null } = {},
): Promise<PaymentIntentResult> {
  try {
    if (input.amountCents <= 0) {
      return { ok: false, error: "Amount must be positive." };
    }

    // The seller of record's platform decides which Stripe account takes the
    // charge (default 'us' = unchanged behaviour).
    const platform =
      deps.platform ?? (deps.stripe !== undefined ? "us" : await resolveSellerPlatformForTransaction(input.transactionId));
    const stripe = deps.stripe !== undefined ? deps.stripe : getStripeFor(platform);
    const publishableKey =
      platform === "mx" ? getStripeMxPublishableKey() : (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null);
    // An MX charge never mocks: a mocked "paid" state for a real MX seller would
    // be a lie, so a missing MX key/publishable key is an error.
    if (platform === "mx" && (!stripe || !publishableKey)) {
      return { ok: false, error: "Payments for this seller are not available right now." };
    }
    // The embedded Payment Element cannot render without the PUBLISHABLE key
    // on the client. If either key is absent we mock — a real PaymentIntent
    // with no publishable key would strand the client on a config error.
    const hasPublishableKey = !!publishableKey;
    if ((!stripe || !hasPublishableKey) && !paymentsMockAllowed()) {
      console.error("[payments] Stripe keys missing in production; refusing mock payment intent", { transactionId: input.transactionId });
      return { ok: false, error: "Payments are not configured." };
    }
    if (!stripe || !hasPublishableKey) {
      // Mock mode — no usable live keys. Hand back a synthetic client secret
      // the drawer recognises (prefix `mock_pi_`) so it can simulate the confirm.
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
      ...(sanitizeStatementDescriptorSuffix(input.payeeName)
        ? { statement_descriptor_suffix: sanitizeStatementDescriptorSuffix(input.payeeName) }
        : {}),
      // NOTE: receipt_email is intentionally NOT set. The app sends its own
      // branded, bilingual "Payment received" receipt (notification entry
      // payment.received → client.payment_receipt) and logs it in the platform
      // email console. Setting receipt_email would make Stripe send a SECOND,
      // unbranded receipt — the duplicate we're removing. (Belt-and-suspenders:
      // also turn off Stripe Dashboard → Settings → Customer emails →
      // "Successful payments".)
      // Idempotency at the booking-transaction grain keeps a double-open of the
      // drawer from minting two intents for the same invoice.
      metadata,
    };

    // Fail closed: record the platform before the charge can exist.
    if (!(await recordChargePlatform(input.transactionId, platform))) {
      return { ok: false, error: "Failed to start payment." };
    }
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
      publishableKey,
      stripePlatform: platform,
    };
  } catch (err) {
    logServerError("payments.stripe.createPaymentIntentForTransaction", err);
    return { ok: false, error: "Failed to start payment." };
  }
}
