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
};

export type TerminalAvailability =
  | { available: true; provider: "mercado_pago_point" }
  | {
      available: false;
      reason: "point_not_landed" | "stripe_terminal_not_supported";
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
