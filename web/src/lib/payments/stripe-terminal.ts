/**
 * F13 — Stripe Terminal code path, distinct from missing keys and missing hardware.
 *
 * Checkout and cash stay on the existing adapters. This module does not
 * subscribe the live Stripe webhook endpoint; refund.failed / refund.updated
 * handlers already exist in webhook-routing.ts and wait on Dashboard ops.
 */

import type {
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  TerminalAvailability,
} from "@/lib/payments/collection";

export type StripeTerminalEnv = {
  secretKey?: string | null;
  readerId?: string | null;
};

export function stripeTerminalSupported(): boolean {
  return true;
}

export function reportStripeTerminalAvailability(
  env: StripeTerminalEnv = {
    secretKey: process.env.STRIPE_SECRET_KEY ?? null,
    readerId: process.env.STRIPE_TERMINAL_READER_ID ?? null,
  },
): TerminalAvailability {
  if (!env.secretKey?.trim()) {
    return { available: false, reason: "stripe_terminal_missing_keys" };
  }
  if (!env.readerId?.trim()) {
    return { available: false, reason: "stripe_terminal_missing_reader" };
  }
  return { available: true, provider: "stripe_terminal" };
}

/**
 * Card-present PaymentIntent. Refuses when keys or a reader are missing so
 * token presence alone is not treated as readiness.
 */
export async function createStripeTerminalPaymentRequest(
  input: CreatePaymentRequestInput,
  env: StripeTerminalEnv = {
    secretKey: process.env.STRIPE_SECRET_KEY ?? null,
    readerId: process.env.STRIPE_TERMINAL_READER_ID ?? null,
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CreatePaymentRequestResult> {
  const availability = reportStripeTerminalAvailability(env);
  if (!availability.available) {
    return {
      ok: false,
      reason: "terminal_unavailable",
      error:
        availability.reason === "stripe_terminal_missing_keys"
          ? "Stripe Terminal keys are not configured."
          : "No Stripe Terminal reader is assigned.",
    };
  }
  const res = await fetchImpl("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.secretKey!.trim()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `st_pi_${input.transactionId}`,
    },
    body: new URLSearchParams({
      amount: String(input.amountCents),
      currency: input.currency.toLowerCase(),
      "payment_method_types[0]": "card_present",
      "metadata[transaction_id]": input.transactionId,
      capture_method: "automatic",
    }),
  });
  if (!res.ok) {
    return { ok: false, reason: "engine_error", error: "Stripe did not create a Terminal payment." };
  }
  const body = (await res.json()) as { id?: string; status?: string };
  if (!body.id) {
    return { ok: false, reason: "engine_error", error: "Stripe returned no payment intent." };
  }
  return { ok: true, requestId: body.id, state: body.status === "succeeded" ? "succeeded" : "pending" };
}
