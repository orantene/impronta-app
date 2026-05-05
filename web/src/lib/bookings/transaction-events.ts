export type TransactionStatus =
  | "draft"
  | "payment_requested"
  | "pending"
  | "paid"
  | "payout_pending"
  | "payout_sent"
  | "cancelled"
  | "refunded"
  | "disputed"
  | "failed";

export type TransactionTransitionEvent = {
  eventType: string;
  visibility: "participants" | "staff_only";
  payload: Record<string, unknown>;
};

export function describeTransactionTransitionEvent(opts: {
  toStatus: TransactionStatus;
  fromStatus: string;
  grossAmountCents: number;
  netAmountCents: number;
  currency: string;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  refundTransactionId: string | null;
}): TransactionTransitionEvent {
  const {
    toStatus,
    fromStatus,
    grossAmountCents,
    netAmountCents,
    currency,
    provider,
    providerReference,
    failureReason,
    refundTransactionId,
  } = opts;

  if (toStatus === "payment_requested") {
    return {
      eventType: "payment.requested",
      visibility: "participants",
      payload: {
        gross_amount_cents: grossAmountCents,
        currency,
        provider,
      },
    };
  }
  if (toStatus === "pending") {
    return {
      eventType: "payment.pending",
      visibility: "staff_only",
      payload: {
        gross_amount_cents: grossAmountCents,
        currency,
        provider,
      },
    };
  }
  if (toStatus === "paid") {
    return {
      eventType: "payment.received",
      visibility: "participants",
      payload: {
        amount_cents: grossAmountCents,
        currency,
        provider_reference: providerReference,
      },
    };
  }
  if (toStatus === "payout_pending") {
    return {
      eventType: "payout.initiated",
      visibility: "staff_only",
      payload: {
        amount_cents: netAmountCents,
        provider,
      },
    };
  }
  if (toStatus === "payout_sent") {
    return {
      eventType: "payout.sent",
      visibility: "participants",
      payload: {
        amount_cents: netAmountCents,
        provider_reference: providerReference,
      },
    };
  }
  if (toStatus === "cancelled") {
    return {
      eventType: "payment.cancelled",
      visibility: "participants",
      payload: {
        reason: failureReason,
      },
    };
  }
  if (toStatus === "refunded") {
    return {
      eventType: "payment.refunded",
      visibility: "participants",
      payload: {
        amount_cents: grossAmountCents,
        refund_transaction_id: refundTransactionId,
      },
    };
  }
  if (toStatus === "disputed") {
    return {
      eventType: "payment.disputed",
      visibility: "staff_only",
      payload: {
        provider_reference: providerReference,
        reason: failureReason,
      },
    };
  }
  if (toStatus === "failed") {
    return {
      eventType: fromStatus === "payout_pending" ? "payout.failed" : "payment.failed",
      visibility: "staff_only",
      payload: {
        reason: failureReason,
      },
    };
  }

  return {
    eventType: `booking.payment.${toStatus}`,
    visibility: "staff_only",
    payload: {
      from_status: fromStatus,
      to_status: toStatus,
      provider,
    },
  };
}
