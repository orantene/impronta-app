/**
 * TUL-1232: how the Settings > Billing invoice list classifies a row. Display
 * only; no amount is touched. Stripe leaves a charge that failed on an
 * `open` invoice (retries pending) and only moves it to `uncollectible` when
 * retries end, so `open` plus at least one attempt IS a failed charge. The
 * provider register stores no decline text, so the reason shown is generic.
 */

export type InvoiceDisplayState = {
  failed: boolean;
  /** When Stripe will retry, for an invoice still open. */
  nextAttemptAt: string | null;
};

export function invoiceDisplayState(input: {
  status: string | null;
  attemptCount: number;
  nextAttemptAt?: string | null;
}): InvoiceDisplayState {
  const tried = (input.attemptCount ?? 0) > 0;
  const failed = tried && (input.status === "open" || input.status === "uncollectible");
  return {
    failed,
    nextAttemptAt: failed && input.status === "open" ? (input.nextAttemptAt ?? null) : null,
  };
}
