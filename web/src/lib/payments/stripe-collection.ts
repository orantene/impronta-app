/**
 * Stripe adapter at the existing Checkout boundary.
 *
 * Does not re-express payouts or Connect. Card-present uses stripe-terminal.ts;
 * missing keys and missing hardware are distinct from missing code.
 */

import type Stripe from "stripe";
import { createCheckoutSessionForTransaction, getStripe } from "@/lib/payments/stripe-checkout";
import { logServerError } from "@/lib/server/safe-error";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import { createStripeTerminalPaymentRequest } from "@/lib/payments/stripe-terminal";
import type {
  CollectionAdapter,
  CreatePaymentRequestInput,
  CreatePaymentRequestResult,
  PaymentRequestSnapshot,
  PaymentRequestState,
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
        return createStripeTerminalPaymentRequest(input);
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
          expiresAt: input.expiresAt,
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
      return retrieveCheckoutSessionState(requestId, {
        stripe: deps.stripe,
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


/**
 * The prefix `createCheckoutSessionForTransaction` mints when Stripe is not
 * configured. Nothing exists at the provider behind one of these, so asking is
 * not "the answer was unknown" — it is "there was never a request".
 */
const MOCK_REQUEST_PREFIX = "mock_";

/**
 * A Checkout session's two status fields, mapped onto the states the engine
 * already understands.
 *
 * PURE, AND SEPARATE FROM THE FETCH, because this mapping is the whole risk in
 * the lookup and it is the part a Stripe account cannot be borrowed to test.
 *
 * THERE IS NO `failed` FOR A CHECKOUT SESSION, and inventing one would be the
 * expensive mistake. A declined card leaves the session `open`: the buyer is
 * still on the page and may try another card, so the money may STILL move.
 * Reporting that as `failed` would hand the balance back to the till while the
 * customer completes the very same session, which is the double take this whole
 * mechanism exists to close. The only session state in which nothing can ever
 * be collected is `expired`, and that maps to `cancelled`.
 *
 * `complete` with `unpaid` is likewise NOT a failure: it is an asynchronous
 * method still clearing. It stays `pending` and gets asked again.
 */
export function mapCheckoutSessionState(session: {
  status?: string | null;
  payment_status?: string | null;
}): PaymentRequestState {
  const status = session.status ?? null;
  const paid = session.payment_status ?? null;
  if (status === "expired") return "cancelled";
  if (status === "open") return "pending";
  if (status === "complete") {
    if (paid === "paid" || paid === "no_payment_required") return "succeeded";
    if (paid === "unpaid") return "pending";
    return "unknown";
  }
  return "unknown";
}

/** The `pi_...` under a session, however Stripe chose to serialise it. */
function paymentIntentIdOf(raw: unknown): string | null {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (raw && typeof raw === "object") {
    const id = (raw as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

/**
 * Ask Stripe what became of a Checkout session.
 *
 * THIS USED TO RETURN `unknown` UNCONDITIONALLY, and that stub is what made a
 * lost response unrecoverable: the exceptions inbox could only advise a person
 * to walk to the terminal, because no code in the repository could ask the
 * provider. The provider is the authority on whether the money moved; we are
 * not, and the only honest way to find out is to ask.
 *
 * A FAILURE TO ASK IS NOT AN ANSWER. Every path that cannot reach Stripe — no
 * key, a mock request id, a network error — returns `{ ok: false }` rather than
 * a snapshot saying `unknown`, because a caller that releases a balance or
 * completes an order must be able to tell "the provider says nothing happened"
 * from "we could not ask".
 */
export async function retrieveCheckoutSessionState(
  requestId: string,
  deps: { stripe?: Stripe | null } = {},
): Promise<PaymentRequestSnapshot | { ok: false; error: string }> {
  if (requestId.startsWith(MOCK_REQUEST_PREFIX)) {
    return {
      ok: false as const,
      error: "This collection was opened without Stripe configured, so there is nothing to ask about.",
    };
  }
  const stripe = deps.stripe !== undefined ? deps.stripe : getStripe();
  if (!stripe) {
    return { ok: false as const, error: "Stripe is not configured, so the payment cannot be looked up." };
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(requestId);
    const state = mapCheckoutSessionState(session);
    return {
      requestId: session.id ?? requestId,
      state,
      amountCents: Math.trunc(Number(session.amount_total ?? 0)),
      currency: String(session.currency ?? "").toUpperCase(),
      // Only where money actually moved. A pending session's PaymentIntent is
      // not a settlement reference and recording it as one would say a charge
      // exists that does not.
      paymentReference: state === "succeeded" ? paymentIntentIdOf(session.payment_intent) : null,
    };
  } catch (err) {
    logServerError("payments.stripe.retrieveCheckoutSessionState", err);
    return { ok: false as const, error: "Stripe did not answer about this payment." };
  }
}
