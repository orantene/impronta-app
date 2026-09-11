/**
 * P4 — the small collection interface POS needs.
 *
 * Not a rewrite of Stripe. Create a payment request, retrieve its state,
 * cancel it, refund it, report terminal availability. Existing Stripe
 * Checkout stays at `createCheckoutSessionForTransaction`.
 */

export type CollectionMethod = "online_card" | "cash" | "terminal";

export type PaymentRequestState =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded"
  | "unknown";

export type CreatePaymentRequestInput = {
  transactionId: string;
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  inquiryId: string | null;
  bookingId: string;
  successUrl: string;
  cancelUrl: string;
  description?: string;
  locale?: string | null;
  method: CollectionMethod;
  /**
   * When the provider must stop accepting this payment, ISO-8601.
   *
   * Absent means the provider's own default, which for hosted Stripe Checkout
   * is about 24 hours. A POS collection holds a claim on the order's balance
   * for far less than that, and a session that outlives its claim is how the
   * same money was taken twice: the reaper freed the balance, a second till
   * took it, and the first customer's page still worked.
   */
  expiresAt?: string | null;
};

export type CreatePaymentRequestResult =
  | {
      ok: true;
      requestId: string;
      state: PaymentRequestState;
      checkoutUrl?: string;
      mock?: boolean;
    }
  | { ok: false; reason: "terminal_unavailable" | "cash_is_recorded" | "engine_error"; error: string };

export type PaymentRequestSnapshot = {
  requestId: string;
  state: PaymentRequestState;
  amountCents: number;
  currency: string;
  /**
   * The provider's own reference for the money that moved, when it moved.
   *
   * A request id names what we ASKED FOR; this names what HAPPENED. Stripe
   * keeps them apart on purpose — the hosted Checkout session carries our
   * metadata, and the PaymentIntent underneath it is what a refund is issued
   * against — and `markPaid` cannot link a transaction back to its charge
   * without it. A lookup that answered `succeeded` and dropped this would
   * complete the order and leave it unrefundable, which is a worse place to be
   * than not knowing at all.
   *
   * Null on any state where no money moved.
   */
  paymentReference?: string | null;
};

export type TerminalAvailability =
  | { available: true; provider: "mercado_pago_point" | "stripe_terminal" }
  | {
      available: false;
      reason:
        | "point_not_landed"
        | "stripe_terminal_not_supported"
        | "stripe_terminal_missing_keys"
        | "stripe_terminal_missing_reader";
    };

export type CollectionAdapter = {
  createPaymentRequest(
    input: CreatePaymentRequestInput,
  ): Promise<CreatePaymentRequestResult>;
  retrieveState(requestId: string): Promise<PaymentRequestSnapshot | { ok: false; error: string }>;
  cancel(requestId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  refund(
    requestId: string,
    amountCents?: number,
  ): Promise<{ ok: true; refundId: string } | { ok: false; error: string }>;
  terminalAvailability(): TerminalAvailability;
};
