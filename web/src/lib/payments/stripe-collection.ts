/**
 * Stripe adapter at the existing Checkout boundary.
 *
 * Does not re-express payouts, Connect, or Terminal. Card-present is
 * unavailable until Mercado Pago Point lands (see terminal-availability.ts).
 */

import type Stripe from "stripe";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import type {
  CollectionAdapter,
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  PaymentRequestSnapshot,
  TerminalAvailability,
} from "@/lib/payments/collection";

export type StripeCollectionDeps = {
  stripe?: Stripe | null;
  retrieve?: (requestId: string) => Promise<PaymentRequestSnapshot | { ok: false; error: string }>;
  cancel?: (requestId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  refund?: (
    requestId: string,
    amountCents?: number,
  ) => Promise<{ ok: true; refundId: string } | { ok: false; error: string }>;
};

export function stripeCollectionAdapter(deps: StripeCollectionDeps = {}): CollectionAdapter {
  return {
    async createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatePaymentRequestResult> {
      if (input.method === "terminal") {
        return {
          ok: false,
          reason: "terminal_unavailable",
          error: "Card-present collection is unavailable until Point lands.",
        };
      }
      if (input.method === "cash") {
        return {
          ok: false,
          reason: "cash_is_recorded",
          error: "Cash is recorded as a payment method, not opened at Stripe.",
        };
      }
      const session = await createCheckoutSessionForTransaction(
        {
          transactionId: input.transactionId,
          amountCents: input.amountCents,
          currency: input.currency,
          payerEmail: input.payerEmail,
          inquiryId: input.inquiryId,
          bookingId: input.bookingId,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          description: input.description,
          locale: input.locale,
        },
        { stripe: deps.stripe },
      );
      if (!session.ok) {
        return { ok: false, reason: "engine_error", error: session.error };
      }
      return {
        ok: true,
        requestId: session.sessionId,
        state: "pending",
        checkoutUrl: session.url,
        mock: session.mock,
      };
    },
    retrieveState(requestId) {
      if (deps.retrieve) return deps.retrieve(requestId);
      return Promise.resolve({
        requestId,
        state: "unknown",
        amountCents: 0,
        currency: "USD",
      });
    },
    cancel(requestId) {
      if (deps.cancel) return deps.cancel(requestId);
      return Promise.resolve({ ok: true as const });
    },
    refund(requestId, amountCents) {
      if (deps.refund) return deps.refund(requestId, amountCents);
      return Promise.resolve({
        ok: false as const,
        error: "Refund this payment through its original Stripe route.",
      });
    },
    terminalAvailability(): TerminalAvailability {
      return reportTerminalAvailability();
    },
  };
}
