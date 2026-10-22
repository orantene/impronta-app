/**
 * TUL-1232: how the Settings > Billing invoice list classifies a row. Display
 * only; no amount is touched. Stripe leaves a charge that failed on an
 * `open` invoice (retries pending) and only moves it to `uncollectible` when
 * retries end, so `open` plus at least one attempt IS a failed charge, unless the PaymentIntent is waiting on a 3DS step (`requires_action`), which is "needs action". The
 * provider register stores no decline text, so the reason shown is generic.
 */

export type InvoiceDisplayState = {
  failed: boolean;
  /** The bank wants an authentication step (3DS): not a decline. */
  needsAction: boolean;
  /** When Stripe will retry, for an invoice still open. */
  nextAttemptAt: string | null;
};

export function invoiceDisplayState(input: {
  status: string | null;
  attemptCount: number;
  nextAttemptAt?: string | null;
  /** The invoice's PaymentIntent status, when known. */
  intentStatus?: string | null;
}): InvoiceDisplayState {
  const tried = (input.attemptCount ?? 0) > 0;
  const unpaid = tried && (input.status === "open" || input.status === "uncollectible");
  const needsAction =
    unpaid && input.status === "open" && (input.intentStatus === "requires_action" || input.intentStatus === "requires_confirmation");
  return {
    failed: unpaid && !needsAction,
    needsAction,
    nextAttemptAt: unpaid && input.status === "open" ? (input.nextAttemptAt ?? null) : null,
  };
}

/**
 * TUL-834: a $0 invoice that Stripe raises when a subscription starts on a
 * trial or a 100% promo is bookkeeping, not a bill. It is hidden from the
 * Settings > Billing list. A $0 row that is still open or failed is kept so
 * a real problem never disappears.
 */
export function isZeroNoChargeInvoice(input: {
  status: string | null;
  totalCents: number;
  attemptCount?: number | null;
}): boolean {
  return (
    input.totalCents === 0 &&
    (input.status === "paid" || input.status === "void") &&
    (input.attemptCount ?? 0) === 0
  );
}
